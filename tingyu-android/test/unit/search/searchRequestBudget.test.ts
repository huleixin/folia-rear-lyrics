import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { searchRequestBudget, SEARCH_REQUEST_TIMEOUT_MS } from '@/services/search/searchRequestBudget';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { useSearchExploreStore } from '@/stores/useSearchExploreStore';
import { omni } from '@/services/onlineMusic/omni';

// test/unit/search/searchRequestBudget.test.ts: exercise stuck transports, retry, and stale-response ownership.
const deps = { localSongs: [], t: (_key: string, fallback?: string) => fallback || '' };
beforeEach(() => {
    vi.useFakeTimers();
    useSearchNavigationStore.getState().resetRuntime();
    useSearchExploreStore.getState().reset();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('releases a stuck song search and accepts a retry without a late overwrite', async () => {
    let oldResult!: (value: any) => void;
    let signal: AbortSignal | undefined;
    const search = vi.spyOn(omni, 'searchProviderSongs').mockImplementationOnce((_id, _q, _p, s) => {
        signal = s;
        return new Promise(resolve => { oldResult = resolve; });
    });
    const pending = useSearchNavigationStore.getState().submitSearch({ query: 'old', sourceTab: 'qq', deps });
    await vi.advanceTimersByTimeAsync(SEARCH_REQUEST_TIMEOUT_MS);
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(useSearchNavigationStore.getState()).toMatchObject({ isSearching: false, searchError: '搜索请求超时，请重试' });
    search.mockResolvedValueOnce({ items: [{ id: 2, name: 'new' } as any], hasMore: false, nextOffset: 1 });
    await useSearchNavigationStore.getState().submitSearch({ query: 'new', sourceTab: 'qq', deps });
    oldResult({ items: [{ id: 1 }], hasMore: true, nextOffset: 30 });
    await Promise.resolve();
    expect(useSearchNavigationStore.getState().searchResults?.[0].id).toBe(2);
    expect(useSearchNavigationStore.getState().searchError).toBeNull();
});

it('times out typed categories independently and releases their loading flags', async () => {
    vi.spyOn(omni, 'getSearchCapabilities').mockReturnValue({ artist: true, album: true, playlist: true } as any);
    vi.spyOn(omni, 'searchProviderArtists').mockImplementation(() => new Promise(() => {}));
    vi.spyOn(omni, 'searchProviderAlbums').mockResolvedValue({ items: [], hasMore: false, nextOffset: 0 });
    vi.spyOn(omni, 'searchProviderPlaylists').mockResolvedValue({ items: [], hasMore: false, nextOffset: 0 });
    const pending = useSearchExploreStore.getState().submit({ query: 'test', source: 'qq', deps: { localPlaylists: [] } });
    await vi.advanceTimersByTimeAsync(SEARCH_REQUEST_TIMEOUT_MS);
    await pending;
    expect(useSearchExploreStore.getState().artists.status).toBe('error');
    expect(useSearchExploreStore.getState().albums.status).toBe('ready');
    expect(useSearchExploreStore.getState().playlists.status).toBe('ready');
});

it('cancels suggestions immediately and clears its timeout', async () => {
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    const pending = searchRequestBudget(s => { signal = s; return new Promise(() => {}); }, 5000, controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    controller.abort();
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
});
