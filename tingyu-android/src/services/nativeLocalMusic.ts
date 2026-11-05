import type { LocalSong } from '../types';
import { saveLocalSongs, getLocalSongs } from './db';
import { buildImportedMetadataSnapshot } from '../utils/localSongMetadata';
import { noteLibraryStep } from '../nativeBridge/api/libraryTrace.js';

// src/services/nativeLocalMusic.ts
/**
 * 安卓本地音乐。
 *
 * 网页那套「导入文件夹」用的是 File System Access API（`showDirectoryPicker` +
 * `navigator.storage.getDirectory`），**安卓 WebView 一个都不给** —— 于是本地曲库在 App 里
 * 直接被判成不可用，表现为「本地打不开」。这里改走原生：
 *
 * · 扫描设备音乐库（MediaStore）：读系统已经收录的音频，不用用户自己去翻文件管理器。
 * · 挑选文件 / 整个文件夹（Storage Access Framework）：挑中的由原生复制进 App 私有目录。
 *
 * 两种来源的音频都不能直接给 WebView：`content://` 播不了，私有目录它也不认。
 * 所以原生另起了一个只监听 127.0.0.1 的小服务（LocalAudioServer）把音频以 http 喂回来，
 * 而**端口每次启动都可能变** —— 因此歌里只存一个 ref，播放时按当前端口重新拼地址，
 * 绝不能把 URL 存死（否则重启后整库都播不了）。
 */

type NativeAudioTrack = {
    id: string;
    fileName: string;
    folderPath?: string;
    /** `media` = 系统媒体库，`file` = 文件系统兜底扫描出来的用户原文件。 */
    source?: 'media' | 'file';
    /** 目录（低版本是完整路径，29+ 是相对路径），只用于分组展示。 */
    location?: string;
    title?: string;
    artist?: string;
    album?: string;
    duration?: number;
    fileSize?: number;
    mimeType?: string;
    trackNumber?: number;
    discNumber?: number;
    /** 文件修改时间（毫秒）。扫描不重算内容哈希，靠它判断「文件被换了」。 */
    dateModified?: number;
    url: string;
};

type NativePickResponse = {
    tracks?: NativeAudioTrack[];
    port?: number;
    cancelled?: boolean;
    picked?: number;
    copied?: number;
    resultCode?: number;
    error?: string;
    failures?: Array<{ uri?: string; message?: string }>;
};

type NativeScanResponse = {
    tracks?: NativeAudioTrack[];
    /** 媒体库一首都没有、又没开"所有文件访问"时置位：先去开权限，再扫一遍。 */
    needsAllFilesAccess?: boolean;
    /** 当前是否已授予「所有文件访问」。 */
    allFilesAccess?: boolean;
};

type NativeByteChunk = {
    /** base64。Capacitor 的桥只能传 JSON，二进制必须自己编码。 */
    bytes: string;
    read: number;
    total: number;
};

type NativePlugin = {
    scanLocalAudio?: () => Promise<NativeScanResponse>;
    pickAudioFiles?: () => Promise<NativePickResponse>;
    pickAudioFolder?: () => Promise<NativePickResponse>;
    deleteImportedAudio?: (options: { refs: string[] }) => Promise<{
        deleted?: string[];
        failed?: string[];
    }>;
    localAudioServerPort?: () => Promise<{ port?: number }>;
    requestAllFilesAccess?: () => Promise<{ granted?: boolean }>;
    /**
     * 把一个 ref 指向的音频复制一份进 App 私有目录，返回新的 `imported-` ref。
     * 只在该首歌真的播不出来时才调，不是扫描时整库复制。
     */
    copyLocalAudio?: (options: {
        ref: string;
        /** 原文件名。私有副本丢了的时候，原生靠它回媒体库把原文件找回来重拷。 */
        fileName?: string;
        fileSize?: number;
    }) => Promise<{
        copied?: boolean;
        ref?: string;
        error?: string;
    }>;
    /** 只读音频的一段字节：标签解析不再需要把整首歌拉进内存。 */
    readLocalAudioBytes?: (options: { ref: string; offset?: number; length?: number; }) => Promise<NativeByteChunk>;
    /** 音频是否还读得到、多大、什么类型。 */
    localAudioInfo?: (options: { ref: string; fileName?: string; }) => Promise<{
        exists?: boolean;
        length?: number;
        mimeType?: string;
        allFilesAccess?: boolean;
    }>;
    /** 系统解码器抽封面，作为 JS 解析器的兜底。 */
    readEmbeddedCover?: (options: { ref: string; }) => Promise<{
        hasCover?: boolean;
        bytes?: string;
        duration?: number;
        error?: string;
    }>;
    /** 与音频同名的外挂歌词（导入时一起复制的副本，或磁盘上的兄弟 .lrc）。 */
    readLocalLyricSidecar?: (options: { ref: string; }) => Promise<{
        content?: string;
        fileName?: string;
        origin?: 'imported' | 'sidecar' | 'translation';
        error?: string;
    }>;
};

