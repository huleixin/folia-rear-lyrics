import { searchSources, type SourcePages } from '../services/search/aggregateSearch';
import { aggregateSearchSources, searchableSources, useSearchSettingsStore } from './useSearchSettingsStore';
import { appendRankedSearch } from '../services/search/searchRanking';
import { providerSearchScopeKey } from '../services/onlineMusic/providerResourceScope';
import { useOnlineProviderAccountStore } from './useOnlineProviderAccountStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { create } from 'zustand';
import { getNavidromeConfig, navidromeApi } from '../services/navidromeService';
import type { HomeViewTab, LocalSong, SongResult, UnifiedSong } from '../types';
import type { OnlineProviderId } from '../types/onlineMusic';
import {
    applyLocalLibraryEntityDisplay,
    buildUnifiedLocalSong,
    type LocalLibraryDisplayCatalog,
} from '../services/playbackAdapters';
import { omni } from '../services/onlineMusic/omni';
import { useSearchHistoryStore } from './useSearchHistoryStore';

const LAST_HOME_VIEW_TAB_KEY = 'last_home_view_tab';
export const LAST_SEARCH_SOURCE_KEY = 'tingyu_last_search_source_v1';
const DEFAULT_SEARCH_LIMIT = 30;
const BUILTIN_ONLINE_PROVIDERS = new Set<string>(['qq', 'netease', 'kugou', 'bodian', 'qishui']);
const NON_SEARCH_VIEW_TABS = new Set<string>(['playlist', 'albums', 'radio']);

export type SearchSource = 'aggregate' | OnlineProviderId | 'local' | 'navidrome';
export type SearchReturnView = 'home' | 'player';

type SearchExecutorDeps = {
    localSongs: LocalSong[];
    localLibraryCatalog?: LocalLibraryDisplayCatalog;
    t: (key: string, fallback?: string) => string;
};

type SearchExecutionResult = {
    results: UnifiedSong[];
    hasMore: boolean;
    nextOffset: number;
};

type SearchCacheEntry = {
    savedAt: number; pages: SourcePages<UnifiedSong>;
    results: UnifiedSong[];
    offset: number;
    hasMore: boolean;
    scrollTop: number;
};

interface SearchNavigationState {
    homeViewTab: HomeViewTab;
    searchQuery: string;
    preferredSearchSource: SearchSource;
    searchSourceTab: SearchSource;
    searchResults: UnifiedSong[] | null;
    searchReturnView: SearchReturnView;
    isSearchOpen: boolean;
    isSearching: boolean;
    isLoadingMore: boolean;
    searchError: string | null;
    requestId: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    scrollTop: number;
    searchCache: Record<string, SearchCacheEntry>;
    sourcePages: SourcePages<UnifiedSong>;
    setHomeViewTab: (tab: HomeViewTab) => void;
    setSearchQuery: (query: string) => void;
    selectSearchSource: (source: SearchSource) => void;
    setSearchScrollTop: (scrollTop: number) => void;
    restoreSearch: (payload: { query: string; sourceTab: SearchSource; returnView?: SearchReturnView; }) => void;
    hideSearchOverlay: () => void;
    resetRuntime: (onlineProviderId?: OnlineProviderId) => void;
    followOnlineProvider: (providerId: OnlineProviderId) => void;
    submitSearch: (payload: { query?: string; sourceTab: SearchSource; deps: SearchExecutorDeps; returnView?: SearchReturnView; }) => Promise<boolean>;
    loadMoreSearchResults: (payload: { deps: SearchExecutorDeps; }) => Promise<void>;
}

const searchSourcesFor = (source: SearchSource): string[] => source === 'aggregate' ? aggregateSearchSources() : [source];
const getSearchCacheKey = (query: string, source: SearchSource) => JSON.stringify([query.trim().toLowerCase(), source, providerSearchScopeKey(searchSourcesFor(source))]);
const CACHE_TTL = 5 * 60_000;
let controller: AbortController | null = null;
const cancelSearch = () => { controller?.abort(); controller = null; };
const cacheEntry = (entry?: SearchCacheEntry) => entry && Date.now() - entry.savedAt < CACHE_TTL ? entry : undefined;
const boundedCache = (cache: Record<string, SearchCacheEntry>, key: string, entry: SearchCacheEntry) =>
    Object.fromEntries([...Object.entries(cache).filter(([id, value]) => id !== key && Date.now() - value.savedAt < CACHE_TTL).slice(-19), [key, entry]]);

export const normalizePersistedSearchSource = (raw: unknown): SearchSource | null => {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed || NON_SEARCH_VIEW_TABS.has(trimmed)) return null;
    return trimmed as SearchSource;
};

export const isSearchSourceCurrentlyAvailable = (source: SearchSource): boolean => {
    if (source === 'aggregate' || source === 'local' || source === 'navidrome') return true;
    if (BUILTIN_ONLINE_PROVIDERS.has(source)) return true;
    return searchableSources().includes(source);
};

