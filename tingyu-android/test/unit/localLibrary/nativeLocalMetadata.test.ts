import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalSong } from '../../../src/types';
import { parseBuffer } from 'music-metadata';

// test/unit/localLibrary/nativeLocalMetadata.test.ts
// 覆盖安卓本地歌的标签补全链路：按 ref 读头部字节 → 解析 → 写进歌曲记录。
// 关键是「分档读取」：先用 512KB，拿不到有效标签才放大到 4MB —— 既不让大文件整首进内存，
// 又不会因为标签落在 512KB 之后而永远读不到。

const readNativeAudioBytes = vi.fn();
const readNativeEmbeddedCover = vi.fn();
const readNativeLyricSidecar = vi.fn();

vi.mock('../../../src/services/nativeLocalMusic', () => ({
    readNativeAudioBytes: (...args: unknown[]) => readNativeAudioBytes(...args),
    readNativeEmbeddedCover: (...args: unknown[]) => readNativeEmbeddedCover(...args),
    readNativeLyricSidecar: (...args: unknown[]) => readNativeLyricSidecar(...args),
}));

/** 用真正的解析库跑 mock 过的 worker 入口：行为与设备上一致，只是省掉 Worker 传输。 */
vi.mock('../../../src/utils/localMetadataWorkerClient', () => ({
    parseEmbeddedMetadataAsync: async (file: File, includeCover: boolean) => {
        // vi.mock 的工厂会被提升到文件顶部，所以辅助函数只能定义在工厂内部。
        // 复制进独立 ArrayBuffer：TS 5.7 起 Uint8Array<ArrayBufferLike> 不能直接当 BlobPart。
        const copyToArrayBuffer = (source: Uint8Array): Uint8Array<ArrayBuffer> => {
            const copy = new Uint8Array(new ArrayBuffer(source.length));
            copy.set(source);
            return copy;
        };
        const bytes = new Uint8Array(await file.arrayBuffer());
        const parsed = await parseBuffer(bytes, { mimeType: file.type || 'audio/wav', size: bytes.length });
        const picture = includeCover ? parsed.common.picture?.[0] : undefined;
        return {
            title: parsed.common.title,
            artist: parsed.common.artist,
            album: parsed.common.album,
            trackNumber: parsed.common.track.no ?? undefined,
            discNumber: parsed.common.disk.no ?? undefined,
            lyrics: parsed.common.lyrics?.[0]?.text,
            cover: picture ? new Blob([copyToArrayBuffer(picture.data)], { type: picture.format }) : undefined,
            coverAssetId: picture ? 'sha256:fixture' : undefined,
        };
    },
}));

// ---- 测试用的 WAV + ID3v2.3 构造（与 embeddedTagParsing.test.ts 同源，这里需要控制标签位置） ----

const be32 = (value: number): Uint8Array => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value >>> 0, false);
    return bytes;
};
const le32 = (value: number): Uint8Array => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
    return bytes;
};
const syncSafe = (value: number): Uint8Array => new Uint8Array([
    (value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f,
]);
const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(new ArrayBuffer(parts.reduce((sum, part) => sum + part.length, 0)));
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
};
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const frame = (id: string, payload: Uint8Array): Uint8Array<ArrayBuffer> => concat([
    enc(id), be32(payload.length), new Uint8Array([0, 0]), payload,
]);
const textFrame = (id: string, text: string): Uint8Array<ArrayBuffer> => frame(id, concat([new Uint8Array([3]), enc(text)]));

