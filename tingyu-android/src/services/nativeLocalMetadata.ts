import type { LocalSong } from '../types';
import { saveLocalSongs, getLocalSongs } from './db';
import {
    parseEmbeddedMetadataAsync,
    type EmbeddedMetadataResult,
} from '../utils/localMetadataWorkerClient';
import { buildImportedMetadataSnapshot } from '../utils/localSongMetadata';
import { stageLocalCoverAsset, prepareLocalCoverBlob } from './localCoverAssetService';
import { noteLocalLibraryDiagnostic } from '../utils/localLibraryDiagnostics';
import {
    readNativeAudioBytes,
    readNativeEmbeddedCover,
    readNativeLyricSidecar,
} from './nativeLocalMusic';

// src/services/nativeLocalMetadata.ts
/**
 * 安卓本地歌的标签补全。
 *
 * 安卓曲库有两条来源：系统媒体库扫描（MediaStore）和文件管理器挑选（复制进私有目录）。
 * 两条路都拿不到 File System Access 句柄 —— 也就是说桌面/网页那套
 * 「句柄 → File → 解析内嵌标签」在这里根本走不到，于是安卓的歌长期没有
 * 封面、内嵌歌词、曲序、ReplayGain（只有导入那一次侥幸解析成功的才有）。
 *
 * 这里改成：按 ref 向原生要文件**头部的几 MB 字节**，交给仓库里同一个解析器
 * （music-metadata，跑在 worker 里），解析结果落库。不整首取回是因为
 * 一首 200MB 的 FLAC 为了抽 300KB 封面把 200MB 驻留进 WebView 内存是不可接受的。
 *
 * 标签几乎都在文件头：ID3v2 在开头、FLAC 的元数据块在开头、多数 m4a 的 moov 也在开头。
 * 所以先用 512KB 试，不够再放到 4MB；真读不出来才退到系统解码器抽封面。
 */

/** 逐级放大的读取预算（字节）。绝大多数歌曲第一档就够。 */
const READ_BUDGETS = [512 * 1024, 4 * 1024 * 1024];

/** 一次补全最多处理多少首，避免超大曲库把界面拖住（剩下的下次扫描再补）。 */
const HYDRATION_BATCH = 400;

const LOG_PREFIX = '[NativeLocalMetadata]';
const LOCAL_MUSIC_UPDATED_EVENT = 'folia-local-music-updated';

export type NativeSongMetadata = {
    metadata: EmbeddedMetadataResult;
    /** 真正喂给解析器的那份字节；封面兜底和时长兜底会用到。 */
    file: File;
    /** 只读到了文件的一部分（大文件第一档预算没读完时）。 */
    truncated: boolean;
};

/**
 * 取一首安卓本地歌的标签。
 *
 * 返回 null 表示「读不到」（文件被删、权限被回收、格式化失败），调用方跳过即可，
 * 不该把它当成错误抛出去 —— 播放链路不依赖标签。
 */
export const parseNativeSongMetadata = async (
    song: LocalSong,
    options: { includeCover?: boolean; budgets?: number[]; } = {},
): Promise<NativeSongMetadata | null> => {
    const ref = song.nativeAudioRef;
    if (!ref) return null;
    const includeCover = options.includeCover !== false;
    const budgets = options.budgets || READ_BUDGETS;
    let fallback: NativeSongMetadata | null = null;

    for (const budget of budgets) {
        let chunk: Awaited<ReturnType<typeof readNativeAudioBytes>> = null;
        try {
            chunk = await readNativeAudioBytes(ref, 0, budget);
        } catch (error) {
            console.warn(`${LOG_PREFIX} Failed to read bytes for ${song.fileName}:`, error);
            return fallback;
        }
        if (!chunk || chunk.bytes.length === 0) return fallback;

        const file = new File([chunk.bytes], song.fileName || 'audio', {
            type: song.mimeType || 'audio/*',
        });
        const truncated = chunk.total > 0 && chunk.read < chunk.total;
        let metadata: EmbeddedMetadataResult | null = null;
        try {
            metadata = await parseEmbeddedMetadataAsync(file, includeCover);
        } catch (error) {
            console.warn(`${LOG_PREFIX} Failed to parse tags for ${song.fileName}:`, error);
        }
        if (!metadata) continue;

        const parsed: NativeSongMetadata = { metadata, file, truncated };
        fallback = fallback || parsed;
        // 已经拿到「有信息量」的结果就不必再读更大的块：
        // 标题/歌手/专辑/曲序/歌词/封面里任意一项有值都算有效。
        if (hasUsefulMetadata(metadata, includeCover)) return parsed;
        // 整个文件都读完了还什么都没有，再放大也没有意义。
        if (!truncated) return parsed;
    }

    return fallback;
};

