import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/nativeBridge/neteaseSongLike.test.ts
//
// 现场问题：提示「收藏成功」，但收藏里没有这首歌。
// 原因是这里只打 /api/radio/like（私人FM 的喜欢）而且不校验结果 —— 上游回 code 200 就算成功，
// 于是 UI 点亮心形、缓存把歌记成已收藏。现在要求「写完再读确认」，没生效就换 /api/song/like
// 再试一次，仍没生效就报错。

const COOKIE = 'MUSIC_U=MUSICU';

const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
});

type StubOptions = {
    /** /api/radio/like 是否真的写进收藏库（默认 true：写生效）。 */
    radioApplies?: boolean;
    /** /api/song/like 是否真的写进收藏库（默认 true）。 */
    songLikeApplies?: boolean;
    /** 起始就是已收藏。 */
    alreadyLiked?: boolean;
    /** 这次是「取消收藏」（写入的内容是加密的，桩只能按调用方声明的方向模拟）。 */
    direction?: 'like' | 'unlike';
};

const installFetchStub = (options: StubOptions = {}) => {
    const paths: string[] = [];
    const applyRadio = options.radioApplies !== false;
    const applySong = options.songLikeApplies !== false;
    const target = options.direction === 'unlike' ? false : true;
    let liked = options.alreadyLiked === true;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const path = new URL(String(url)).pathname;
        paths.push(path);

        if (path.endsWith('/nuser/account/get')) {
            return jsonResponse({
                code: 200,
                profile: { userId: 7, nickname: 'listener' },
                account: { id: 7 },
            });
        }
        if (path.includes('music-vip-membership')) return jsonResponse({ code: 200, data: {} });
        if (path.endsWith('/song/like/check')) return jsonResponse({ code: 200, data: { 123456: liked } });
        if (path.endsWith('/radio/like')) {
            if (applyRadio) liked = target;
            return jsonResponse({ code: 200 });
        }
        if (path.endsWith('/song/like')) {
            if (applySong) liked = target;
            return jsonResponse({ code: 200 });
        }
        return jsonResponse({ code: 200 });
    }));
    return { paths };
};

const loadHandler = async () => (await import('@/nativeBridge/api/netease.js')).handleSongLike;

describe('NetEase song like', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    // 主路径是收藏库那条 /api/song/like（本机实测参数被接受）；私人FM 的 /api/radio/like 会被
    // 风控挡（code=-460 网络环境存在风险），所以只在主路径没生效时才退过去。
    it('writes through /api/song/like and confirms by re-reading', async () => {
        const { paths } = installFetchStub();
        const like = await loadHandler();
        const result = await like(123456, true, COOKIE);

        expect(result).toMatchObject({ liked: true, via: '/api/song/like' });
        expect(paths.some(path => path.endsWith('/radio/like'))).toBe(false);
        // 写完必须复查过（不是靠上游自报）。写前也读一次，所以至少两次。
        expect(paths.filter(path => path.endsWith('/song/like/check')).length).toBeGreaterThanOrEqual(2);
    });

    it('falls back to /api/radio/like when the library endpoint did not apply', async () => {
        const { paths } = installFetchStub({ songLikeApplies: false, radioApplies: true });
        const like = await loadHandler();
        const result = await like(123456, true, COOKIE);

        expect(result).toMatchObject({ liked: true, via: '/api/radio/like' });
        expect(paths.some(path => path.endsWith('/radio/like'))).toBe(true);
    });

    // 两个端点都没让它进收藏库：必须报错，让 UI 显示失败 —— 不能假报成功。
    it('reports a failure instead of a false success when nothing applied', async () => {
        installFetchStub({ radioApplies: false, songLikeApplies: false });
        const like = await loadHandler();
        const result = await like(123456, true, COOKIE);

        expect(result.error).toContain('LIKE_NOT_APPLIED');
        expect(result.liked).toBe(false);
    });

    it('returns early without writing when the song is already liked', async () => {
        const { paths } = installFetchStub({ alreadyLiked: true });
        const like = await loadHandler();
        const result = await like(123456, true, COOKIE);

        expect(result).toMatchObject({ liked: true, via: 'already' });
        expect(paths.some(path => path.endsWith('/song/like'))).toBe(false);
    });

    it('confirms an unlike by reading the relation back', async () => {
        const { paths } = installFetchStub({ alreadyLiked: true, direction: 'unlike' });
        const like = await loadHandler();
        const result = await like(123456, false, COOKIE);

        expect(paths.some(path => path.endsWith('/song/like'))).toBe(true);
        expect(result.liked).toBe(false);
        expect(result.error).toBeUndefined();
    });
});