const buildTaggedWav = (options: { title?: string; lyrics?: string; padding?: number; track?: string; }): Uint8Array<ArrayBuffer> => {
    const frames: Uint8Array[] = [];
    if (options.title) frames.push(textFrame('TIT2', options.title));
    if (options.track) frames.push(textFrame('TRCK', options.track));
    if (options.lyrics) {
        frames.push(frame('USLT', concat([new Uint8Array([3]), enc('chi'), new Uint8Array([0]), enc(options.lyrics)])));
    }
    const body = concat(frames);
    const id3 = concat([enc('ID3'), new Uint8Array([3, 0, 0]), syncSafe(body.length), body]);
    const fmt = new Uint8Array(16);
    const fmtView = new DataView(fmt.buffer);
    fmtView.setUint16(0, 1, true); fmtView.setUint16(2, 1, true);
    fmtView.setUint32(4, 44100, true); fmtView.setUint32(8, 88200, true);
    fmtView.setUint16(12, 2, true); fmtView.setUint16(14, 16, true);
    const wavChunk = (id: string, chunkBody: Uint8Array): Uint8Array<ArrayBuffer> => concat([enc(id), le32(chunkBody.length), chunkBody]);
    const payload = concat([
        enc('WAVE'),
        wavChunk('fmt ', fmt),
        wavChunk('data', new Uint8Array(Math.max(64, options.padding ?? 0))),
        wavChunk('id3 ', id3),
    ]);
    return concat([enc('RIFF'), le32(payload.length), payload]);
};

const makeSong = (patch: Partial<LocalSong> = {}): LocalSong => ({
    id: 'android-media-1',
    fileName: 'track.mp3',
    filePath: 'Android/MediaStore/1',
    nativeAudioRef: '1',
    duration: 180_000,
    fileSize: 8_000_000,
    mimeType: 'audio/wav',
    addedAt: 1,
    title: '媒体库标题',
    titleOrigin: 'import',
    importedMetadata: {
        title: '媒体库标题',
        titleSource: 'filename',
        artistNames: ['媒体库艺术家'],
        albumName: '媒体库专辑',
    },
    hasManualLyricSelection: false,
    noAutoMatch: false,
    ...patch,
});

beforeEach(() => {
    readNativeAudioBytes.mockReset();
    readNativeEmbeddedCover.mockReset();
    readNativeLyricSidecar.mockReset();
    readNativeEmbeddedCover.mockResolvedValue(null);
    readNativeLyricSidecar.mockResolvedValue(null);
    // nativeLocalMetadata 的批量落库会发事件；node 环境里没有 window。
    (globalThis as unknown as { window: unknown }).window = {
        dispatchEvent: () => true,
        addEventListener: () => {},
        removeEventListener: () => {},
    };
});

describe('applyEmbeddedMetadataToSong', () => {
    it('内嵌标签优先于媒体库给的值', async () => {
        const { applyEmbeddedMetadataToSong } = await import('../../../src/services/nativeLocalMetadata');
        const next = applyEmbeddedMetadataToSong(makeSong(), {
            title: '内嵌标题',
            artist: '内嵌艺术家',
            album: '内嵌专辑',
            trackNumber: 4,
            discNumber: 1,
            lyrics: '[00:01.00]歌词',
        });

        expect(next.title).toBe('内嵌标题');
        expect(next.importedMetadata.artistNames).toEqual(['内嵌艺术家']);
        expect(next.importedMetadata.albumName).toBe('内嵌专辑');
        expect(next.trackNumber).toBe(4);
        expect(next.discNumber).toBe(1);
        expect(next.hasEmbeddedLyrics).toBe(true);
        expect(next.embeddedLyricsContent).toContain('歌词');
    });

    it('解析不到的字段保持原值，不把媒体库的标题清空', async () => {
        const { applyEmbeddedMetadataToSong } = await import('../../../src/services/nativeLocalMetadata');
        const next = applyEmbeddedMetadataToSong(makeSong(), {});

        expect(next.title).toBe('媒体库标题');
        expect(next.importedMetadata.artistNames).toEqual(['媒体库艺术家']);
        expect(next.trackNumber).toBeUndefined();
    });

    it('用户已选「优先在线封面」时不覆盖本地封面', async () => {
        const { applyEmbeddedMetadataToSong } = await import('../../../src/services/nativeLocalMetadata');
        const next = applyEmbeddedMetadataToSong(makeSong({ useOnlineCover: true }), {
            cover: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
            coverAssetId: 'sha256:abc',
        });

        expect(next.localCoverAssetId).toBeUndefined();
    });
});

