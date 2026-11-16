import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnifiedLibrary, type LibraryScope, type LibraryPageState } from '../../../../src/library/core/services/unifiedLibrary';
import type { ProviderPage, ProviderCollection } from '../../../../src/types/onlineMusic';

// test/unit/library/core/unifiedLibrary.test.ts
const page = (providerId: string, id = '1'): ProviderPage<ProviderCollection> => ({
    items: [{ providerId, id, type: 'playlist', name: id }], hasMore: false, nextOffset: 1,
});
const deferred = <T>() => { let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
    const scopes: Record<string, LibraryScope> = {};
    const scope = (id: string) => scopes[id] ||= { userId: 'alice', generation: 0, ready: true, authenticated: true };
    const read = vi.fn(async (id: string) => page(id));
    const supports = vi.fn(() => true);
    return { scopes, scope, read, supports, service: new UnifiedLibrary({ scope, read, supports }) };
}
afterEach(() => vi.useRealTimers());
describe('unified library account and paging isolation', () => {
    it('merges identical requests, caches pages and separates resources and pagination', async () => {
        const f = fixture();
        await Promise.all([f.service.page('a', 'playlists'), f.service.page('a', 'playlists')]);
        await f.service.page('a', 'playlists');
        expect(f.read).toHaveBeenCalledTimes(1);
        await f.service.page('a', 'albums');
        await f.service.page('a', 'playlists', { offset: 50 });
        expect(f.read).toHaveBeenCalledTimes(3);
    });
    it('rejects late responses after account changes and does not reuse another user cache', async () => {
        const f = fixture(), pending = deferred<ProviderPage<ProviderCollection>>();
        f.read.mockImplementationOnce(() => pending.promise);
        const first = f.service.page('a', 'playlists');
        f.scopes.a = { ...f.scope('a'), userId: 'bob', generation: 1 };
        pending.resolve(page('a', 'alice-private'));
        await expect(first).rejects.toMatchObject({ name: 'AbortError' });
        expect((await f.service.page('a', 'playlists')).items[0].id).toBe('1');
        expect(f.read).toHaveBeenCalledTimes(2);
    });
    it('invalidates cached data on logout and relogin of the same user', async () => {
        const f = fixture(); await f.service.page('a', 'playlists');
        f.scope('a').generation++;
        await f.service.page('a', 'playlists');
        expect(f.read).toHaveBeenCalledTimes(2);
    });
    it('publishes fast source independently of a slow source and isolates failures', async () => {
        const f = fixture(), slow = deferred<ProviderPage<ProviderCollection>>();
        f.read.mockImplementation(async id => {
            if (id === 'slow') return slow.promise;
            if (id === 'bad') throw Error('offline');
            return page(id);
        });
        const published: LibraryPageState[] = [];
        const task = f.service.load(['slow', 'fast', 'bad'], 'playlists', value => published.push(value));
        await vi.waitFor(() => expect(published.map(p => p.providerId)).toEqual(['fast', 'bad']));
        slow.resolve(page('slow'));
        expect((await task).map(p => p.status)).toEqual(['ready', 'ready', 'error']);
    });
    it('does not start a queued request after its account changes', async () => {
        const f = fixture(), slow = deferred<ProviderPage<ProviderCollection>>();
        f.read.mockImplementation(() => slow.promise);
        const first = f.service.page('a', 'playlists'), second = f.service.page('b', 'playlists');
        const queued = f.service.page('c', 'playlists');
        const assertion = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
        f.scope('c').generation++;
        slow.resolve(page('a'));
        await Promise.all([first, second, assertion]);
        expect(f.read).toHaveBeenCalledTimes(2);
    });
    it('waits for hydration and distinguishes login and unsupported without requests', async () => {
        const f = fixture(); f.scope('a').ready = false;
        expect((await f.service.page('a', 'playlists')).status).toBe('loading');
        f.scope('a').ready = true; f.scope('a').authenticated = false;
        expect((await f.service.page('a', 'playlists')).status).toBe('login');
        f.scope('a').authenticated = true; f.supports.mockReturnValue(false);
        expect((await f.service.page('a', 'playlists')).status).toBe('unsupported');
        expect(f.read).not.toHaveBeenCalled();
    });
    it('deduplicates only owned identities and stops nonadvancing pages', async () => {
        const f = fixture(); f.read.mockResolvedValue({ items: [...page('a').items, ...page('a').items,
            ...page('b').items, ...page('a', '2').items], hasMore: true, nextOffset: 0 });
        const result = await f.service.page('a', 'playlists');
        expect(result.items.map(item => item.id)).toEqual(['1', '2']); expect(result.hasMore).toBe(false);
    });
    it('empty local-only source list performs no online work', async () => {
        const f = fixture(); expect(await f.service.load([], 'playlists', vi.fn())).toEqual([]);
        expect(f.read).not.toHaveBeenCalled();
    });
    it('abort prevents consumer publication without cancelling another consumer', async () => {
        const f = fixture(), slow = deferred<ProviderPage<ProviderCollection>>();
        f.read.mockImplementation(() => slow.promise);
        const controller = new AbortController();
        const first = f.service.page('a', 'playlists', { signal: controller.signal });
        const second = f.service.page('a', 'playlists'); controller.abort();
        await expect(first).rejects.toMatchObject({ name: 'AbortError' });
        slow.resolve(page('a')); expect((await second).status).toBe('ready');
        expect(f.read).toHaveBeenCalledTimes(1);
    });
    it('bounds UI waiting and does not retry indefinitely', async () => {
        vi.useFakeTimers(); const f = fixture(); f.read.mockReturnValue(new Promise(() => {}));
        const task = f.service.page('a', 'playlists'); await vi.advanceTimersByTimeAsync(15_000);
        expect((await task).status).toBe('error'); expect(f.read).toHaveBeenCalledTimes(1);
    });
});
