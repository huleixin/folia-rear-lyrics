import { getPlaybackSongKey, getPlaybackSourceRef } from '../utils/appPlaybackGuards';
import { getSongAlbumCoverUrl } from '../utils/songMetadata';
import { shufflePlayback } from './shufflePlayback';
import { readQqNativeResolverConfig } from './onlineMusic/qqTransport';
import { LX_PLATFORMS } from './onlineMusic/lxProviders';
import { useLxSourceStore } from '../stores/useLxSourceStore';
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
    /**
     * 用户选的播放音源：`lx:tx`（洛雪脚本）/ `qq-original`（平台原版）。
     *
     * 没有它，原生只能按 providerId 猜 —— 真机 1.3.50 就是把 `provider=qq` 的 QQ 原版
     * 判给了洛雪解析器，而设备没装脚本，于是回答 SCRIPT_NOT_INSTALLED、不接管、
     * 回落给已经停止活动的 WebView，放完一首就停。
     */
    sourceId?: string;
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
    // 封面的**唯一**真实位置是 `album.coverUrl`（`SongResult` 没有顶层 coverUrl）。
    //
    // 这里曾经只读顶层 `coverUrl`，于是交给原生的 `artwork` 恒为空串：前台播放看不出问题
    // （系统卡片由 JS 推当前曲时带的是正确地址），但只要 Media3 自己切歌、由原生接管，
    // 那个 MediaItem 的 tag 里就没有封面 —— 锁屏和通知只剩占位图，歌词却正常。
    const albumCover = getSongAlbumCoverUrl(song);
    if (albumCover) return albumCover;
    const legacy = (song as { coverUrl?: unknown; cover?: unknown }).coverUrl
        ?? (song as { cover?: unknown }).cover;
    return typeof legacy === 'string' ? legacy : '';
};

/**
 * 用户选的播放音源，必须与 `omni.getAudioSource` 的分支同构。
 *
 * 那边是：启用了脚本 → 先问洛雪；没有 → 走 provider 自己的链。这里必须给出同样的答案，
 * 否则"原生继续的下一首"和"前台会播的下一首"走的不是同一条链路。
 * 非在线来源（本地 / Navidrome / 舞台）返回空串，交给旧的平台启发式。
 */
const selectedSourceId = (providerId: string): string => {
    if (!providerId) return '';
    if (!useLxSourceStore.getState().activeId) return `${providerId}-original`;
    const platform = Object.keys(LX_PLATFORMS).find(key => LX_PLATFORMS[key].original === providerId);
    return platform ? `lx:${platform}` : `${providerId}-original`;
};

