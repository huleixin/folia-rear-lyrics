import { describe, expect, it, beforeAll } from 'vitest';

// test/unit/localLibrary/embeddedTagParsing.test.ts
// 验证「听屿现有的标签解析器」到底能不能读内嵌歌词与封面 —— 决定要不要从旧播放器移植
// LyricsTagReader / ApeTagReader。
//
// 做法是直接驱动 src/workers/metadataParser.worker.ts（设备上真正跑的就是它），
// 用一段手工拼出来的 WAV + ID3v2.3 标签当输入：ID3v2.3 的 USLT（内嵌歌词）、
// APIC（封面）、TIT2/TPE1/TALB/TRCK 全在里面。旧播放器的 LyricsTagReader 就是为这些帧写的。

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
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
]);
const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(new ArrayBuffer(total));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
};
const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** ID3v2.3 帧：4 字节 id + 4 字节大端长度 + 2 字节 flags + 载荷。 */
const id3Frame = (id: string, payload: Uint8Array): Uint8Array => concat([
    ascii(id), be32(payload.length), new Uint8Array([0, 0]), payload,
]);
/** 编码字节 3 = UTF-8；这样中文不需要走 GBK 兜底，先把「能不能读」和「编码」解耦。 */
const id3Text = (text: string): Uint8Array => concat([new Uint8Array([3]), utf8(text)]);
const id3Uslt = (text: string, language = 'chi'): Uint8Array => concat([
    new Uint8Array([3]), ascii(language), new Uint8Array([0]), utf8(text),
]);
const id3Apic = (mime: string, data: Uint8Array): Uint8Array => concat([
    new Uint8Array([3]), ascii(mime), new Uint8Array([0, 3]), utf8('cover'), new Uint8Array([0]), data,
]);

const JPEG_BYTES = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
]);

const buildId3Tag = (options: {
    title?: string;
    artist?: string;
    album?: string;
    track?: string;
    lyrics?: string;
    cover?: Uint8Array;
}): Uint8Array<ArrayBuffer> => {
    const frames: Uint8Array[] = [];
    if (options.title) frames.push(id3Frame('TIT2', id3Text(options.title)));
    if (options.artist) frames.push(id3Frame('TPE1', id3Text(options.artist)));
    if (options.album) frames.push(id3Frame('TALB', id3Text(options.album)));
    if (options.track) frames.push(id3Frame('TRCK', id3Text(options.track)));
    if (options.lyrics) frames.push(id3Frame('USLT', id3Uslt(options.lyrics)));
    if (options.cover) frames.push(id3Frame('APIC', id3Apic('image/jpeg', options.cover)));
    const body = concat(frames);
    return concat([ascii('ID3'), new Uint8Array([3, 0, 0]), syncSafe(body.length), body]);
};

/** 一段 RIFF/WAVE：fmt + data + `id3 ` chunk。旧播放器的 LyricsTagReader 也读这个 chunk。 */
const buildWavWithId3 = (id3: Uint8Array, paddingBytes = 0): Uint8Array<ArrayBuffer> => {
    const fmt = new Uint8Array(16);
    const fmtView = new DataView(fmt.buffer);
    fmtView.setUint16(0, 1, true);
    fmtView.setUint16(2, 1, true);
    fmtView.setUint32(4, 44100, true);
    fmtView.setUint32(8, 88200, true);
    fmtView.setUint16(12, 2, true);
    fmtView.setUint16(14, 16, true);
    const wavChunk = (id: string, body: Uint8Array): Uint8Array<ArrayBuffer> => concat([ascii(id), le32(body.length), body]);
    // paddingBytes 用来把 id3 chunk 推到大文件尾部，验证「只读文件头」时读不到、放大预算后才读到。
    const payload = concat([
        ascii('WAVE'),
        wavChunk('fmt ', fmt),
        wavChunk('data', new Uint8Array(Math.max(64, paddingBytes))),
        wavChunk('id3 ', id3),
    ]);
    return concat([ascii('RIFF'), le32(payload.length), payload]);
};

type WorkerResult = { type: 'result' | 'error'; data?: Record<string, unknown>; message?: string; };

/**
 * 直接驱动 worker 模块。
 *
 * worker 只在模块顶层挂 `self.onmessage`，所以先把 `self` 换成一个能收集 postMessage 的壳，
 * 再 import；随后按真实消息形状调一次。这样测的是设备上真正跑的那份代码，不是重写的一份。
 */
