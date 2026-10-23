import { afterEach, describe, expect, it, vi } from 'vitest';

// test/unit/nativeBridge/qqSubscription.test.ts
//
// 「收藏添加失败」的另一半：专辑与歌单收藏。两处以前是错的 ——
//   * uin 取了 qqCookieUin 的值，而那是带 `o` 前缀的 o002774749（参考实现用的是 str_musicid 裸值）；
//   * 发的是网页 comm，而这些是 musicasset 客户端模块，认 android comm。
// 这里把读/写两个形态、android comm 与失败判定都钉住。

const COOKIE = [
    'uin=o002774749',
    'qqmusic_uin=o002774749',
    'str_musicid=3379082',
    'qm_keyst=MUSICKEY',
    'qqmusic_key=MUSICKEY',
    'login_type=1',
].join('; ');

const ALBUM_MID = 'ALBUMMID';

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
});

const installFetchStub = (options: { fan?: boolean; acceptWrite?: boolean; failedIds?: boolean } = {}) => {
    const calls: Array<{ url: string; module: string; method: string; param: Record<string, any>; comm: Record<string, any> }> = [];
    let fan = options.fan ?? false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        const payload = JSON.parse(String(init?.body || '{}'));
        const module = String(payload?.req_0?.module || '');
        const method = String(payload?.req_0?.method || '');
        calls.push({ url: String(url), module, method, param: payload?.req_0?.param || {}, comm: payload.comm || {} });

        if (module === 'music.musicasset.AlbumFavRead') {
            return jsonResponse({ code: 0, req_0: { code: 0, data: { m_fan: { [ALBUM_MID]: fan } } } });
        }
        if (module === 'music.musicasset.AlbumFavWrite') {
            if (options.acceptWrite !== false) fan = method === 'FavAlbum';
            return jsonResponse({
                code: 0,
                req_0: {
                    code: 0,
                    data: options.acceptWrite === false
                        ? { result: -1, v_failedAlbumId: [ALBUM_MID], v_failedAlbumMid: [ALBUM_MID] }
                        : { result: 0, v_failedAlbumId: [], v_failedAlbumMid: [] },
                },
            });
        }
        if (module === 'music.musicasset.PlaylistFavWrite') {
            return jsonResponse({
                code: 0,
                req_0: {
                    code: 0,
                    data: options.failedIds
                        ? { result: 0, v_failedPlaylistId: [999] }
                        : { result: 0, v_failedPlaylistId: [] },
                },
            });
        }
        return jsonResponse({ code: 0, req_0: { code: 0, data: {} } });
    }));
    const relevant = () => calls.filter(call => call.module.startsWith('music.musicasset.'));
    return relevant;
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('QQ album subscribe', () => {
    it('reads with the numeric uin and writes with the bare string uin', async () => {
        const calls = installFetchStub();
        const { handleQQAlbumSubscribe } = await import('@/nativeBridge/api/qq.js');
        const result = await handleQQAlbumSubscribe({ id: ALBUM_MID, subscribed: true }, COOKIE);

        expect(result).toEqual({ code: 0, subscribed: true });
        const [read, write, verify] = calls();
        expect(read.method).toBe('IsAlbumFan');
        // 读用数字形态（参考实现的 statusUin）。
        expect(read.param.uin).toBe(3379082);
        expect(write.method).toBe('FavAlbum');
        // 写用裸字符串 —— 不是带 `o` 前缀的 o002774749。
        expect(write.param.uin).toBe('3379082');
        expect(verify.method).toBe('IsAlbumFan');
    });

    // 读与写都走 android comm（现场矩阵自检定出来的可用身份）；
    // 区别在 g_tk：写入接口要 CSRF token，读取不带也能过。
    it('writes with the android comm plus g_tk', async () => {
        const calls = installFetchStub();
        const { handleQQAlbumSubscribe } = await import('@/nativeBridge/api/qq.js');
        await handleQQAlbumSubscribe({ id: ALBUM_MID, subscribed: true }, COOKIE);

        const writes = calls().filter(call => call.module === 'music.musicasset.AlbumFavWrite');
        expect(writes.length).toBeGreaterThan(0);
        for (const write of writes) {
            expect(write.comm).toMatchObject({ ct: 11, tmeAppID: 'qqmusic', qq: '3379082' });
            expect(write.comm.uin).toBeUndefined();
            expect(write.url).toContain('g_tk=5381');
        }

        const reads = calls().filter(call => call.module !== 'music.musicasset.AlbumFavWrite');
        expect(reads.length).toBeGreaterThan(0);
        for (const read of reads) {
            expect(read.comm.ct).toBe(11);
            expect(read.url).not.toContain('g_tk=');
        }
    });

    it('does not write when it is already subscribed', async () => {
        const calls = installFetchStub({ fan: true });
        const { handleQQAlbumSubscribe } = await import('@/nativeBridge/api/qq.js');
        const result = await handleQQAlbumSubscribe({ id: ALBUM_MID, subscribed: true }, COOKIE);

        expect(result).toEqual({ code: 0, subscribed: true });
        expect(calls().map(call => call.method)).toEqual(['IsAlbumFan']);
    });

    it('reports a failure when the upstream lists the album as failed', async () => {
        installFetchStub({ acceptWrite: false });
        const { handleQQAlbumSubscribe } = await import('@/nativeBridge/api/qq.js');
        const result = await handleQQAlbumSubscribe({ id: ALBUM_MID, subscribed: true }, COOKIE);

        expect(result).toMatchObject({ __foliaBridgeError: 'NETWORK' });
    });
});

describe('QQ playlist subscribe', () => {
    it('sends the bare music id as uin', async () => {
        const calls = installFetchStub();
        const { handleQQPlaylistSubscribe } = await import('@/nativeBridge/api/qq.js');
        const result = await handleQQPlaylistSubscribe({ tid: 12345, subscribed: true }, COOKIE);

        expect(result).toEqual({ code: 0, subscribed: true });
        const [write] = calls();
        expect(write.module).toBe('music.musicasset.PlaylistFavWrite');
        expect(write.method).toBe('FavPlaylist');
        expect(write.param.uin).toBe('3379082');
        expect(write.param.v_playlistId).toEqual([12345]);
        // 写入走实测可用的形状：android comm + g_tk（见上面的用例说明）。
        expect(write.comm.ct).toBe(11);
        expect(write.url).toContain('g_tk=5381');
    });

    it('fails when the upstream reports a failed playlist id', async () => {
        installFetchStub({ failedIds: true });
        const { handleQQPlaylistSubscribe } = await import('@/nativeBridge/api/qq.js');
        const result = await handleQQPlaylistSubscribe({ tid: 12345, subscribed: true }, COOKIE);

        expect(result).toMatchObject({ __foliaBridgeError: 'NETWORK' });
    });
});

describe('QQ subscription status', () => {
    it('asks for albums with the numeric uin and for playlists without one', async () => {
        const calls = installFetchStub();
        const { handleQQSubscriptionStatus } = await import('@/nativeBridge/api/qq.js');

        await handleQQSubscriptionStatus('album', ALBUM_MID, COOKIE);
        await handleQQSubscriptionStatus('playlist', '12345', COOKIE);

        const [album, playlist] = calls();
        expect(album.param.uin).toBe(3379082);
        expect(album.param.v_albumMid).toEqual([ALBUM_MID]);
        // 歌单状态只送 v_tid，没有 uin。
        expect(playlist.param).toEqual({ v_tid: [12345] });
        expect(playlist.comm.ct).toBe(11);
    });
});