const hasUsefulMetadata = (metadata: EmbeddedMetadataResult, includeCover: boolean): boolean => (
    Boolean(metadata.title)
    || Boolean(metadata.artist)
    || Boolean(metadata.album)
    || Boolean(metadata.trackNumber)
    || Boolean(metadata.lyrics)
    || (includeCover && Boolean(metadata.cover))
);

/**
 * 把解析结果写进歌曲记录（纯函数式，调用方决定什么时候落库）。
 *
 * 只覆盖「解析到了的」字段：解析失败的字段保持原值，避免把媒体库给出的
 * 标题/歌手/时长清空 —— 那会让曲库突然出现一堆文件名当标题的歌。
 */
export const applyEmbeddedMetadataToSong = (
    song: LocalSong,
    metadata: EmbeddedMetadataResult,
): LocalSong => {
    const next: LocalSong = { ...song };
    next.importedMetadata = buildImportedMetadataSnapshot({
        fileName: song.fileName,
        embeddedTitle: metadata.title,
        // 媒体库给的标题比文件名可靠，解析不出内嵌标题时用它兜底。
        fallbackTitle: song.importedMetadata?.title || song.title,
        embeddedArtist: metadata.artist,
        embeddedArtists: metadata.artists,
        fallbackArtist: song.importedMetadata?.artistNames?.join(', '),
        embeddedAlbum: metadata.album,
        fallbackAlbum: song.importedMetadata?.albumName,
    });
    if (song.titleOrigin === 'import') next.title = next.importedMetadata.title;

    if (metadata.trackNumber) next.trackNumber = metadata.trackNumber;
    if (metadata.discNumber) next.discNumber = metadata.discNumber;
    if (metadata.bitrate) next.bitrate = metadata.bitrate;
    if (metadata.duration) next.duration = metadata.duration;
    next.embeddedMetadataVersion = EMBEDDED_METADATA_VERSION_NATIVE;

    if (metadata.lyrics) {
        next.hasEmbeddedLyrics = true;
        next.embeddedLyricsContent = metadata.lyrics;
    }
    if (metadata.translationLyrics) {
        next.hasEmbeddedTranslationLyrics = true;
        next.embeddedTranslationLyricsContent = metadata.translationLyrics;
    }
    if (metadata.replayGain !== undefined) next.replayGain = metadata.replayGain;
    if (metadata.replayGainTrackGain !== undefined) next.replayGainTrackGain = metadata.replayGainTrackGain;
    if (metadata.replayGainTrackPeak !== undefined) next.replayGainTrackPeak = metadata.replayGainTrackPeak;
    if (metadata.replayGainAlbumGain !== undefined) next.replayGainAlbumGain = metadata.replayGainAlbumGain;
    if (metadata.replayGainAlbumPeak !== undefined) next.replayGainAlbumPeak = metadata.replayGainAlbumPeak;

    // 用户显式选了在线封面时不覆盖本地封面。
    if (metadata.cover && metadata.coverAssetId && !song.useOnlineCover) {
        stageLocalCoverAsset(metadata.coverAssetId, metadata.cover);
        next.localCoverAssetId = metadata.coverAssetId;
        next.localCoverSource = 'embedded';
    }
    return next;
};

/**
 * 与 localMusicService 里的 EMBEDDED_METADATA_VERSION 保持一致。
 *
 * 单独抄一份是因为 nativeLocalMetadata 被 localMusicService 依赖，
 * 反向 import 会形成循环；两处对不上时看这个常量即可。
 */
export const EMBEDDED_METADATA_VERSION_NATIVE = 7;

