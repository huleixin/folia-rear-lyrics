// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SearchWorkspace from '@/components/app/search/SearchWorkspace';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import SearchLanding from '@/components/app/search/SearchLanding';
import SearchSuggestionsPanel from '@/components/app/search/SearchSuggestions';
import SearchResultRow from '@/components/app/search/SearchResultRow';
import SearchOverview from '@/components/app/search/SearchOverview';
import { useVisualViewport, type VisualViewportBox } from '@/components/app/search/useVisualViewport';
import { useSearchHistoryStore } from '@/stores/useSearchHistoryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { UnifiedSong } from '@/types';

// test/unit/search/searchPresentation.test.ts
vi.mock('react-i18next', async importOriginal => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string, args?: { query?: string }) => args?.query ? `${key}:${args.query}` : key }) }));
vi.mock('@/services/onlineMusic/omni', () => ({ omni: { getProviderLabel: () => 'QQ音乐', getSearchCapabilities: () => ({ song: true, artist: true, album: true, playlist: true, suggest: true }), getSearchDiscovery: async () => ({ suggestions: [], hot: Array.from({ length: 16 }, (_, index) => `真实测试样本${index + 1}`) }) } }));
vi.mock('@/services/onlineMusic/catalogRefs', () => ({ canResolveSongCatalogRef: () => true }));
vi.mock('framer-motion', async importOriginal => {
    const actual = await importOriginal<typeof import('framer-motion')>();
    return { ...actual, AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
        motion: { ...actual.motion, section: ({ initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: any) => h('section', props) } };
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    useSearchHistoryStore.setState({ terms: { qq: ['许嵩', '周杰伦'] } }); usePlaybackStore.setState({ currentSong: null });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const song: UnifiedSong = { id: 'song1', name: '真实歌曲样本', artists: [{ id: 'artist1', name: '歌手样本' }], album: { id: 'album1', name: '专辑样本' }, durationMs: 180000, sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'song1' } };
const buttons = (selector = 'button') => Array.from(document.querySelectorAll<HTMLButtonElement>(selector));

describe('search presentation delegates real existing operations', () => {
    it('reopening with an empty keyword restores landing content without stale result tabs', async () => {
        useSearchNavigationStore.setState({ isSearchOpen: true, searchQuery: '许嵩', searchSourceTab: 'qq', searchResults: [song] });
        const props = { theme: {} as never, isDaylight: false, onClose: vi.fn(), onSubmitSearch: vi.fn(), onLoadMore: vi.fn(), onPlayTrack: vi.fn(), onAddTrackToQueue: vi.fn(), onOpenArtist: vi.fn(), onOpenAlbum: vi.fn(), onOpenSearchCollection: vi.fn(), localPlaylists: [] };
        await act(async () => root.render(h(SearchWorkspace, props)));
        expect(host.querySelectorAll('[role=tab]')).toHaveLength(5);
        act(() => useSearchNavigationStore.getState().hideSearchOverlay());
        await act(async () => useSearchNavigationStore.getState().restoreSearch({ query: '', sourceTab: 'qq' }));
        expect(host.querySelector('[data-testid=tingyu-search-landing]')).not.toBeNull();
        expect(host.querySelectorAll('[role=tab]')).toHaveLength(0);
        act(() => useSearchNavigationStore.getState().hideSearchOverlay());
    });
    it('keeps real history actions and expands only the actual hot list', async () => {
        const search = vi.fn();
        await act(async () => root.render(h(SearchLanding, { source: 'qq', onSearch: search })));
        expect(host.querySelectorAll('.ty-hot button')).toHaveLength(10);
        act(() => host.querySelector<HTMLButtonElement>('.ty-hot-expand')!.click());
        expect(host.querySelectorAll('.ty-hot button')).toHaveLength(16);
        act(() => host.querySelector<HTMLButtonElement>('.ty-chip button')!.click()); expect(search).toHaveBeenCalledWith('许嵩');
        act(() => host.querySelector<HTMLButtonElement>('.ty-chip button + button')!.click());
        expect(useSearchHistoryStore.getState().terms.qq).toEqual(['周杰伦']);
        act(() => host.querySelector<HTMLButtonElement>('.ty-landing-icon')!.click()); expect(host.querySelector('.ty-history')).toBeNull();
    });
    it('keeps a keyword search action during loading or unavailable suggestions', () => {
        const keyword = vi.fn();
        for (const status of ['loading', 'unavailable'] as const) {
            act(() => root.render(h(SearchSuggestionsPanel, { items: [], query: '许嵩', status, historyMatches: [], onKeyword: keyword, onArtist: vi.fn(), onAlbum: vi.fn(), onSong: vi.fn() })));
            act(() => host.querySelector<HTMLButtonElement>('.ty-suggest-search')!.click());
            expect(host.querySelector('.ty-search-note')).toBeNull();
            expect(host.textContent).not.toMatch(/Folia|bridge|没有联想|不可用/);
        }
        expect(keyword).toHaveBeenCalledTimes(2); expect(keyword).toHaveBeenLastCalledWith('许嵩');
    });
    it('opens the actual typed suggestion rather than making up a new resource id', () => {
        const artist = vi.fn(); const hit = { providerId: 'qq', id: '000CK5xN3yZDJt', name: '许嵩' } as const;
        act(() => root.render(h(SearchSuggestionsPanel, { items: [{ kind: 'artist', hit }], query: '许嵩', status: 'ready', historyMatches: [], onKeyword: vi.fn(), onArtist: artist, onAlbum: vi.fn(), onSong: vi.fn() })));
        act(() => host.querySelectorAll<HTMLButtonElement>('.ty-suggest-row')[1].click());
        expect(artist).toHaveBeenCalledWith({ kind: 'artist', hit });
    });
    it('retains play, enqueue and catalog navigation through the existing bottom sheet', () => {
        const play = vi.fn(), enqueue = vi.fn(), artist = vi.fn(), album = vi.fn();
        act(() => root.render(h(SearchResultRow, { track: song, style: { height: 56 }, isDaylight: false, onPlayTrack: play, onAddTrackToQueue: enqueue, onOpenArtist: artist, onOpenAlbum: album })));
        act(() => host.querySelector<HTMLButtonElement>('.ty-track-copy')!.click()); expect(play).toHaveBeenCalledWith(song);
        const openMenu = () => act(() => host.querySelector<HTMLButtonElement>('.ty-track-more')!.click());
        openMenu(); act(() => buttons('.ml-sheet-action').find(button => button.textContent === 'navidrome.addToQueue')!.click()); expect(enqueue).toHaveBeenCalledWith(song);
        openMenu(); act(() => buttons('.ml-sheet-action').find(button => button.textContent?.includes('歌手样本'))!.click()); expect(artist).toHaveBeenCalledWith(song, '歌手样本', 'artist1', undefined);
        openMenu(); act(() => buttons('.ml-sheet-action').find(button => button.textContent?.includes('专辑样本'))!.click()); expect(album).toHaveBeenCalledWith(song, '专辑样本', 'album1', undefined);
    });
    it('does not claim empty results while another comprehensive section is loading', () => {
        const idle = { items: [], status: 'idle' as const, offset: 0, hasMore: false, error: null };
        const props = { songs: [], isSearching: false, songError: null, artists: { ...idle, status: 'loading' as const }, albums: idle, playlists: idle, isDaylight: false, onOpenArtist: vi.fn(), onOpenAlbum: vi.fn(), onPlayTrack: vi.fn(), onAddTrackToQueue: vi.fn(), onOpenArtistHit: vi.fn(), onOpenAlbumHit: vi.fn(), onOpenPlaylistHit: vi.fn(), onSeeAll: vi.fn() };
        act(() => root.render(h(SearchOverview, props))); expect(host.textContent).not.toContain('home.noResults');
        act(() => root.render(h(SearchOverview, { ...props, artists: { ...idle, status: 'ready' } }))); expect(host.textContent).toContain('home.noResults');
    });
    it('updates the viewport through shrink, pan and restoration without a second keyboard subtraction', async () => {
        const viewport = new EventTarget() as EventTarget & { height: number; offsetTop: number };
        viewport.height = 852; viewport.offsetTop = 0; vi.stubGlobal('visualViewport', viewport);
        vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(852);
        let box: VisualViewportBox;
        function Probe() { box = useVisualViewport(); return null; }
        act(() => root.render(h(Probe)));
        const measure = async (height: number, offsetTop: number) => {
            viewport.height = height; viewport.offsetTop = offsetTop;
            await act(async () => { viewport.dispatchEvent(new Event('resize')); await new Promise(resolve => setTimeout(resolve, 5)); });
        };
        await measure(460, 24); expect(box!).toEqual({ height: 460, offsetTop: 24, keyboardOpen: true });
        await measure(852, 0); expect(box!).toEqual({ height: 852, offsetTop: 0, keyboardOpen: false });
    });
});
