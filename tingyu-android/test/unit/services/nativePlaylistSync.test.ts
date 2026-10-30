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
        expect(payload.tracks[0].duration).toBe(200);
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
});