export const ANDROID_MEDIA_FOLDER_NAME = 'Android 本地音乐';
export const ANDROID_IMPORTED_FOLDER_NAME = 'Android 文件导入';

export const isAndroidNativeRuntime = (): boolean => (
    typeof window !== 'undefined'
    && (window as any).Capacitor?.getPlatform?.() === 'android'
);

const getPlugin = (): NativePlugin | null => (
    (window as any).Capacitor?.Plugins?.FoliaNative ?? null
);

const titleFromFileName = (fileName: string): string => (
    String(fileName || 'Unknown Song').replace(/\.[^.]+$/, '')
);

let resolvedAudioServerPort = 0;

/** 取（并缓存）本机音频服务的端口。拿不到返回 0，调用方据此判定「原生不可用」。 */
export const resolveNativeAudioServerPort = async (): Promise<number> => {
    if (resolvedAudioServerPort > 0) return resolvedAudioServerPort;
    const plugin = getPlugin();
    if (!plugin?.localAudioServerPort) return 0;
    try {
        const response = await plugin.localAudioServerPort();
        const port = Number(response?.port) || 0;
        if (port > 0) resolvedAudioServerPort = port;
        return port;
    } catch {
        return 0;
    }
};

/** 挑选接口回包里带着端口，顺手记下来，省掉一次往返。 */
const noteAudioServerPort = (port: unknown): void => {
    const value = Number(port) || 0;
    if (value > 0) resolvedAudioServerPort = value;
};

/**
 * 把 ref 指向的音频**自己复制一份**进 App 私有目录，返回新 ref（失败返回 null）。
 *
 * 用它的理由很直接：MediaStore 那一路是按 id 现读用户原文件的，
 * 文件被搬走、媒体库没刷新、或者某个 ROM 不给读，播放就只剩一句
 * 「无法访问文件，请重新导入」—— 而用户的原文件根本没动过，
 * 让人重新导入整个文件夹毫无道理。复制一份之后，播放只认 App 自己的副本，
 * 和「挑选导入」那条路一样，与 MediaStore 和权限彻底脱钩。
 *
 * 只在真播不出来时调一次，之后那首歌就用新 ref，不会再回到原文件。
 */
