import { describe, expect, it, vi, beforeEach } from 'vitest';

// 阶段 A 的 JS 侧：把逻辑歌单与播放顺序交给原生。
// 这里只验证"交给原生的是什么"，不验证原生怎么用（那是 JVM 侧的责任）。

interface PlaylistPayload {
    mode: string;
    loopAll: boolean;
    quality: string;
    tracks: Array<Record<string, unknown>>;
}

const playlistCalls: PlaylistPayload[] = [];
const modeCalls: Array<{ mode: string; loopAll: boolean }> = [];

const setNativePlaylist = vi.fn(async (payload: PlaylistPayload) => {
    playlistCalls.push(payload);
    return { generation: playlistCalls.length, size: payload.tracks.length };
});
const setNativePlaylistMode = vi.fn(async (payload: { mode: string; loopAll: boolean }) => {
    modeCalls.push(payload);
    return { generation: modeCalls.length };
});
const setResolverCredentials = vi.fn(async () => ({ configured: true }));

const lastPlaylist = (): PlaylistPayload => {
    const payload = playlistCalls[playlistCalls.length - 1];
    if (!payload) throw new Error('no playlist was handed over');
    return payload;
};

vi.mock('../../../src/platform/tingyuPlayback', () => ({
    getTingyuPlayback: () => ({ setNativePlaylist, setNativePlaylistMode, setResolverCredentials }),
}));

// 预置歌词读的是 IndexedDB / 预取缓存，与"交给原生什么"无关；这里只关心载荷本身。
const primeNativeLyricsForSongs = vi.fn(async () => undefined);
vi.mock('../../../src/services/nativeLyricPriming', () => ({
    primeNativeLyricsForSongs: (...args: unknown[]) => primeNativeLyricsForSongs(...args as []),
    LYRIC_PRIME_AHEAD: 12,
}));

const song = (id: string, providerId = 'qq') => ({
    id,
    name: `song-${id}`,
    artists: [{ id: 1, name: 'artist' }],
    album: { id: 2, name: 'album' },
    durationMs: 200_000,
    sourceRef: { kind: 'online', providerId, mediaId: id, providerData: { mediaMid: `mm-${id}` } },
}) as never;

const { syncNativePlaylist, syncNativePlaylistMode, resetNativePlaylistSyncForTest } = await import(
    '../../../src/services/nativePlaylistSync'
);