/**
 * 若用户保存的自定义音源已被停用或移除，运行时临时回退至综合搜索，但绝不篡改用户已持久化的真实偏好。
 */
export const resolveEffectiveSearchSource = (source: SearchSource): SearchSource => (
    isSearchSourceCurrentlyAvailable(source) ? source : 'aggregate'
);

export const resolveSearchSource = (tab: HomeViewTab | SearchSource): SearchSource => {
    if (tab === 'aggregate' || tab === 'local' || tab === 'navidrome') {
        return tab;
    }
    if (!NON_SEARCH_VIEW_TABS.has(tab)) return tab as OnlineProviderId;
    return getInitialSearchSourceTab();
};

export const resolveCommandPaletteSearchSource = (
    _currentSong: SongResult | null,
    searchSourceTab: SearchSource,
    _activeOnlineProviderId: OnlineProviderId,
): SearchSource => resolveEffectiveSearchSource(searchSourceTab);

const mapLocalSongToUnifiedSong = (
    song: LocalSong,
    catalog?: LocalLibraryDisplayCatalog,
): UnifiedSong => applyLocalLibraryEntityDisplay(buildUnifiedLocalSong({
        localSong: song,
        matchedSong: null,
        coverUrl: song.useOnlineCover ? song.onlineMetadata?.coverUrl || null : null,
        preferOnlineMetadata: false,
    }), catalog);

const searchLocalSongs = (
    deps: SearchExecutorDeps,
    query: string,
): SearchExecutionResult => {
    const lowerQuery = query.toLowerCase();
    const results = deps.localSongs
        .filter(song => {
            const title = song.title.toLowerCase();
            const artist = [
                ...song.importedMetadata.artistNames,
                ...song.onlineMetadata?.artists.map(item => item.name) || [],
            ].join(' ').toLowerCase();
            const album = [song.importedMetadata.albumName, song.onlineMetadata?.album?.name]
                .filter(Boolean).join(' ').toLowerCase();
            return title.includes(lowerQuery) || artist.includes(lowerQuery) || album.includes(lowerQuery);
        })
        .map(song => mapLocalSongToUnifiedSong(song, deps.localLibraryCatalog));

    return {
        results,
        hasMore: false,
        nextOffset: results.length,
    };
};

const searchNavidromeSongs = async (query: string): Promise<SearchExecutionResult> => {
    const config = getNavidromeConfig();
    if (!config) {
        return { results: [], hasMore: false, nextOffset: 0 };
    }

    const response = await navidromeApi.search(config, query, 0, 0, DEFAULT_SEARCH_LIMIT);
    const results = (response.song || []).map(song => {
        const navidromeSong = navidromeApi.toNavidromeSong(config, song);
        return navidromeSong as UnifiedSong;
    });

    return {
        results,
        hasMore: false,
        nextOffset: results.length,
    };
};

const searchOnlineProviderSongs = async (
    providerId: OnlineProviderId,
    query: string,
    limit: number,
    offset: number,
    signal?: AbortSignal,
): Promise<SearchExecutionResult> => {
    const page = await omni.searchProviderSongs(providerId, query, { limit, offset }, signal);
    return { results: page.items, hasMore: page.hasMore, nextOffset: page.nextOffset };
};

const executeSearch = async (
    query: string,
    sourceTab: SearchSource,
    offset: number,
    limit: number,
    deps: SearchExecutorDeps,
    signal?: AbortSignal,
): Promise<SearchExecutionResult> => {
    if (sourceTab === 'local') {
        return searchLocalSongs(deps, query);
    }

    if (sourceTab === 'navidrome') {
        return searchNavidromeSongs(query);
    }

    return searchOnlineProviderSongs(sourceTab, query, limit, offset, signal);
};

const getInitialHomeViewTab = (): HomeViewTab => {
    if (typeof window === 'undefined') {
        return 'playlist';
    }
    const savedTab = localStorage.getItem(LAST_HOME_VIEW_TAB_KEY);
    return savedTab === 'playlist' || savedTab === 'local' || savedTab === 'albums' || savedTab === 'navidrome' || savedTab === 'radio'
        ? savedTab
        : 'playlist';
};

export const hasPersistedSearchSource = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return normalizePersistedSearchSource(localStorage.getItem(LAST_SEARCH_SOURCE_KEY)) !== null;
    } catch {
        return false;
    }
};

export const getInitialSearchSourceTab = (): SearchSource => {
    if (typeof window === 'undefined') return 'aggregate';
    try {
        const normalized = normalizePersistedSearchSource(localStorage.getItem(LAST_SEARCH_SOURCE_KEY));
        if (normalized) return normalized;
    } catch {
        /* Ignore storage errors. */
    }
    return 'aggregate';
};