export const copyAndroidLocalAudio = async (
    ref: string,
    fileName?: string,
    fileSize?: number,
): Promise<string | null> => {
    const plugin = getPlugin();
    if (!ref || !plugin?.copyLocalAudio) return null;
    try {
        const response = await plugin.copyLocalAudio({
            ref,
            fileName: fileName || undefined,
            fileSize: Number(fileSize) > 0 ? Number(fileSize) : 0,
        });
        if (!response?.copied) {
            noteLibraryStep('local', 'copy:failed', { ref, error: response?.error });
            return null;
        }
        const next = response.ref;
        if (!next) return null;
        noteLibraryStep('local', 'copy:ok', { from: ref, to: next });
        return next;
    } catch (error) {
        noteLibraryStep('local', 'copy:error', {
            ref,
            message: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
};

export const nativeAudioUrlForRef = async (ref: string): Promise<string | null> => {
    if (!ref) return null;
    const port = await resolveNativeAudioServerPort();
    if (port <= 0) return null;
    return `http://127.0.0.1:${port}/audio/${encodeURIComponent(ref)}`;
};

/**
 * 带用户去系统设置开「所有文件访问」。
 *
 * 这是受限权限，App 弹窗要不来，只能跳设置页让用户手动开；回来的结果由原生回包告知。
 * 没有对应的插件方法（旧包 / 非安卓）时返回 false，调用方按"没授权"继续走。
 */
export const requestAndroidAllFilesAccess = async (): Promise<boolean> => {
    const plugin = getPlugin();
    if (!plugin?.requestAllFilesAccess) return false;
    try {
        const response = await plugin.requestAllFilesAccess();
        return response?.granted === true;
    } catch {
        return false;
    }
};

/**
 * 扫描设备音乐库（MediaStore）导入。
 *
 * 这是文件选择器之外的备用入口：选择器需要用户在系统文件管理器里自己找到文件，
 * 而音乐库扫描直接把系统已经收录的音频全部读进来，不需要逐首挑选。
 * 因此它依赖 READ_MEDIA_AUDIO 权限，插件会自行申请。
 *
 * 媒体库一首都没有时（有的 ROM 收录不全），原生会在没开"所有文件访问"的
 * 情况下置 needsAllFilesAccess —— 这里带用户去开一次，然后重扫（这次原生
 * 会按目录走文件系统兜底）；用户拒绝就按空结果收场，不再反复打扰。
 */
export const scanAndroidDeviceMusic = async (): Promise<LocalSong[]> => {
    const plugin = getPlugin();
    if (!plugin?.scanLocalAudio) {
        noteLibraryStep('local', 'scan:no-plugin');
        throw new Error('Android media scan is unavailable');
    }

    noteLibraryStep('local', 'scan:start');
    try {
        let response = await plugin.scanLocalAudio();
        if (response.needsAllFilesAccess) {
            noteLibraryStep('local', 'scan:needs-all-files');
            if (await requestAndroidAllFilesAccess()) {
                noteLibraryStep('local', 'scan:all-files-granted');
                response = await plugin.scanLocalAudio();
            } else {
                noteLibraryStep('local', 'scan:all-files-denied');
            }
        }
        const now = Date.now();
        const existing = new Map((await getLocalSongs()).map(song => [song.id, song]));
        const songs = (response.tracks || []).map((track): LocalSong => {
            const fileName = track.fileName || `track-${track.id}`;
            const title = track.title || titleFromFileName(fileName);
            const previous = existing.get(`android-media-${track.id}`);
            if (previous) {
                // 重扫时只刷新能变的字段：标题/封面/歌词这些是解析出来的，
                // 覆盖成媒体库的值反而会把上一次的解析成果冲掉。
                return {
                    ...previous,
                    fileName,
                    folderName: track.folderPath || previous.folderName || ANDROID_MEDIA_FOLDER_NAME,
                    nativeAudioRef: track.id,
                    duration: Number(track.duration) || previous.duration,
                    fileSize: Number(track.fileSize) || previous.fileSize,
                    ...(track.dateModified ? { fileLastModified: track.dateModified } : {}),
                };
            }
            return {
                id: `android-media-${track.id}`,
                fileName,
                filePath: `Android/MediaStore/${track.id}`,
                // 只记 ref：端口每次启动都变，存 URL 重启后就播不了。
                nativeAudioRef: track.id,
                duration: Number(track.duration) || 0,
                fileSize: Number(track.fileSize) || 0,
                fileLastModified: track.dateModified || now,
                mimeType: track.mimeType || 'audio/*',
                addedAt: now,
                title,
                titleOrigin: 'import',
                importedMetadata: buildImportedMetadataSnapshot({
                    fileName,
                    fallbackTitle: title,
                    fallbackArtist: track.artist || '',
                    fallbackAlbum: track.album || '',
                }),
                // 媒体库已经给出了曲序/碟号，先用着；内嵌标签解析出来再说。
                ...(track.trackNumber ? { trackNumber: track.trackNumber } : {}),
                ...(track.discNumber ? { discNumber: track.discNumber } : {}),
                folderName: track.folderPath || ANDROID_MEDIA_FOLDER_NAME,
                hasManualLyricSelection: false,
                noAutoMatch: false,
            };
        });

        if (songs.length > 0) {
            await saveLocalSongs(songs);
        }
        noteLibraryStep('local', 'scan:done', { songs: songs.length });
        return songs;
    } catch (error) {
        noteLibraryStep('local', 'scan:error', {
            message: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }
};

/**
 * 用系统文件管理器（Storage Access Framework）挑选音频文件。
 *
 * 优先挑整个文件夹（用户一次选一张专辑 / 一个目录），原生侧递归扫出里面的音频；
 * 旧设备上没有这个方法时退回逐个挑文件。
 *
 * 选中的文件由原生侧复制进 App 私有目录，之后通过本机回环地址流式播放，
 * 所以不依赖 MediaStore 是否收录过这些文件，也不需要整盘存储权限。
 */
export const pickAndroidLocalMusic = async (): Promise<LocalSong[]> => {
    const plugin = getPlugin();
    const source = plugin?.pickAudioFolder ? 'folder' : 'files';
    const picker = plugin?.pickAudioFolder ?? plugin?.pickAudioFiles;
    if (!picker) {
        noteLibraryStep('local', 'pick:no-plugin', {
            hasPlugin: Boolean(plugin),
            methods: plugin ? Object.keys(plugin).join(',') : 'none',
        });
        throw new Error('Android audio picker is unavailable');
    }

    noteLibraryStep('local', 'pick:start', { source });
    let response: NativePickResponse;
    try {
        response = await picker();
    } catch (error) {
        noteLibraryStep('local', 'pick:error', {
            message: error instanceof Error ? error.message : String(error),
        });
        throw error;
    }

    const failures = Array.isArray(response.failures) ? response.failures : [];
    noteLibraryStep('local', 'pick:result', {
        cancelled: response.cancelled === true,
        picked: response.picked ?? (response.tracks || []).length,
        copied: response.copied ?? (response.tracks || []).length,
        tracks: (response.tracks || []).length,
        resultCode: response.resultCode,
        error: response.error,
        failures: failures.length,
        firstFailure: failures[0]?.message,
        port: response.port,
    });

    if (response.cancelled) return [];
    noteAudioServerPort(response.port);

    const now = Date.now();
    const songs: LocalSong[] = [];

    for (const track of response.tracks || []) {
        const fileName = track.fileName || `track-${track.id}`;
        const fallbackTitle = titleFromFileName(fileName);
        // 这里以前会把整首音频 fetch 回来解析内嵌标签 —— 一首 200MB 的 FLAC 为了抽
        // 一个封面就要在 WebView 里驻留 200MB，几十首一起导就是 OOM。
        // 现在只建基础记录，标签由 nativeLocalMetadata 按「读文件头部几 MB」补全。
        songs.push({
            id: `android-imported-${track.id}`,
            fileName,
            filePath: `Android/Imported/${track.id}`,
            nativeAudioRef: track.id,
            duration: Number(track.duration) || 0,
            fileSize: Number(track.fileSize) || 0,
            fileLastModified: now,
            mimeType: track.mimeType || 'audio/*',
            addedAt: now,
            title: fallbackTitle,
            titleOrigin: 'import',
            importedMetadata: buildImportedMetadataSnapshot({
                fileName,
                fallbackTitle,
                fallbackArtist: track.artist || '',
                fallbackAlbum: track.album || '',
            }),
            folderName: track.folderPath || ANDROID_IMPORTED_FOLDER_NAME,
            hasManualLyricSelection: false,
            noAutoMatch: false,
        });
    }

    if (songs.length > 0) {
        await saveLocalSongs(songs);
        noteLibraryStep('local', 'pick:saved', { songs: songs.length });
    } else if (failures.length > 0) {
        // 选了文件却一个都没进来：把原生侧的原因抛出去，界面至少会报错，
        // 而不是像以前那样静默什么都不做。
        throw new Error(`Imported 0 of ${failures.length} picked file(s): ${failures[0]?.message || 'unknown error'}`);
    } else if (response.error) {
        // RESULT_OK 却没给出任何可读的 uri：这是原生侧明确的异常，同样要报出来。
        throw new Error(response.error);
    }
    return songs;
};

/**
 * 删除安卓导入时复制进 App 私有目录的音频副本。
 *
 * 「从库中删除」以前只删数据库记录，私有目录里的副本会一直留着占空间；这里把副本也清掉。
 * 只处理 `imported-*` 这种 App 自己写出的文件名，扫描设备音乐库得到的歌是引用用户原文件，
 * 永远不走这个入口。
 */
export const deleteAndroidImportedAudio = async (
    refs: string[],
): Promise<{ deleted: string[]; failed: string[] }> => {
    const candidates = Array.from(new Set(
        refs.filter((ref): ref is string => typeof ref === 'string' && ref.startsWith('imported-')),
    ));
    if (candidates.length === 0) return { deleted: [], failed: [] };

    const plugin = getPlugin();
    if (!plugin?.deleteImportedAudio) {
        noteLibraryStep('local', 'delete:no-plugin', { refs: candidates.length });
        return { deleted: [], failed: candidates };
    }

    try {
        const response = await plugin.deleteImportedAudio({ refs: candidates });
        const deleted = Array.isArray(response?.deleted) ? response.deleted : [];
        const failed = Array.isArray(response?.failed) ? response.failed : [];
        noteLibraryStep('local', 'delete:done', {
            requested: candidates.length,
            deleted: deleted.length,
            failed: failed.length,
        });
        return { deleted, failed };
    } catch (error) {
        noteLibraryStep('local', 'delete:error', {
            requested: candidates.length,
            message: error instanceof Error ? error.message : String(error),
        });
        return { deleted: [], failed: candidates };
    }
};

/**
 * 把 base64 解回字节。
 *
 * Capacitor 的桥只能传 JSON，二进制必须走 base64，因此每次读取都要在这里解一次。
 * 用 atob + 手写循环而不是 Buffer：WebView 里没有 Node 的 Buffer。
 */
const decodeBase64Bytes = (value: string): Uint8Array<ArrayBuffer> => {
    const binary = atob(value);
    // 底层 buffer 明确是 ArrayBuffer：TS 5.7 起 Uint8Array<ArrayBufferLike> 不再能当 BlobPart。
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
};

/**
 * 只读音频的一段字节。
 *
 * 存在的理由：安卓的歌没有 File System Access 句柄，而内嵌标签（封面、歌词、曲序）
 * 都藏在文件里。以前唯一的取字节办法是 `fetch(整首).blob()`，一首 200MB 的 FLAC
 * 为了抽 300KB 封面就得把 200MB 驻留进内存。标签都在文件头部，读前几 MB 就够。
 *
 * 读不到（文件被删、权限刚被回收、原生不支持）时返回 null，调用方按「没有标签」继续，
 * 不能让它把播放链路挡住。
 */
export const readNativeAudioBytes = async (
    ref: string,
    offset = 0,
    length = 512 * 1024,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; read: number; total: number; } | null> => {
    const plugin = getPlugin();
    if (!ref || !plugin?.readLocalAudioBytes) return null;
    try {
        const response = await plugin.readLocalAudioBytes({ ref, offset, length });
        if (!response || !response.bytes) return null;
        const bytes = decodeBase64Bytes(response.bytes);
        return {
            bytes,
            read: Number(response.read) || bytes.length,
            total: Number(response.total) || bytes.length,
        };
    } catch (error) {
        noteLibraryStep('local', 'read:error', {
            ref,
            message: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
};

/** 音频是否还在、多大、什么类型 —— 用来区分「文件被删了」和「权限被回收了」。 */
export const getNativeAudioInfo = async (
    ref: string,
    fileName?: string,
): Promise<{ exists: boolean; length: number; mimeType: string; allFilesAccess: boolean; } | null> => {
    const plugin = getPlugin();
    if (!ref || !plugin?.localAudioInfo) return null;
    try {
        const response = await plugin.localAudioInfo({ ref, fileName });
        return {
            exists: response?.exists === true,
            length: Number(response?.length) || 0,
            mimeType: response?.mimeType || 'audio/*',
            allFilesAccess: response?.allFilesAccess === true,
        };
    } catch {
        return null;
    }
};

/** 系统解码器抽内嵌封面（JS 解析器读不到时的兜底），返回 base64 原图。 */
export const readNativeEmbeddedCover = async (
    ref: string,
): Promise<{ bytes: string; duration?: number; } | null> => {
    const plugin = getPlugin();
    if (!ref || !plugin?.readEmbeddedCover) return null;
    try {
        const response = await plugin.readEmbeddedCover({ ref });
        if (!response?.hasCover || !response.bytes) return null;
        return {
            bytes: response.bytes,
            ...(response.duration ? { duration: response.duration } : {}),
        };
    } catch {
        return null;
    }
};

/** 同名外挂歌词：优先导入时一起复制的副本，其次用户目录里的兄弟 .lrc。 */
export const readNativeLyricSidecar = async (
    ref: string,
): Promise<{ content: string; fileName?: string; origin: 'imported' | 'sidecar' | 'translation'; } | null> => {
    const plugin = getPlugin();
    if (!ref || !plugin?.readLocalLyricSidecar) return null;
    try {
        const response = await plugin.readLocalLyricSidecar({ ref });
        if (!response?.content || response.content.trim().length === 0) return null;
        return {
            content: response.content,
            fileName: response.fileName,
            origin: response.origin || 'sidecar',
        };
    } catch {
        return null;
    }
};
