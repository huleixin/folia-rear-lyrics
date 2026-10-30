import { getPlaybackSongKey, getPlaybackSourceRef } from '../utils/appPlaybackGuards';
import { shufflePlayback } from './shufflePlayback';
import { readQqNativeResolverConfig } from './onlineMusic/qqTransport';
import { getTingyuPlayback } from '../platform/tingyuPlayback';
import { primeNativeLyricsForSongs, LYRIC_PRIME_AHEAD } from './nativeLyricPriming';
import type { SongResult } from '../types';
import type { AudioQualityPreference } from '../types/onlineMusic';

// src/services/nativePlaylistSync.ts
// 阶段 A：把「逻辑歌单」交给原生。
//
// 之前的架构里，"下一首是谁"这个问题只有 WebView 能回答。后台页面被系统冻结后，
// 那个答案永远不来，于是 Media3 播完它手里那几首就停下 —— 歌单明明还有歌。
//
// 这里同步的是**播放顺序 + 身份 + 音源引用**，不含播放地址：地址会过期，必须现取。
// 顺序在随机模式下直接取 `shufflePlayback` 的真实洗牌结果，所以原生推进出来的下一首
// 与 JS 会播的下一首是同一首，两套队列不会各说各话。

/** 与 NativePlaylist.Track 逐字段对应。 */
export interface NativePlaylistTrackPayload {
    songKey: string;
    providerId: string;
    mediaId: string;
    title: string;
    artist: string;
    album: string;
    /**
     * 毫秒。字段名里带单位，是因为这里曾经发过**秒**，而原生 `durationMs` 直接当毫秒用：
     * 200 秒的《阿拉斯加海湾》被发布成 200ms，锁屏卡片总时长 00:00、进度条被
     * `PlaybackPositionClock` 钳在 200ms 不动。同一批数据走窗口通道时发的是毫秒，
     * 两条路径单位不一致，只有原生接管的那一首中招 —— 也解释了"重开 App 就恢复"。
     */
    durationMs: number;
    artwork: string;
    providerData?: Record<string, unknown>;
}

export type NativePlaylistMode = 'off' | 'all' | 'one' | 'shuffle';

interface TingyuPlaybackNative {
    setNativePlaylist(options: {
        mode: NativePlaylistMode;
        loopAll: boolean;
        quality: AudioQualityPreference;
        tracks: NativePlaylistTrackPayload[];
    }): Promise<{ generation: number; size: number }>;
    setNativePlaylistMode(options: { mode: NativePlaylistMode; loopAll: boolean }): Promise<{ generation: number }>;
    setResolverCredentials(options: { providerId: string; values: Record<string, string> }): Promise<{ configured: boolean }>;
}

const resolveMode = (loop: 'off' | 'all' | 'one', shuffle: boolean): NativePlaylistMode => {
    if (loop === 'one') return 'one';
    if (shuffle) return 'shuffle';
    return loop === 'all' ? 'all' : 'off';
};

const titleOf = (song: SongResult): string => song.name ?? '';
const artistOf = (song: SongResult): string => {
    const direct = (song as { artists?: Array<{ name?: string }> }).artists;
    if (Array.isArray(direct) && direct.length > 0) return direct.map(item => item?.name ?? '').filter(Boolean).join('、');
    const text = (song as { artist?: unknown }).artist;
    return typeof text === 'string' ? text : '';
};
const albumOf = (song: SongResult): string => {
    const album = (song as { album?: { name?: string } | string }).album;
    if (!album) return '';
    return typeof album === 'string' ? album : (album.name ?? '');
};
const artworkOf = (song: SongResult): string => {
    const cover = (song as { coverUrl?: unknown; cover?: unknown }).coverUrl
        ?? (song as { cover?: unknown }).cover;
    return typeof cover === 'string' ? cover : '';
};

const toPayload = (song: SongResult): NativePlaylistTrackPayload | null => {
    const songKey = getPlaybackSongKey(song);
    if (!songKey) return null;
    const ref = getPlaybackSourceRef(song);
    const online = ref?.kind === 'online' ? ref : null;
    return {
        songKey,
        providerId: online?.providerId ?? '',
        mediaId: online?.mediaId ?? '',
        title: titleOf(song),
        artist: artistOf(song),
        album: albumOf(song),
        // 毫秒，不在这里换算：唯一一次转换发生在 `SongResult.durationMs` 本来就以毫秒表达的地方。
        // 之前这里 `/1000` 是整条错链的起点。
        durationMs: Math.max(0, Math.round(song.durationMs ?? 0)),
        artwork: artworkOf(song),
        ...(online?.providerData ? { providerData: online.providerData as Record<string, unknown> } : {}),
    };
};