let parseWithWorker: (file: File, includeCover: boolean) => Promise<WorkerResult>;

beforeAll(async () => {
    const pending: WorkerResult[] = [];
    (globalThis as unknown as { self: unknown }).self = {
        onmessage: null as null | ((event: { data: unknown }) => Promise<void>),
        postMessage: (message: WorkerResult) => { pending.push(message); },
    };
    await import('../../../src/workers/metadataParser.worker');
    const host = (globalThis as unknown as { self: { onmessage: (event: { data: unknown }) => Promise<void>; } }).self;
    parseWithWorker = async (file: File, includeCover: boolean) => {
        pending.length = 0;
        await host.onmessage({ data: { type: 'parse-metadata', file, includeCover, requestId: 'test' } });
        return pending[0];
    };
});

describe('现有标签解析器：ID3v2 内嵌歌词与封面', () => {
    it('读得出 USLT 内嵌歌词（LyricsTagReader 的核心能力）', async () => {
        const lyrics = '[00:01.00]第一行歌词\n[00:05.00]第二行歌词';
        const wav = buildWavWithId3(buildId3Tag({ title: '内嵌标题', lyrics }));
        const result = await parseWithWorker(new File([wav], 'tagged.wav', { type: 'audio/wav' }), false);

        expect(result.type).toBe('result');
        expect(result.data?.lyrics).toContain('第一行歌词');
        expect(result.data?.lyrics).toContain('[00:05.00]');
    });

    it('读得出 APIC 内嵌封面并给出内容哈希', async () => {
        const wav = buildWavWithId3(buildId3Tag({ title: '封面测试', cover: JPEG_BYTES }));
        const result = await parseWithWorker(new File([wav], 'cover.wav', { type: 'audio/wav' }), true);

        expect(result.type).toBe('result');
        const cover = result.data?.cover as Blob | undefined;
        expect(cover).toBeInstanceOf(Blob);
        expect(cover?.size).toBe(JPEG_BYTES.length);
        // 内容寻址的 id：同一张封面永远落到同一个 asset，不会因为重复解析而堆积。
        expect(String(result.data?.coverAssetId || '')).toMatch(/^sha256:/);
    });

    it('文字帧与 TRCK 一起读出来（曲序是「按专辑排序」的前提）', async () => {
        const wav = buildWavWithId3(buildId3Tag({
            title: '标题', artist: '艺术家', album: '专辑', track: '3/12',
        }));
        const result = await parseWithWorker(new File([wav], 'text.wav', { type: 'audio/wav' }), false);

        expect(result.data?.title).toBe('标题');
        expect(result.data?.artist).toBe('艺术家');
        expect(result.data?.album).toBe('专辑');
        expect(result.data?.trackNumber).toBe(3);
    });

    it('没有内嵌歌词时不编造结果（不能把标签当歌词塞给歌词舞台）', async () => {
        const wav = buildWavWithId3(buildId3Tag({ title: '纯音乐' }));
        const result = await parseWithWorker(new File([wav], 'plain.wav', { type: 'audio/wav' }), false);

        expect(result.type).toBe('result');
        expect(result.data?.lyrics).toBeUndefined();
    });
});

describe('现有标签解析器：头部截断时的行为', () => {
    it('只给文件前半段时读不到尾部的标签 —— 这是「必须放大读取预算」的依据', async () => {
        const wav = buildWavWithId3(buildId3Tag({ title: '尾部标签', lyrics: '[00:02.00]尾部的歌词' }), 1024 * 1024);
        const truncated = wav.slice(0, 512 * 1024);
        const result = await parseWithWorker(new File([truncated], 'truncated.wav', { type: 'audio/wav' }), false);

        // 头 512KB 里只有静音 PCM，标签在尾部：解析器拿不到歌词。
        expect(result.data?.lyrics).toBeUndefined();
    });

    it('给全量时同一份文件读得到', async () => {
        const wav = buildWavWithId3(buildId3Tag({ title: '尾部标签', lyrics: '[00:02.00]尾部的歌词' }), 1024 * 1024);
        const result = await parseWithWorker(new File([wav], 'full.wav', { type: 'audio/wav' }), false);

        expect(result.data?.lyrics).toContain('尾部的歌词');
    });
});