describe('parseNativeSongMetadata 的分档读取', () => {
    it('标签在 512KB 内时只读一档就返回', async () => {
        const { parseNativeSongMetadata } = await import('../../../src/services/nativeLocalMetadata');
        const wav = buildTaggedWav({ title: '小文件', lyrics: '[00:01.00]短歌词' });
        readNativeAudioBytes.mockResolvedValue({ bytes: wav, read: wav.length, total: wav.length });

        const parsed = await parseNativeSongMetadata(makeSong(), { includeCover: false });

        expect(parsed?.metadata.lyrics).toContain('短歌词');
        // 整个文件一次读完，没有再申请更大的块。
        expect(readNativeAudioBytes).toHaveBeenCalledTimes(1);
        expect(readNativeAudioBytes.mock.calls[0][2]).toBe(512 * 1024);
    });

    it('标签落在 512KB 之后时自动放大到 4MB —— 大文件也不会整首进内存', async () => {
        const { parseNativeSongMetadata } = await import('../../../src/services/nativeLocalMetadata');
        const wav = buildTaggedWav({ title: '大文件', lyrics: '[00:01.00]很靠后的歌词', padding: 1024 * 1024 });
        // 模拟真实情况：第一档只回前 512KB，第二档回全量。
        readNativeAudioBytes.mockImplementation(async (_ref: string, _offset: number, length: number) => {
            const slice = wav.slice(0, Math.min(length, wav.length));
            return { bytes: slice, read: slice.length, total: wav.length };
        });

        const parsed = await parseNativeSongMetadata(makeSong(), { includeCover: false });

        expect(parsed?.metadata.lyrics).toContain('很靠后的歌词');
        expect(readNativeAudioBytes).toHaveBeenCalledTimes(2);
        expect(readNativeAudioBytes.mock.calls[1][2]).toBe(4 * 1024 * 1024);
    });

    it('原生读不到字节时返回 null，不抛错（播放链路不依赖标签）', async () => {
        const { parseNativeSongMetadata } = await import('../../../src/services/nativeLocalMetadata');
        readNativeAudioBytes.mockRejectedValue(new Error('file deleted'));

        await expect(parseNativeSongMetadata(makeSong(), { includeCover: false })).resolves.toBeNull();
    });
});

describe('hydrateNativeSongs 的贯穿式取消', () => {
    it('isCancelled 翻转后立即停止剩余歌曲，不再读取文件（卸载/重载不再白白占用 IO）', async () => {
        const { hydrateNativeSongs } = await import('../../../src/services/nativeLocalMetadata');
        const wav = buildTaggedWav({ title: '批量取消' });
        readNativeAudioBytes.mockResolvedValue({ bytes: wav, read: wav.length, total: wav.length });
        const songs = Array.from({ length: 5 }, (_, index) => makeSong({ id: `song-${index}` }));
        // 第一轮循环检查放行（处理第 1 首），之后一直取消：并发 1 保证断言确定。
        let checked = 0;
        const stats = await hydrateNativeSongs(songs, {
            limit: 5, concurrency: 1,
            isCancelled: () => { checked += 1; return checked > 1; },
        });

        expect(stats.hydrated).toBe(1);
        expect(readNativeAudioBytes).toHaveBeenCalledTimes(1);
        expect(stats.failed).toBe(0);
    });

    it('取消时已解析完的部分照常落库，下次启动从 findNativeSongsNeedingHydration 继续', async () => {
        const { hydrateNativeSongs, findNativeSongsNeedingHydration } = await import('../../../src/services/nativeLocalMetadata');
        const wav = buildTaggedWav({ title: '进度保留', lyrics: '[00:01.00]已补全' });
        readNativeAudioBytes.mockResolvedValue({ bytes: wav, read: wav.length, total: wav.length });
        const songs = Array.from({ length: 4 }, (_, index) => makeSong({ id: `keep-${index}` }));

        const stats = await hydrateNativeSongs(songs, {
            limit: 4, concurrency: 1,
            isCancelled: (() => { let calls = 0; return () => { calls += 1; return calls > 1; }; })(),
        });

        expect(stats.hydrated).toBe(1);
        // 已落库的那首带上了新版本号：重新查询「待补全」列表时不再包含它。
        const pending = await findNativeSongsNeedingHydration();
        expect(pending.some(song => song.id.startsWith('keep-'))).toBe(false);
    });

    it('正常路径不受取消机制影响：全部处理并分批落库', async () => {
        const { hydrateNativeSongs } = await import('../../../src/services/nativeLocalMetadata');
        const wav = buildTaggedWav({ title: '完整批' });
        readNativeAudioBytes.mockResolvedValue({ bytes: wav, read: wav.length, total: wav.length });
        const songs = Array.from({ length: 3 }, (_, index) => makeSong({ id: `full-${index}` }));

        const stats = await hydrateNativeSongs(songs, { limit: 3, concurrency: 2, isCancelled: () => false });

        expect(stats.hydrated).toBe(3);
        expect(readNativeAudioBytes).toHaveBeenCalledTimes(3);
    });
});

