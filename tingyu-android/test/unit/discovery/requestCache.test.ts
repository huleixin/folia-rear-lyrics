import { describe, expect, it } from 'vitest';
import { DiscoveryRequestCache } from '../../../src/services/discovery/requestCache';
describe('discovery request budget', () => {
    it('allows refresh to repopulate a previously empty section without waiting for its TTL', async () => {
        const cache=new DiscoveryRequestCache();let calls=0;
        const work=async()=>++calls===1?[]:['new content'];
        expect(await cache.read('section',900000,work)).toEqual([]);
        expect(await cache.read('section',900000,work,undefined,true)).toEqual(['new content']);
        expect(await cache.read('section',900000,work)).toEqual(['new content']);
        expect(calls).toBe(2);
    });
    it('shares concurrent requests and cached answers', async () => {
        const cache = new DiscoveryRequestCache(); let calls = 0;
        const work = async () => ++calls;
        expect(await Promise.all([cache.read('a', 1000, work), cache.read('a', 1000, work)])).toEqual([1, 1]);
        expect(await cache.read('a', 1000, work)).toBe(1);
        expect(await cache.read('other-account', 1000, work)).toBe(2);
    });
    it('keeps the concurrency budget when a consumer cancels', async () => {
        const cache = new DiscoveryRequestCache(1); const controller = new AbortController();
        let finish!: (value: number) => void; let started = false;
        const first = cache.read('a', 1000, () => new Promise<number>(resolve => { finish = resolve; }), controller.signal);
        controller.abort();
        await expect(first).rejects.toMatchObject({ name: 'AbortError' });
        const second = cache.read('b', 1000, async () => { started = true; return 2; });
        await Promise.resolve(); expect(started).toBe(false);
        finish(1); expect(await second).toBe(2);
    });
    it('does not cache failures', async () => {
        const cache = new DiscoveryRequestCache();
        await expect(cache.read('a', 1000, async () => { throw Error('offline'); })).rejects.toThrow();
        expect(await cache.read('a', 1000, async () => 3)).toBe(3);
    });
});
