// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSuggestionCache, useSearchSuggestions, type SuggestionState } from '@/components/app/search/useSearchSuggestions';
import { useSearchExploreStore } from '@/stores/useSearchExploreStore';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { omni } from '@/services/onlineMusic/omni';
import type { SearchSuggestions } from '@/types/search';

// test/unit/search/searchRefreshSafety.test.ts
vi.mock('@/services/onlineMusic/omni', () => ({ omni: {
    getSearchCapabilities: (source: string) => ({ song: true, artist: source !== 'kugou', album: source !== 'kugou', playlist: source !== 'kugou', suggest: source !== 'kugou' }),
    suggestProvider: vi.fn(), searchProviderArtists: vi.fn(), searchProviderAlbums: vi.fn(), searchProviderPlaylists: vi.fn(), searchProviderSongs: vi.fn(),
} }));
vi.mock('@/services/navidromeService', () => ({ getNavidromeConfig: () => null, navidromeApi: {} }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
let observed: SuggestionState;
const result = (text: string): SearchSuggestions => ({ items: [{ kind: 'keyword', text }] });
const empty = { items: [], hasMore: false, nextOffset: 0 };
function Probe(props: { query: string; source?: 'qq' | 'netease' | 'local'; enabled?: boolean }) {
    observed = useSearchSuggestions({ query: props.query, source: props.source ?? 'qq', enabled: props.enabled ?? true });
    return null;
}
beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); clearSuggestionCache(); useSearchExploreStore.getState().reset();
    useSearchNavigationStore.getState().resetRuntime('qq');
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const render = (query: string, enabled = true, source: 'qq' | 'netease' | 'local' = 'qq') => act(() => root.render(h(Probe, { query, enabled, source })));
const advance = () => act(async () => { await vi.advanceTimersByTimeAsync(300); });

describe('suggestion ownership, IME gating and cancellation', () => {
    it('debounces rapid input and does not request during composition or empty input', async () => {
        vi.mocked(omni.suggestProvider).mockResolvedValue(result('许嵩'));
        render('x', false); await advance(); expect(omni.suggestProvider).not.toHaveBeenCalled();
        render('许'); await act(async () => { await vi.advanceTimersByTimeAsync(200); }); render('许嵩'); await advance();
        expect(omni.suggestProvider).toHaveBeenCalledOnce(); expect(omni.suggestProvider).toHaveBeenCalledWith('qq', '许嵩', expect.any(AbortSignal));
        render(''); await advance(); expect(observed.items).toEqual([]); expect(omni.suggestProvider).toHaveBeenCalledOnce();
    });
    it('immediately removes old keyword results and ignores a late response', async () => {
        let resolveOld!: (data: SearchSuggestions) => void;
        vi.mocked(omni.suggestProvider).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(result('周杰伦'));
        render('许嵩'); await advance(); const signal = vi.mocked(omni.suggestProvider).mock.calls[0][2]!;
        render('周杰伦'); expect(observed.items).toEqual([]); expect(signal.aborted).toBe(true);
        await advance(); await act(async () => resolveOld(result('许嵩')));
        expect(observed.items).toEqual(result('周杰伦').items);
    });
    it('isolates sources, caches repeat queries, and sends no request for local music', async () => {
        vi.mocked(omni.suggestProvider).mockResolvedValue(result('许嵩'));
        render('许嵩'); await advance(); render(''); render('许嵩'); await advance(); expect(omni.suggestProvider).toHaveBeenCalledOnce();
        render('许嵩', true, 'netease'); expect(observed.items).toEqual([]); await advance(); expect(omni.suggestProvider).toHaveBeenCalledTimes(2);
        render('许嵩', true, 'local'); await advance(); expect(observed.items).toEqual([]); expect(omni.suggestProvider).toHaveBeenCalledTimes(2);
    });
    it('retyping a canceled query makes a fresh request rather than reusing an aborted promise', async () => {
        vi.mocked(omni.suggestProvider).mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(result('许嵩'));
        render('许嵩'); await advance(); render(''); render('许嵩'); await advance();
        expect(omni.suggestProvider).toHaveBeenCalledTimes(2); expect(observed.status).toBe('ready');
    });
    it('falls back quietly after a failure, without corrupting formal search state', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.mocked(omni.suggestProvider).mockRejectedValue(new Error('private bridge failure'));
        render('许嵩'); await advance(); expect(observed.status).toBe('unavailable'); expect(observed.items).toEqual([]);
        expect(useSearchNavigationStore.getState().searchError).toBeNull();
    });
});

describe('formal category retries and in-flight invalidation', () => {
    const deps = { localPlaylists: [] };
    it('retries a failed initial category even when hasMore is false', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.mocked(omni.searchProviderArtists).mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ items: [{ providerId: 'qq', id: 'real-mid', name: '许嵩' }], hasMore: false, nextOffset: 1 });
        vi.mocked(omni.searchProviderAlbums).mockResolvedValue(empty); vi.mocked(omni.searchProviderPlaylists).mockResolvedValue(empty);
        await useSearchExploreStore.getState().submit({ query: '许嵩', source: 'qq', deps });
        expect(useSearchExploreStore.getState().artists.status).toBe('error');
        expect(useSearchExploreStore.getState().albums.status).toBe('ready');
        await useSearchExploreStore.getState().loadMore('artist', deps);
        expect(omni.searchProviderArtists).toHaveBeenCalledTimes(2);
        expect(useSearchExploreStore.getState().artists.items[0].id).toBe('real-mid');
    });
    it('does not call a known unsupported category on retry', async () => {
        await useSearchExploreStore.getState().submit({ query: '许嵩', source: 'kugou', deps });
        await useSearchExploreStore.getState().loadMore('artist', deps);
        expect(omni.searchProviderArtists).not.toHaveBeenCalled();
    });
    it('ignores formal song requests after editing, changing source, or closing search', async () => {
        const dep = { localSongs: [], t: (key: string) => key };
        for (const invalidate of [() => useSearchNavigationStore.getState().setSearchQuery('周杰伦'), () => useSearchNavigationStore.getState().selectSearchSource('local'), () => useSearchNavigationStore.getState().hideSearchOverlay()]) {
            let resolve!: (data: typeof empty) => void;
            vi.mocked(omni.searchProviderSongs).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
            const pending = useSearchNavigationStore.getState().submitSearch({ query: '许嵩', sourceTab: 'qq', deps: dep });
            invalidate(); resolve(empty); await pending;
            expect(useSearchNavigationStore.getState().searchResults).toBeNull();
        }
    });
});
