// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/services/nativeLyricPriming.test.ts
// C2 的可复现测试：锁屏连播切到第二首时歌词为什么空。
//
// 现场链路（1.3.50 之前）：换歌瞬间预置一次 → 那一刻第二首的歌词还在网络上（预取未完成）
// → 预置跳过它 → 预取晚一点到达，但**没有任何东西会再预置一次** → Media3 后台自动换歌时
// 原生缓存里没有第二首 → 灵动岛空着，直到用户打开 App 让播放器页重新走一遍取词。
//
// 这里把这条链路拆成三层分别断言：拿得到（数据）、建得对（时间轴绑定 songKey）、
// 发得出去（写进原生缓存）。

const bridge = vi.hoisted(() => ({
    publish: vi.fn(async (_lyricInfo: string, _hasTranslation: boolean, _songKey?: string) => true),
    clear: vi.fn(async (_options?: { songKey?: string | null }) => undefined),
}));
vi.mock('@/platform/foliaColorOsLyrics', () => ({
    publishColorOsLyricInfo: bridge.publish,
    clearColorOsLyricInfo: bridge.clear,
}));

/** 预取内存（进程内 Map，非持久）。 */
const prefetched = vi.hoisted(() => new Map<string, any>());
vi.mock('@/services/prefetchService', () => ({
    getPrefetchedData: (song: any) => prefetched.get(String(song.id)) ?? null,
}));

/** IndexedDB 里的歌词（持久），只有「这首歌作为当前曲被真正加载过」才会有。 */
const persisted = vi.hoisted(() => new Map<string, any>());
const saved = vi.hoisted(() => [] as Array<[string, any]>);
vi.mock('@/services/onlineMusic/resourceCache', () => ({
    getSongCacheWithLegacyMigration: async (_kind: string, song: any) => persisted.get(String(song.id)) ?? null,
    getSongResourceCacheKey: (kind: string, song: any) => `${kind}:${song.id}`,
}));
vi.mock('@/services/db', () => ({
    saveToCache: async (key: string, value: any) => { saved.push([key, value]); },
}));

const omni = vi.hoisted(() => ({ getLyrics: vi.fn() }));
vi.mock('@/services/onlineMusic/omni', () => ({ omni }));

const song = (id: number) => ({
    id,
    name: `Song ${id}`,
    artists: [{ name: 'Artist' }],
    album: { id: 1, name: 'Album' },
    sourceRef: { kind: 'online', providerId: 'qq', mediaId: id },
    durationMs: 200000,
} as any);

const lyrics = (text: string) => ({
    lines: [{ startTime: 0, endTime: 1000, fullText: text }],
    isWordByWord: false,
    hasTranslation: false,
} as any);

const keyOf = (id: number) => `online:qq:${id}`;

const publishedKeys = () => bridge.publish.mock.calls.map(call => call[2]);
const bodyFor = (id: number) => {
    const call = bridge.publish.mock.calls.find(entry => entry[2] === keyOf(id));
    return call ? JSON.parse(call[0] as string) : null;
};