/**
 * 当前曲目之后的播放顺序。
 *
 * 随机模式用 `forwardKeys()` 的真实洗牌结果；它们为空（刚开始或还没观察过）时退回
 * 原始队列顺序，并让原生按队列顺序走 —— 至少不会给出错误的下一首。
 */
const orderedAfter = (queue: SongResult[], currentKey: string, shuffle: boolean): SongResult[] => {
    const index = queue.findIndex(candidate => getPlaybackSongKey(candidate) === currentKey);
    if (index < 0) return [];
    if (!shuffle) return queue.slice(index + 1);
    const keys = shufflePlayback.forwardKeys();
    if (keys.length === 0) return queue.slice(index + 1);
    const byKey = new Map(queue.map(song => [getPlaybackSongKey(song), song]));
    const ordered: SongResult[] = [];
    for (const key of keys) {
        const song = byKey.get(key);
        if (song) ordered.push(song);
    }
    return ordered.length > 0 ? ordered : queue.slice(index + 1);
};

let lastSignature = '';

/**
 * 同步逻辑歌单。同一份内容不会重复下发（避免每次渲染都换代次、作废在飞的解析）。
 *
 * 同步失败不影响任何播放行为：原生只是不知道下一首是谁，退回原来的 JS 通道。
 */
export const syncNativePlaylist = async (options: {
    song: SongResult | null;
    queue: SongResult[];
    loop: 'off' | 'all' | 'one';
    shuffle: boolean;
    quality: AudioQualityPreference;
}): Promise<void> => {
    const { song, queue, loop, shuffle, quality } = options;
    if (!song) return;
    const currentKey = getPlaybackSongKey(song);
    if (!currentKey) return;
    const ordered = orderedAfter(queue, currentKey, shuffle);
    // 当前曲目本身也要在列表里，原生才能用它做锚点找到位置。
    const tracks: NativePlaylistTrackPayload[] = [];
    const head = toPayload(song);
    if (head) tracks.push(head);
    for (const next of ordered) {
        const payload = toPayload(next);
        if (payload && !tracks.some(item => item.songKey === payload.songKey)) tracks.push(payload);
    }
    const mode = resolveMode(loop, shuffle);
    const signature = [mode, String(shuffle), quality, currentKey, tracks.map(item => item.songKey).join('>')].join('|');
    if (signature === lastSignature) return;
    lastSignature = signature;
    try {
        const native = getTingyuPlayback<TingyuPlaybackNative>();
        await native.setNativePlaylist({ mode, loopAll: loop === 'all', quality, tracks });
        // 这份 `ordered` 就是原生真正会走的顺序：按它预置歌词，锁屏连播才有词可用。
        // 与窗口预置（只有 5 首）不同，这里能看到更远的 10 首；只读本地缓存，最多
        // LYRIC_PRIME_AHEAD 首，不发网络请求，失败静默。
        void primeNativeLyricsForSongs(ordered.slice(0, LYRIC_PRIME_AHEAD), quality);
    } catch {
        // 同步是增强：失败时原生只是拿不到逻辑歌单，原有 JS 通道照旧。
    }
};

/** 只改模式（用户在界面/通知栏切循环或随机）。 */
export const syncNativePlaylistMode = async (loop: 'off' | 'all' | 'one', shuffle: boolean): Promise<void> => {
    try {
        const native = getTingyuPlayback<TingyuPlaybackNative>();
        await native.setNativePlaylistMode({ mode: resolveMode(loop, shuffle), loopAll: loop === 'all' });
    } catch {
        // 同上：增强，不是关键路径。
    }
};

/**
 * 把原生解析需要的后端地址与会话交给原生。
 *
 * 只传用户在设置里填的东西；`extension`（浏览器扩展桥）在原生侧无法使用，直接不传，
 * 原生会退回匿名直连通道。绝不传任何硬编码凭据。
 */
export const syncResolverCredentials = async (): Promise<void> => {
    // 只取用户自己配置的真实 http(s) 后端。`extension`（浏览器扩展桥）与相对路径在原生侧
    // 都没有意义，这里直接不传，原生会走匿名直连通道 —— 不是"配了但用不了"。
    const { base, cookie } = readQqNativeResolverConfig();
    if (!base) return;
    try {
        const native = getTingyuPlayback<TingyuPlaybackNative>();
        await native.setResolverCredentials({
            providerId: 'qq',
            values: { base, cookie, cookieAsHeader: 'false' },
        });
    } catch {
        // 同上。
    }
};

/** 测试用：忘掉上一次的签名，强制下一次同步真的下发。 */
export const resetNativePlaylistSyncForTest = (): void => {
    lastSignature = '';
};