describe('hydrateNativeSong 的兜底顺序', () => {
    it('内嵌歌词与同名外挂歌词都在时，外挂那份作为「本地歌词」保留（与全局优先级 本地 > 内嵌 > 在线 一致）', async () => {
        const { hydrateNativeSong } = await import('../../../src/services/nativeLocalMetadata');
        const wav = buildTaggedWav({ title: '有内嵌歌词', lyrics: '[00:01.00]内嵌' });
        readNativeAudioBytes.mockResolvedValue({ bytes: wav, read: wav.length, total: wav.length });
        readNativeLyricSidecar.mockResolvedValue({ content: '[00:01.00]外挂', origin: 'sidecar' });

        const song = await hydrateNativeSong(makeSong());

        // 内嵌那份必须留在记录里：用户把「歌词优先级」调成「内嵌优先」时还要用得上。
        expect(song.embeddedLyricsContent).toContain('内嵌');
        expect(song.hasEmbeddedLyrics).toBe(true);
        expect(song.localLyricsContent).toContain('外挂');
        expect(song.localLyricsOrigin).toBe('sidecar');
    });

    it('没有内嵌歌词时用同名 .lrc 补上（断网也有歌词）', async () => {
        const { hydrateNativeSong } = await import('../../../src/services/nativeLocalMetadata');
        const wav = buildTaggedWav({ title: '只有外挂歌词' });
        readNativeAudioBytes.mockResolvedValue({ bytes: wav, read: wav.length, total: wav.length });
        readNativeLyricSidecar.mockResolvedValue({ content: '[00:01.00]外挂歌词', origin: 'sidecar' });

        const song = await hydrateNativeSong(makeSong());

        expect(song.hasLocalLyrics).toBe(true);
        expect(song.localLyricsContent).toContain('外挂歌词');
        expect(song.localLyricsOrigin).toBe('sidecar');
    });

    it('用户手动抬过的歌词不被外挂歌词覆盖', async () => {
        const { hydrateNativeSong } = await import('../../../src/services/nativeLocalMetadata');
        const wav = buildTaggedWav({ title: '手动歌词' });
        readNativeAudioBytes.mockResolvedValue({ bytes: wav, read: wav.length, total: wav.length });
        readNativeLyricSidecar.mockResolvedValue({ content: '[00:01.00]外挂', origin: 'sidecar' });

        const song = await hydrateNativeSong(makeSong({
            hasLocalLyrics: true,
            localLyricsContent: '[00:01.00]用户上传',
            localLyricsOrigin: 'upload',
        }));

        expect(song.localLyricsContent).toBe('[00:01.00]用户上传');
        expect(readNativeLyricSidecar).not.toHaveBeenCalled();
    });
});


it('persists source format evidence through Android hydration and IndexedDB', async () => {
    const { applyEmbeddedMetadataToSong } = await import('../../../src/services/nativeLocalMetadata');
    const { saveLocalSong, getLocalSong } = await import('../../../src/services/db');
    const evidence = { sampleRate: 96000, bitDepth: 24, codec: 'FLAC', lossless: true };
    const enriched = applyEmbeddedMetadataToSong(makeSong(), evidence);
    await saveLocalSong(enriched);
    expect(await getLocalSong(enriched.id)).toMatchObject(evidence);
    expect(applyEmbeddedMetadataToSong(enriched, {})).toMatchObject(evidence);
    expect(applyEmbeddedMetadataToSong(enriched, { sampleRate: NaN, bitDepth: -1 })).toMatchObject(evidence);
    expect(applyEmbeddedMetadataToSong(enriched, { lossless: false }).lossless).toBe(false);
});