const persistSearchSourceTab = (source: SearchSource): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(LAST_SEARCH_SOURCE_KEY, source);
    } catch {
        /* Session state still works. */
    }
};

const syncActiveHistorySearchSource = (source: SearchSource): void => {
    if (typeof window === 'undefined') return;
    try {
        const current = window.history.state;
        if (current && typeof current === 'object' && current.search && typeof current.search === 'object') {
            window.history.replaceState(
                { ...current, search: { ...current.search, sourceTab: source } },
                '',
                window.location.hash || (window.location.pathname + window.location.search),
            );
        }
    } catch {
        /* History state sync is best-effort in non-browser test environments. */
    }
};

export const useSearchNavigationStore = create<SearchNavigationState>((set, get) => {
    const initialSource = getInitialSearchSourceTab();
    return {
    homeViewTab: getInitialHomeViewTab(),
    searchQuery: '',
    preferredSearchSource: initialSource,
    searchSourceTab: resolveEffectiveSearchSource(initialSource),
    searchResults: null,
    searchReturnView: 'home',
    isSearchOpen: false,
    isSearching: false,
    isLoadingMore: false,
    searchError: null,
    requestId: 0,
    offset: 0,
    limit: DEFAULT_SEARCH_LIMIT,
    hasMore: false,
    scrollTop: 0,
    searchCache: {}, sourcePages: {},
    setHomeViewTab: (tab) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(LAST_HOME_VIEW_TAB_KEY, tab);
        }
        set({ homeViewTab: tab });
    },
    setSearchQuery: (query) => { if(query !== get().searchQuery) cancelSearch(); set(state => query === state.searchQuery ? state : ({
        searchQuery: query, requestId: state.requestId + 1,
        isSearching: false, isLoadingMore: false, searchError: null,
        searchResults: null, hasMore: false, offset: 0, scrollTop: 0, sourcePages: {},
    })); },
    selectSearchSource: (source) => {
        const normalized = resolveSearchSource(source);
        persistSearchSourceTab(normalized);
        syncActiveHistorySearchSource(normalized);
        cancelSearch();
        const effective = resolveEffectiveSearchSource(normalized);
        set(state => ({
            preferredSearchSource: normalized,
            searchSourceTab: effective, requestId: state.requestId + 1,
            searchResults: null, isSearching: false, isLoadingMore: false,
            searchError: null, offset: 0, hasMore: false, scrollTop: 0, sourcePages: {},
        }));
    },
    setSearchScrollTop: (scrollTop) => set(state => {
        const cacheKey = getSearchCacheKey(state.searchQuery, state.searchSourceTab);
        const cached = state.searchCache[cacheKey];
        return {
            scrollTop,
            searchCache: cached
                ? {
                    ...state.searchCache,
                    [cacheKey]: { ...cached, scrollTop },
                }
                : state.searchCache,
        };
    }),
    restoreSearch: ({ query, sourceTab, returnView = 'home' }) => { cancelSearch(); set(state => {
        const effectiveSource = resolveEffectiveSearchSource(sourceTab);
        const cached = cacheEntry(state.searchCache[getSearchCacheKey(query, effectiveSource)]);
        return {
            searchQuery: query,
            requestId: state.requestId + 1,
            searchSourceTab: effectiveSource,
            searchReturnView: returnView,
            searchResults: cached?.results ?? null, sourcePages: cached?.pages ?? {},
            offset: cached?.offset ?? 0,
            hasMore: cached?.hasMore ?? false,
            scrollTop: cached?.scrollTop ?? 0,
            searchError: null,
            isSearching: false,
            isLoadingMore: false,
            isSearchOpen: true,
        };
    }); },
    hideSearchOverlay: () => { cancelSearch(); set(state => ({ isSearchOpen: false, searchReturnView: 'home', requestId: state.requestId + 1, isSearching: false, isLoadingMore: false })); },
    resetRuntime: (_onlineProviderId) => { cancelSearch(); set(state => ({
        searchQuery: '',
        // 切换音乐平台账号或浏览平台绝不覆盖搜索来源偏好（含首次默认的综合搜索及用户主动选择的任何平台）。
        preferredSearchSource: state.preferredSearchSource,
        searchSourceTab: resolveEffectiveSearchSource(state.preferredSearchSource),
        searchResults: null,
        searchReturnView: 'home',
        isSearchOpen: false,
        isSearching: false,
        isLoadingMore: false,
        searchError: null,
        requestId: state.requestId + 1,
        offset: 0,
        hasMore: false,
        scrollTop: 0, sourcePages: {}, searchCache: {},
    })); },
    // 搜索来源严格独立于首页/资料库当前在线平台，禁止被全局平台切换反向覆盖。
    followOnlineProvider: (_providerId) => set(state => state),
    submitSearch: async ({ query, sourceTab, deps, returnView = 'home' }) => {
        const trimmed = (query ?? get().searchQuery).trim();
        if (!trimmed) return false;
        const effectiveTab = resolveEffectiveSearchSource(sourceTab);
        cancelSearch(); controller = new AbortController(); const signal = controller.signal;
        const requestId = get().requestId + 1;
        const sources = searchSourcesFor(effectiveTab), scope = providerSearchScopeKey(sources);
        const key = getSearchCacheKey(trimmed, effectiveTab);
        useSearchHistoryStore.getState().remember(effectiveTab, trimmed);
        set({ searchQuery: trimmed, searchSourceTab: effectiveTab, searchReturnView: returnView,
            isSearchOpen: true, isSearching: true, isLoadingMore: false, searchError: null, requestId,
            searchResults: null, sourcePages: {}, offset: 0, hasMore: false, scrollTop: 0 });
        const valid = () => get().requestId === requestId && providerSearchScopeKey(sources) === scope && !signal.aborted;
        await searchSources<UnifiedSong>({ sources, signal, valid,
            fetch: async (source, offset, child) => {
                const result = await executeSearch(trimmed, source as SearchSource, offset, get().limit, deps, child);
                return { items: result.results, hasMore: result.hasMore, nextOffset: result.nextOffset };
            }, key: getPlaybackSongKey, publish: pages => set(state => {
                const settings = useSearchSettingsStore.getState();
                const results = appendRankedSearch(state.searchResults ?? [], Object.values(pages).flatMap(page => page.items), trimmed, settings.sort, settings.priority);
                const pending = Object.values(pages).some(page => page.status === 'loading');
                const hasMore = Object.values(pages).some(page => page.hasMore);
                const offset = Object.values(pages).reduce((sum, page) => sum + page.offset, 0);
                const failed = Object.values(pages).filter(page => page.status === 'error');
                return { sourcePages: pages, searchResults: pending && !results.length ? null : results, hasMore, offset, isSearching: pending,
                    searchError: failed.length && failed.length === sources.length ? failed[0].error : null,
                    searchCache: pending ? state.searchCache : boundedCache(state.searchCache, key,
                        { results, pages, hasMore, offset, scrollTop: 0, savedAt: Date.now() }) };
            }) });
        return valid();
    },
    loadMoreSearchResults: async ({ deps }) => {
        const state = get();
        if (state.isSearching || state.isLoadingMore || !state.searchQuery.trim()
            || !state.hasMore && !Object.values(state.sourcePages).some(page => page.status === 'error')) return;
        cancelSearch(); controller = new AbortController(); const signal = controller.signal;
        const sources = Object.keys(state.sourcePages), scope = providerSearchScopeKey(sources), key = getSearchCacheKey(state.searchQuery, state.searchSourceTab);
        const valid = () => get().requestId === state.requestId && providerSearchScopeKey(sources) === scope && !signal.aborted;
        set({ isLoadingMore: true, searchError: null });
        await searchSources<UnifiedSong>({ sources, previous: state.sourcePages, signal, valid, key: getPlaybackSongKey,
            fetch: async (source, offset, child) => {
                const result = await executeSearch(state.searchQuery, source as SearchSource, offset, state.limit, deps, child);
                return { items: result.results, hasMore: result.hasMore, nextOffset: result.nextOffset };
            }, publish: pages => set(latest => {
                const settings = useSearchSettingsStore.getState();
                const results = appendRankedSearch(latest.searchResults ?? [], Object.values(pages).flatMap(page => page.items), state.searchQuery, settings.sort, settings.priority);
                const pending = Object.values(pages).some(page => page.status === 'loading');
                const hasMore = Object.values(pages).some(page => page.hasMore);
                const offset = Object.values(pages).reduce((sum, page) => sum + page.offset, 0);
                return { sourcePages: pages, searchResults: results, isLoadingMore: pending, hasMore, offset,
                    searchError: sources.length === 1 ? pages[sources[0]]?.error ?? null : null,
                    searchCache: pending ? latest.searchCache : boundedCache(latest.searchCache, key,
                        { results, pages, hasMore, offset, scrollTop: latest.scrollTop, savedAt: Date.now() }) };
            }) });
    },
    };
});

// Remove private results immediately on logout/account replacement, including restored cached pages.
useOnlineProviderAccountStore.subscribe((state, before) => {
    const current = useSearchNavigationStore.getState();
    const sources = searchSourcesFor(current.searchSourceTab);
    if (providerSearchScopeKey(sources, state.accounts) === providerSearchScopeKey(sources, before.accounts)) return;
    cancelSearch();
    useSearchNavigationStore.setState(current => ({ requestId: current.requestId + 1, searchResults: null,
        sourcePages: {}, searchCache: {}, isSearching: false, isLoadingMore: false, hasMore: false }));
});