/**
 * base64 → 可当 BlobPart 用的字节。
 *
 * 单独切一份 `ArrayBuffer` 而不是直接把 `Uint8Array` 塞给 Blob：TS 5.7 起
 * `Uint8Array<ArrayBufferLike>` 不再被接受为 BlobPart（可能底层是 SharedArrayBuffer）。
 */
const base64ToBytes = (value: string): Uint8Array<ArrayBuffer> => {
    const binary = atob(value);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
};

/**
 * 封面兜底：JS 解析器没取到封面时（moov 在文件尾部的 m4a 等），
 * 让系统解码器抽一次。
 */
const readCoverViaRetriever = async (song: LocalSong): Promise<LocalSong> => {
    const ref = song.nativeAudioRef;
    if (!ref || song.useOnlineCover) return song;
    const cover = await readNativeEmbeddedCover(ref);
    if (!cover?.bytes) return song;
    try {
        const blob = new Blob([base64ToBytes(cover.bytes)], { type: 'image/jpeg' });
        const prepared = await prepareLocalCoverBlob(blob);
        if (!prepared?.assetId) return song;
        return {
            ...song,
            localCoverAssetId: prepared.assetId,
            localCoverSource: 'embedded',
            ...(cover.duration ? { duration: cover.duration } : {}),
        };
    } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to persist retriever cover for ${song.fileName}:`, error);
        return song;
    }
};

/**
 * 外挂歌词兜底：同目录的 .lrc。
 *
 * 导入文件夹时会把同名 .lrc 一起复制进私有目录（不依赖任何权限）；
 * 媒体库扫描进来的歌要读用户目录里的 .lrc，就得有「所有文件访问」——
 * 没有时原生直接返回空，这里按「没有外挂歌词」处理，不打扰用户。
 */
const readSidecarLyric = async (song: LocalSong): Promise<LocalSong> => {
    const ref = song.nativeAudioRef;
    if (!ref) return song;
    if (song.hasLocalLyrics && song.localLyricsContent) return song;
    if (song.localLyricsOrigin === 'upload') return song;
    const sidecar = await readNativeLyricSidecar(ref);
    if (!sidecar?.content || sidecar.content.trim().length === 0) return song;
    if (sidecar.origin === 'translation') {
        return {
            ...song,
            hasLocalTranslationLyrics: true,
            localTranslationLyricsContent: sidecar.content,
            localTranslationLyricsOrigin: 'sidecar',
        };
    }
    return {
        ...song,
        hasLocalLyrics: true,
        localLyricsContent: sidecar.content,
        localLyricsOrigin: 'sidecar',
    };
};

/**
 * 补全一首安卓本地歌：标签 → 封面 → 外挂歌词。
 *
 * 只做「读」，写库由调用方批量做（`hydrateNativeSongs`），
 * 这样一次扫描几千首也不会因为逐首写库而卡住。
 */
export const hydrateNativeSong = async (song: LocalSong): Promise<LocalSong> => {
    if (!song.nativeAudioRef) return song;
    let next = song;

    const parsed = await parseNativeSongMetadata(song, { includeCover: true });
    if (parsed) {
        next = applyEmbeddedMetadataToSong(next, parsed.metadata);
        if (parsed.metadata.duration) {
            next.duration = parsed.metadata.duration;
        }
    }

    if (!next.localCoverAssetId) {
        next = await readCoverViaRetriever(next);
    }
    next = await readSidecarLyric(next);
    return next;
};

/**
 * 补齐一首安卓歌的本地封面并落库。
 *
 * 播放页、队列磁贴都靠 `localCoverAssetId` 出图，而安卓这首歌没有 File System Access 句柄，
 * 上游「按句柄读文件抽封面」那条路走不到 —— 于是以前只有导入那一次侥幸成功才有封面。
 * 这里按「读文件头部几 MB → 解析器抽封面 → 系统解码器兜底」的顺序补，只读一小段，
 * 不会为了一首歌把整份 FLAC 拉进内存。
 */
export const ensureNativeSongCover = async (song: LocalSong): Promise<LocalSong> => {
    if (!song.nativeAudioRef || song.localCoverSource === 'folder') return song;

    const parsed = await parseNativeSongMetadata(song, { includeCover: true });
    const cover = parsed?.metadata.cover;
    const coverAssetId = parsed?.metadata.coverAssetId;
    let updated: LocalSong | null = null;
    if (cover && coverAssetId) {
        stageLocalCoverAsset(coverAssetId, cover);
        updated = { ...song, localCoverAssetId: coverAssetId, localCoverSource: 'embedded' };
    } else {
        const viaRetriever = await readCoverViaRetriever(song);
        if (viaRetriever.localCoverAssetId) updated = viaRetriever;
    }

    if (!updated) return song;
    Object.assign(song, updated);
    try {
        await saveLocalSongs([updated]);
        // 单首懒加载（播放时按需补）也必须通知界面：以前只有批量 flush 会派发，
        // 于是「点开一首歌才补出来的封面」只有曲库列表刷新得了，播放器快照收不到。
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
        }
    } catch (error) {
        console.warn(`${LOG_PREFIX} Failed to persist cover for ${song.fileName}:`, error);
    }
    return updated;
};

/**
 * 批量补全并分批落库。
 *
 * 每批写库后发一次 local-music-updated，界面在扫描过程中就能陆续看到封面和歌词，
 * 而不是等整库跑完（几千首时那要几分钟）。
 */
export const hydrateNativeSongs = async (
    songs: LocalSong[],
    options: { limit?: number; concurrency?: number; isCancelled?: () => boolean; } = {},
): Promise<{ hydrated: number; failed: number; }> => {
    const limit = options.limit ?? HYDRATION_BATCH;
    const concurrency = Math.max(1, options.concurrency ?? 3);
    const isCancelled = options.isCancelled;
    const pending = songs.filter(song => song.nativeAudioRef).slice(0, limit);
    if (pending.length === 0) return { hydrated: 0, failed: 0 };

    let hydrated = 0;
    let failed = 0;
    let nextIndex = 0;
    let buffer: LocalSong[] = [];

    const flush = async () => {
        if (buffer.length === 0) return;
        const batch = buffer;
        buffer = [];
        try {
            await saveLocalSongs(batch);
            hydrated += batch.length;
            window.dispatchEvent(new Event(LOCAL_MUSIC_UPDATED_EVENT));
        } catch (error) {
            failed += batch.length;
            console.warn(`${LOG_PREFIX} Failed to save a hydration batch:`, error);
        }
    };

    const worker = async () => {
        // 贯穿式取消（稳定性专项风险一）：调用方（启动补全的 useEffect）可能在批进行中
        // 被卸载（WebView 重载、路由重建）。每首歌开始前检查取消标记，已解析完的
        // 部分照常落库，剩余条目立即停止，不再与播放/首屏抢占 IO 与 worker。
        while (!isCancelled?.()) {
            const index = nextIndex++;
            if (index >= pending.length) return;
            const song = pending[index];
            try {
                const result = await hydrateNativeSong(song);
                // 已解析完的成果无条件入缓冲：取消只阻止「取新歌」，不丢已完成的工作。
                buffer.push(result);
            } catch (error) {
                failed += 1;
                console.warn(`${LOG_PREFIX} Failed to hydrate ${song.fileName}:`, error);
            }
            if (buffer.length >= 25) await flush();
        }
    };

    try {
        await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, () => worker()));
        // 取消时也把已完成的部分落库：已解析的成果不丢，下次启动从 findNativeSongsNeedingHydration 继续。
        await flush();
        noteLocalLibraryDiagnostic('native-hydrate:done', { hydrated, failed, total: pending.length });
        console.log(`${LOG_PREFIX} Hydrated ${hydrated}/${pending.length} songs (failed ${failed}).`);
    } catch (error) {
        console.warn(`${LOG_PREFIX} Hydration aborted:`, error);
    }
    return { hydrated, failed };
};

/**
 * 曲库里「还没补全过」的安卓歌。
 *
 * 用 embeddedMetadataVersion 判断而不是每次全量重跑：几千首全解析一遍要好几分钟，
 * 而绝大多数歌第一次就补完了。
 */
export const findNativeSongsNeedingHydration = async (): Promise<LocalSong[]> => {
    const songs = await getLocalSongs();
    return songs.filter(song => (
        song.nativeAudioRef
        && (song.embeddedMetadataVersion || 0) < EMBEDDED_METADATA_VERSION_NATIVE
    ));
};