describe('nativePlaylistSync', () => {
    beforeEach(() => {
        setNativePlaylist.mockClear();
        setNativePlaylistMode.mockClear();
        setResolverCredentials.mockClear();
        playlistCalls.length = 0;
        modeCalls.length = 0;
        resetNativePlaylistSyncForTest();
    });

    it('hands the current track plus its successors, in order', async () => {
        const queue = [song('a'), song('b'), song('c')];
        await syncNativePlaylist({ song: queue[0], queue, loop: 'off', shuffle: false, quality: 'high' });
        expect(setNativePlaylist).toHaveBeenCalledTimes(1);
        const payload = lastPlaylist();
        // songKey 必须与 Media3 的 mediaId 完全一致，否则原生拿它找不到锚点。
        expect(payload.tracks.map(item => item.songKey))
            .toEqual(['online:qq:a', 'online:qq:b', 'online:qq:c']);
        expect(payload.mode).toBe('off');
        expect(payload.tracks[0].providerId).toBe('qq');
        expect(payload.tracks[0].providerData).toEqual({ mediaMid: 'mm-a' });
        // 契约是**毫秒**。这首歌 200 秒 → 200000ms。老测试断言 200（秒），正是因为它在
        // 保护错误的契约，真机上才一路绿灯地把卡片时长发成 200ms。
        expect(payload.tracks[0].durationMs).toBe(200_000);
        // 旧的秒字段不许再出现：两条路径（窗口 / 逻辑歌单）单位不同才是这次的根因。
        expect(payload.tracks[0]).not.toHaveProperty('duration');
    });

    it('never puts a playable url in the payload', async () => {
        const queue = [song('a'), song('b')];
        await syncNativePlaylist({ song: queue[0], queue, loop: 'all', shuffle: false, quality: 'high' });
        const payload = lastPlaylist();
        // 地址会过期，必须由原生现取；同步里出现 uri/url 就是设计错误。
        expect(JSON.stringify(payload)).not.toMatch(/https?:\/\//);
        expect(payload.tracks[0]).not.toHaveProperty('uri');
        expect(payload.tracks[0]).not.toHaveProperty('url');
    });

    it('maps the loop and shuffle settings onto the native mode', async () => {
        const queue = [song('a'), song('b')];
        await syncNativePlaylist({ song: queue[0], queue, loop: 'all', shuffle: false, quality: 'high' });
        expect(lastPlaylist().mode).toBe('all');
        resetNativePlaylistSyncForTest();
        await syncNativePlaylist({ song: queue[0], queue, loop: 'one', shuffle: false, quality: 'high' });
        expect(lastPlaylist().mode).toBe('one');
        resetNativePlaylistSyncForTest();
        await syncNativePlaylist({ song: queue[0], queue, loop: 'off', shuffle: true, quality: 'high' });
        expect(lastPlaylist().mode).toBe('shuffle');
    });

    it('does not re-send an unchanged playlist', async () => {
        const queue = [song('a'), song('b')];
        await syncNativePlaylist({ song: queue[0], queue, loop: 'off', shuffle: false, quality: 'high' });
        await syncNativePlaylist({ song: queue[0], queue, loop: 'off', shuffle: false, quality: 'high' });
        expect(setNativePlaylist).toHaveBeenCalledTimes(1);
    });

    it('syncs the mode on its own so a mode change invalidates in-flight resolutions', async () => {
        await syncNativePlaylistMode('one', false);
        expect(modeCalls[0]).toEqual({ mode: 'one', loopAll: false });
        await syncNativePlaylistMode('off', true);
        expect(modeCalls[1]).toEqual({ mode: 'shuffle', loopAll: false });
    });

    it('stays silent when nothing is playing', async () => {
        await syncNativePlaylist({ song: null, queue: [song('a')], loop: 'off', shuffle: false, quality: 'high' });
        expect(setNativePlaylist).not.toHaveBeenCalled();
    });

    it('publishes a 200-second song as 200000ms, never as 200', async () => {
        // 真机上「锁屏总时长 00:00、进度条不动」就是这条数字发成 200 的结果：
        // 发布 200ms 后，PlaybackPositionClock 会把任何位置钳在 200ms。
        const queue = [song('aq'), song('bq')];
        await syncNativePlaylist({ song: queue[0], queue, loop: 'off', shuffle: false, quality: 'high' });
        const first = lastPlaylist().tracks[0];
        expect(first.durationMs).toBe(200_000);
        expect(Number(first.durationMs)).toBeGreaterThan(1_000);
    });

    it('keeps an unknown duration at 0 instead of inventing a value', async () => {
        const unknown = { ...(song('u') as Record<string, unknown>), durationMs: undefined };
        await syncNativePlaylist({
            song: unknown as never, queue: [unknown as never], loop: 'off', shuffle: false, quality: 'high',
        });
        expect(lastPlaylist().tracks[0].durationMs).toBe(0);
    });
});

// ---- 封面：SongResult 把它放在 album.coverUrl ----
//
// 之前这里读的是顶层 `coverUrl`，而 `SongResult` 根本没有这个字段 —— 于是交给原生的
// `artwork` 恒为空串。前台播放看不出问题（系统卡片由 JS 推当前曲，带的是正确地址），
// 但只要 Media3 自己切歌、由原生接管，那个 MediaItem 就没有封面，锁屏只剩占位图。
describe('nativePlaylistSync artwork', () => {
    const COVER = 'https://y.gtimg.cn/music/photo_new/T002R300x300M000004Z8cTB0FsM7A.jpg';

    it('takes the cover from album.coverUrl, the only place SongResult keeps it', async () => {
        const covered = { ...(song('cv') as Record<string, unknown>), album: { id: 3, name: 'album', coverUrl: COVER } };
        await syncNativePlaylist({
            song: covered as never, queue: [covered as never], loop: 'off', shuffle: false, quality: 'high',
        });
        expect(lastPlaylist().tracks[0].artwork).toBe(COVER);
    });

    it('keeps it empty rather than inventing a cover when the album has none', async () => {
        await syncNativePlaylist({ song: song('nc'), queue: [song('nc')], loop: 'off', shuffle: false, quality: 'high' });
        expect(lastPlaylist().tracks[0].artwork).toBe('');
    });
});