const toPayload = (song: SongResult): NativePlaylistTrackPayload | null => {
    const songKey = getPlaybackSongKey(song);
    if (!songKey) return null;
    const ref = getPlaybackSourceRef(song);
    const online = ref?.kind === 'online' ? ref : null;
    const providerId = online?.providerId ?? '';
    return {
        songKey,
        providerId,
        mediaId: online?.mediaId ?? '',
        title: titleOf(song),
        artist: artistOf(song),
        album: albumOf(song),
        // 毫秒，不在这里换算：唯一一次转换发生在 `SongResult.durationMs` 本来就以毫秒表达的地方。
        // 之前这里 `/1000` 是整条错链的起点。
        durationMs: Math.max(0, Math.round(song.durationMs ?? 0)),
        artwork: artworkOf(song),
        // 用户选的音源：原生据此挑解析器，不再靠 providerId 猜。
        sourceId: selectedSourceId(providerId),
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
        // 歌单每次同步都顺带刷新一次解析器凭据：后台播放几个小时，会话早就可能过期，
        // 而凭据只在内存里（不落盘），不刷新就等于让原生拿一份旧会话去取地址。
        void syncResolverCredentials();
        void syncNeteaseResolverCredentials();
        void syncKugouResolverCredentials();
        void syncBodianResolverCredentials();
        void syncQishuiResolverCredentials();
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
 * 把原生解析需要的凭据交给原生：自建后端地址（用户配置）+ QQ 音乐登录 Cookie
 * （y.qq.com 扫码登录后 WebView 里已有的 uin/qm_keyst）。
 *
 * 登录态是后台 QQ 原版续播的钥匙：前台 `handleQQSongUrl` 的 web 形态 musicu 靠它拿到
 * purl，原生 QqResolver 的同名通道逐字段复刻了这个请求。Cookie 只进原生内存，
 * 不落盘、不进日志；没有登录态时就不传，原生 `canAttempt` 会如实报"无法解析"，
 * 绝不退回已被证伪的匿名通道假装成功。
 */
export const syncResolverCredentials = async (): Promise<void> => {
    const { base, cookie } = readQqNativeResolverConfig();
    let loginCookie = '';
    try {
        const { getQQCookie } = await import('../nativeBridge/api/cookies.js');
        loginCookie = await getQQCookie();
    } catch {
        // 拿不到登录态（未登录/非登录场景）就不传：原生会明确报告缺少凭据。
    }
    if (!base && !loginCookie) return;
    try {
        const native = getTingyuPlayback<TingyuPlaybackNative>();
        await native.setResolverCredentials({
            providerId: 'qq',
            values: { base, cookie, cookieAsHeader: 'false', loginCookie },
        });
    } catch {
        // 同上：增强，不是关键路径。
    }
};

/**
 * 网易云同构通道：把 WebView 里的网易云 Cookie（MUSIC_U 等登录态 + 匿名设备 Cookie）
 * 交给原生 NeteaseResolver —— 后台续播时由原生直连 interface.music.163.com 的 eapi 接口
 * 取地址，与前台 handleSongUrl 逐字段同构。Cookie 只进原生内存，不落盘、不进日志。
 */
export const syncNeteaseResolverCredentials = async (): Promise<void> => {
    try {
        const { getNeteaseCookie } = await import('../nativeBridge/api/cookies.js');
        const cookie = await getNeteaseCookie();
        if (!cookie) return;
        const native = getTingyuPlayback<TingyuPlaybackNative>();
        await native.setResolverCredentials({ providerId: 'netease', values: { cookie } });
    } catch {
        // 拿不到登录态/插件不在：原生会如实报告缺少凭据并回落 JS 通道。
    }
};

/**
 * 酷狗同构通道：把 WebView CookieManager 里的酷狗 Cookie（userid/token/dfid/vip_token）
 * 交给原生 KugouResolver —— 后台续播时由原生直连酷狗网关与 tracker 取地址，
 * 与前台 handleKGSongUrl 的五条取链策略同构（原生移植了 v5/playInfo/getdata/tracker 四条）。
 * Cookie 只进原生内存，不落盘、不进日志。
 */
export const syncKugouResolverCredentials = async (): Promise<void> => {
    try {
        const { getKGCookie } = await import('../nativeBridge/api/cookies.js');
        const cookie = await getKGCookie();
        if (!cookie) return;
        const native = getTingyuPlayback<TingyuPlaybackNative>();
        await native.setResolverCredentials({ providerId: 'kugou', values: { cookie } });
    } catch {
        // 同上：增强，不是关键路径。
    }
};

/**
 * 波点同构通道：bodian.js 的会话存 localStorage bodianSessionV1（{uid, token}），
 * 波点 API 不用 Cookie，凭据走这里下发；匿名（uid=-1）也能播免费曲目，因此没有会话就不传。
 */
export const syncBodianResolverCredentials = async (): Promise<void> => {
    try {
        const raw = localStorage.getItem('bodianSessionV1');
        if (!raw) return;
        const parsed = JSON.parse(raw) as { uid?: unknown; token?: unknown } | null;
        const uid = parsed && typeof parsed.uid === 'string' ? parsed.uid : '';
        const token = parsed && typeof parsed.token === 'string' ? parsed.token : '';
        if (!uid || !token) return;
        const native = getTingyuPlayback<TingyuPlaybackNative>();
        await native.setResolverCredentials({ providerId: 'bodian', values: { session: JSON.stringify({ uid, token }) } });
    } catch {
        // 同上。
    }
};

/**
 * 汽水同构通道：qishui.js 的车机会话存 localStorage qishuiSessionV1
 * （{userId, ticket, guardKey(P-256 PKCS#8 PEM), guardCert, guardTsSign, …}）+ qishuiDeviceId。
 * 原生 QishuiResolver 用同一份凭据在后台做 ticket-guard ECDSA 签名直连 media/mget。
 * 无会话时不传：原生走匿名 client-token 通道播免费曲目。凭据只进原生内存。
 */
export const syncQishuiResolverCredentials = async (): Promise<void> => {
    try {
        const raw = localStorage.getItem('qishuiSessionV1');
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, unknown> | null;
        const ticket = parsed && typeof parsed.ticket === 'string' ? parsed.ticket : '';
        const guardKey = parsed && typeof parsed.guardKey === 'string' ? parsed.guardKey : '';
        const guardCert = parsed && typeof parsed.guardCert === 'string' ? parsed.guardCert : '';
        const guardTsSign = parsed && typeof parsed.guardTsSign === 'string' ? parsed.guardTsSign : '';
        const userId = parsed && typeof parsed.userId === 'string' ? parsed.userId : '';
        if (!ticket || !guardKey || !guardCert || !guardTsSign) return;
        const deviceId = localStorage.getItem('qishuiDeviceId') ?? '';
        const native = getTingyuPlayback<TingyuPlaybackNative>();
        await native.setResolverCredentials({ providerId: 'qishui', values: { session: JSON.stringify({ userId, ticket, guardKey, guardCert, guardTsSign, deviceId }) } });
    } catch {
        // 同上。
    }
};

/** 测试用：忘掉上一次的签名，强制下一次同步真的下发。 */
export const resetNativePlaylistSyncForTest = (): void => {
    lastSignature = '';
};