describe('native lyric priming', () => {
    beforeEach(async () => {
        vi.resetModules();
        bridge.publish.mockClear();
        prefetched.clear();
        persisted.clear();
        saved.length = 0;
        omni.getLyrics.mockReset();
        const priming = await import('@/services/nativeLyricPriming');
        priming.resetNativeLyricPriming();
    });

    it('publishes an upcoming track again when its lyrics arrive after the priming pass', async () => {
        const priming = await import('@/services/nativeLyricPriming');
        const second = song(2);

        // 换歌瞬间：预取还没回来，两处缓存都没有这首歌。
        await priming.primeNativeLyricsForSongs([second], 'hires');
        expect(bridge.publish).not.toHaveBeenCalled();

        // 预取完成：歌词落进预取内存，并且被报告出来。
        prefetched.set('2', { lyrics: lyrics('第二首歌词') });
        const uninstall = priming.installNativeLyricPrimer();
        window.dispatchEvent(new CustomEvent('tingyu-lyrics-prefetched', { detail: { song: second } }));
        await new Promise(resolve => setTimeout(resolve, 0));

        // 这一首本来就是「要预置」的那一首，歌词一到就必须补进原生缓存。
        expect(publishedKeys()).toContain(keyOf(2));
        expect(bodyFor(2)?.lyric).toContain('第二首歌词');
        uninstall();
    });

    it('does not prime a track that was never in the queue window, even if lyrics arrive', async () => {
        const priming = await import('@/services/nativeLyricPriming');
        const uninstall = priming.installNativeLyricPrimer();
        prefetched.set('9', { lyrics: lyrics('歌单外的歌') });
        window.dispatchEvent(new CustomEvent('tingyu-lyrics-prefetched', { detail: { song: song(9) } }));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(bridge.publish).not.toHaveBeenCalled();
        uninstall();
    });

    it('fetches lyrics on demand when nothing is cached, and persists them for the next cold read', async () => {
        const priming = await import('@/services/nativeLyricPriming');
        omni.getLyrics.mockResolvedValue({ lyrics: lyrics('按需取到的第二首') });

        const published = await priming.ensureNativeLyric(song(3), 'hires', { fetch: true });

        expect(published).toBe(true);
        expect(omni.getLyrics).toHaveBeenCalledTimes(1);
        expect(publishedKeys()).toEqual([keyOf(3)]);
        expect(bodyFor(3)?.lyric).toContain('按需取到的第二首');
        // 落盘：下一次冷启动（原生请求、或 WebView 重载）不必再联网。
        // key 与播放器页读的是同一个（`lyric_<songKey>`），否则补过的词等于没补。
        expect(saved.map(entry => entry[0])).toContain(`lyric_${keyOf(3)}`);
    });

    it('never issues two fetches for the same track at once', async () => {
        const priming = await import('@/services/nativeLyricPriming');
        let release: (value: any) => void = () => undefined;
        omni.getLyrics.mockReturnValue(new Promise(resolve => { release = resolve; }));

        const first = priming.ensureNativeLyric(song(4), 'hires', { fetch: true });
        const second = priming.ensureNativeLyric(song(4), 'hires', { fetch: true });
        release({ lyrics: lyrics('只取一次') });

        await Promise.all([first, second]);
        expect(omni.getLyrics).toHaveBeenCalledTimes(1);
        expect(publishedKeys()).toEqual([keyOf(4)]);
    });

    it('answers from the cache instead of the network when the timeline is already known', async () => {
        const priming = await import('@/services/nativeLyricPriming');
        persisted.set('5', lyrics('缓存里的第五首'));

        const published = await priming.ensureNativeLyric(song(5), 'hires', { fetch: true });

        expect(published).toBe(true);
        expect(omni.getLyrics).not.toHaveBeenCalled();
        expect(bodyFor(5)?.lyric).toContain('缓存里的第五首');
    });

    it('reports a confirmed miss instead of publishing an empty timeline', async () => {
        const priming = await import('@/services/nativeLyricPriming');
        omni.getLyrics.mockResolvedValue({ lyrics: null });

        const published = await priming.ensureNativeLyric(song(6), 'hires', { fetch: true });

        expect(published).toBe(false);
        // 没有词 ≠ 有空的词：这里不发布时间轴，只宣告「确认没有」，
        // 原生据此停止重问（否则每 3 秒又联网一次，答案永远是同一个）。
        expect(bridge.publish).not.toHaveBeenCalled();
        expect(bridge.clear).toHaveBeenCalledWith(keyOf(6));

        // 同一个答案不再问第二遍。
        await priming.ensureNativeLyric(song(6), 'hires', { fetch: true });
        expect(omni.getLyrics).toHaveBeenCalledTimes(1);
    });
});
