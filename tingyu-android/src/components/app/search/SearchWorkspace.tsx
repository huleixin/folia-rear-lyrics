import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Loader2, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { LocalPlaylist, Theme, UnifiedSong } from '../../../types';
import type { MediaId } from '../../../types/onlineMusic';
import type { GridViewCollectionDescriptor } from '../../../library/core/contracts/collection';
import type { SearchAlbumHit, SearchArtistHit, SearchPlaylistHit, SearchSuggestions } from '../../../types/search';
import { type SearchSource, useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';
import { exploreCapabilities, useSearchExploreStore, type ExploreKind } from '../../../stores/useSearchExploreStore';
import SearchResultsList from './SearchResultsList';
import SearchLanding from './SearchLanding';
import SearchSuggestionsPanel from './SearchSuggestions';
import SearchOverview from './SearchOverview';
import { SearchAlbumRow, SearchArtistRow, SearchCategoryStatus, SearchPlaylistRow } from './SearchCollections';
import { useSearchSuggestions } from './useSearchSuggestions';
import { useVisualViewport } from './useVisualViewport';
import { buildSearchCollectionDescriptor } from './searchCollectionOpen';
import { useCollectionNavigationStore } from '../../../stores/useCollectionNavigationStore';
import { useOnlineProviderAccountStore } from '../../../stores/useOnlineProviderAccountStore';
import { useSearchHistoryStore } from '../../../stores/useSearchHistoryStore';
import { omni } from '../../../services/onlineMusic/omni';
import { getNavidromeConfig } from '../../../services/navidromeService';
import { hasBlockingWindow } from '../../../utils/keyboardTargets';
import { NATIVE_FIRST } from '../../../services/nativePages';
import { useNativeSearchPage } from './useNativeSearchPage';
import './searchWorkspace.css';

// src/components/app/search/SearchWorkspace.tsx
// 听屿综合搜索：未输入 → 历史/热门；输入中 → 实时联想；提交后 → 综合/单曲/歌手/歌单/专辑。
// 单曲结果仍走 useSearchNavigationStore（原有分页、历史、缓存与播放动作不变），
// 其余分类由 useSearchExploreStore 独立加载，一个失败不会清空整页。

type SearchWorkspaceProps = {
    theme: Theme;
    isDaylight: boolean;
    onClose: () => void;
    onSubmitSearch: (source?: SearchSource) => void;
    onLoadMore: () => void;
    onPlayTrack: (track: UnifiedSong) => void;
    onAddTrackToQueue: (track: UnifiedSong) => void;
    onOpenArtist: (track: UnifiedSong, artistName: string, artistId?: MediaId, entityId?: string) => void;
    onOpenAlbum: (track: UnifiedSong, albumName: string, albumId?: MediaId, entityId?: string) => void;
    resolveTrackDisplay?: (track: UnifiedSong) => UnifiedSong;
    /** 打开歌手 / 专辑 / 歌单集合页；沿用资料库的集合视图。 */
    onOpenSearchCollection: (descriptor: GridViewCollectionDescriptor) => void;
    /** 本地歌单搜索需要读当前歌单目录。 */
    localPlaylists: readonly LocalPlaylist[];
};

type ResultTab = 'overview' | 'song' | ExploreKind;

const TAB_LABEL: Record<ResultTab, string> = {
    overview: 'search.tabOverview',
    song: 'search.tabSong',
    artist: 'search.tabArtist',
    playlist: 'search.tabPlaylist',
    album: 'search.tabAlbum',
};

/** 稳定引用：选择器每次返回新数组会让 zustand 认为状态一直在变。 */
const EMPTY_TERMS: string[] = [];

const SearchWorkspace: React.FC<SearchWorkspaceProps> = ({
    theme: _theme,
    isDaylight,
    onClose,
    onSubmitSearch,
    onLoadMore,
    onPlayTrack,
    onAddTrackToQueue,
    onOpenArtist,
    onOpenAlbum,
    resolveTrackDisplay,
    onOpenSearchCollection,
    localPlaylists,
}) => {
    const { t } = useTranslation();
    const {
        searchQuery, searchSourceTab, searchResults, isSearchOpen, isSearching,
        isLoadingMore, searchError, hasMore, scrollTop, setSearchQuery, setSearchScrollTop,
    } = useSearchNavigationStore(useShallow(state => ({
        searchQuery: state.searchQuery,
        searchSourceTab: state.searchSourceTab,
        searchResults: state.searchResults,
        isSearchOpen: state.isSearchOpen,
        isSearching: state.isSearching,
        isLoadingMore: state.isLoadingMore,
        searchError: state.searchError,
        hasMore: state.hasMore,
        scrollTop: state.scrollTop,
        setSearchQuery: state.setSearchQuery,
        setSearchScrollTop: state.setSearchScrollTop,
    })));
    const { artists, albums, playlists } = useSearchExploreStore(useShallow(state => ({
        artists: state.artists, albums: state.albums, playlists: state.playlists,
    })));
    const activeOnlineProviderId = useOnlineProviderAccountStore(state => state.activeProviderId);
    const hasCollection = useCollectionNavigationStore(state => Boolean(state.snapshot?.stack.length));
    const registryVersion = useSyncExternalStore(omni.subscribeProviders, omni.getProviderRegistryVersion, () => 0);
    const sources = useMemo<SearchSource[]>(() => [...new Set<SearchSource>([
        activeOnlineProviderId,
        ...omni.getProviderSummaries().filter(provider => provider.providerId.startsWith('lx-') && provider.availability.configured).map(provider => provider.providerId),
        'local', 'navidrome',
    ])], [activeOnlineProviderId, registryVersion]);
    useEffect(() => {
        if (!sources.includes(searchSourceTab)) useSearchNavigationStore.getState().selectSearchSource(activeOnlineProviderId);
    }, [sources, searchSourceTab, activeOnlineProviderId]);
    const capabilities = useMemo(() => exploreCapabilities(searchSourceTab), [searchSourceTab, registryVersion]);
    const viewport = useVisualViewport();
    const sourceNeedsSetup = searchSourceTab === 'navidrome' && !getNavidromeConfig();

    const [mode, setMode] = useState<'landing' | 'suggest' | 'results'>(
        searchResults && searchQuery.trim() ? 'results' : searchQuery.trim() ? 'suggest' : 'landing',
    );
    const [tab, setTab] = useState<ResultTab>('overview');
    const [composing, setComposing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    // Reopening an empty search must not retain the previous result tabs or mode.
    useEffect(() => {
        if (!isSearchOpen) { useSearchExploreStore.getState().reset(); return; }
        const snapshot = useSearchNavigationStore.getState();
        setMode(!snapshot.searchQuery.trim() ? 'landing' : snapshot.searchResults || snapshot.isSearching ? 'results' : 'suggest');
        setTab('overview');
    }, [isSearchOpen]);

    const results = useMemo(() => {
        const raw = searchResults || [];
        return resolveTrackDisplay ? raw.map(resolveTrackDisplay) : raw;
    }, [resolveTrackDisplay, searchResults]);

    const suggestionState = useSearchSuggestions({
        query: searchQuery,
        source: searchSourceTab,
        enabled: mode === 'suggest' && !composing && isSearchOpen,
    });

    // 空关键词永远是「默认页」，不依赖 mode：autoFocus、清除、返回搜索等路径都可能把 mode 留在别处。
    const showLanding = !searchQuery.trim();
    const historyMatches = useSearchHistoryStore(state => state.terms[searchSourceTab] ?? EMPTY_TERMS)
        .filter(term => term && term !== searchQuery.trim() && term.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        .slice(0, 4);

    const deps = useMemo(() => ({ localPlaylists }), [localPlaylists]);

    const submit = useCallback((query?: string, source?: SearchSource) => {
        const nextQuery = (query ?? useSearchNavigationStore.getState().searchQuery).trim();
        const nextSource = source ?? useSearchNavigationStore.getState().searchSourceTab;
        if (!nextQuery) return;
        setMode('results');
        setTab('overview');
        setSearchQuery(nextQuery);
        onSubmitSearch(source);
        if (nextSource !== 'navidrome' || getNavidromeConfig()) void useSearchExploreStore.getState().submit({ query: nextQuery, source: nextSource, deps });
        // 收起输入法，把整屏留给结果；重新点击输入框会回到联想状态。
        inputRef.current?.blur();
    }, [deps, onSubmitSearch, setSearchQuery]);

    const switchSource = useCallback((source: SearchSource) => {
        if (source === useSearchNavigationStore.getState().searchSourceTab) return;
        useSearchExploreStore.getState().reset();
        setTab('overview');
        const query = useSearchNavigationStore.getState().searchQuery.trim();
        if (!query || mode !== 'results') {
            useSearchNavigationStore.getState().selectSearchSource(source);
            return;
        }
        onSubmitSearch(source);
        if (source !== 'navidrome' || getNavidromeConfig()) void useSearchExploreStore.getState().submit({ query, source, deps });
    }, [deps, mode, onSubmitSearch]);

    const openHit = useCallback((kind: 'artist' | 'album' | 'playlist', hit: SearchArtistHit | SearchAlbumHit | SearchPlaylistHit) => {
        const descriptor = buildSearchCollectionDescriptor(kind, hit, localPlaylists);
        if (descriptor) onOpenSearchCollection(descriptor);
    }, [localPlaylists, onOpenSearchCollection]);

    const getSourceLabel = (source: SearchSource) => {
        if (source === 'local') return t('search.sourceLocal');
        if (source === 'navidrome') return t('search.sourceNavidrome');
        return omni.getProviderLabel(source);
    };

    const visibleTabs = useMemo<ResultTab[]>(() => [
        'overview', 'song',
        ...(['artist', 'playlist', 'album'] as const).filter(kind => !sourceNeedsSetup && capabilities[kind]),
    ], [capabilities, sourceNeedsSetup]);

    useEffect(() => {
        if (!visibleTabs.includes(tab)) setTab('overview');
    }, [tab, visibleTabs]);

    useEffect(() => {
        if (!isSearchOpen || hasCollection) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !event.defaultPrevented && !hasBlockingWindow()) {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasCollection, isSearchOpen, onClose]);

    const exploreCategory = tab === 'artist' ? artists : tab === 'album' ? albums : playlists;
    const loadMoreExplore = () => {
        if (tab === 'artist' || tab === 'album' || tab === 'playlist') {
            void useSearchExploreStore.getState().loadMore(tab, deps);
        }
    };

    const rootRef=useRef<HTMLElement>(null);
    const native=useNativeSearchPage({root:rootRef,active:isSearchOpen&&!hasCollection,query:searchQuery,source:searchSourceTab,
        mode,tab,tabs:visibleTabs,sources,results,searching:isSearching,loadingMore:isLoadingMore,error:searchError,
        hasMore,needsSetup:sourceNeedsSetup,artists,albums,playlists,suggestions:suggestionState,historyMatches,
        close:onClose,change:(text,composing)=>{setComposing(composing);useSearchExploreStore.getState().reset();setSearchQuery(text);setMode(text.trim()?'suggest':'landing')},
        submit,selectTab:setTab,switchSource,sourceLabel:getSourceLabel,loadMore:onLoadMore,loadExplore:loadMoreExplore,
        openHit,play:onPlayTrack,enqueue:onAddTrackToQueue,openArtist:onOpenArtist,openAlbum:onOpenAlbum});

    return (
        <AnimatePresence>
            {isSearchOpen && (
                <motion.section
                    ref={rootRef}
                    data-folia-search-workspace="true"
                    data-testid="tingyu-search-workspace"
                    data-mode={mode}
                    data-tabs={visibleTabs.join(',')}
                    initial={NATIVE_FIRST?false:{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: NATIVE_FIRST?0:0.2, ease: 'easeOut' }}
                    className="ty-search"
                    data-light={isDaylight ? 'true' : undefined}
                    data-keyboard={viewport.keyboardOpen ? 'true' : undefined}
                    style={{
                        '--ty-accent': isDaylight ? '#22775a' : '#9fe0c4',
                        '--ty-z': hasCollection ? 5 : 50,
                        ...(viewport.height > 0 ? { height: viewport.height, top: viewport.offsetTop, bottom: 'auto' } : {}),
                    } as React.CSSProperties}
                >
                    {!native&&<><header className="ty-search-head">
                        <div className="ty-search-bar">
                            <form
                                className="ty-search-field"
                                role="search"
                                onSubmit={(event) => { event.preventDefault(); if (!composing) submit(); }}
                            >
                                {isSearching && mode === 'results'
                                    ? <Loader2 className="animate-spin" size={17} />
                                    : <Search size={17} />}
                                <input
                                    ref={inputRef}
                                    value={searchQuery}
                                    onChange={(event) => {
                                        useSearchExploreStore.getState().reset();
                                        setSearchQuery(event.target.value);
                                        setMode(event.target.value.trim() ? 'suggest' : 'landing');
                                    }}
                                    // 主动点按才回到联想。挂载时的 autoFocus 不算；输入框已经聚焦时再点一次
                                    // 不会触发 focus 事件，所以判断放在 pointerdown 上。
                                    onPointerDown={() => {
                                        if (searchQuery.trim()) setMode('suggest');
                                    }}
                                    onCompositionStart={() => setComposing(true)}
                                    onCompositionEnd={(event) => {
                                        setComposing(false);
                                        setSearchQuery(event.currentTarget.value);
                                        setMode(event.currentTarget.value.trim() ? 'suggest' : 'landing');
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' && !composing && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                                            event.preventDefault();
                                            submit();
                                        }
                                    }}
                                    placeholder={t('search.placeholder')}
                                    // 用 text + enterKeyHint：type=search 会在 WebView 里再画一个原生清除按钮，
                                    // 和自定义的清空按钮叠在一起。输入法仍然显示「搜索」键。
                                    type="text"
                                    enterKeyHint="search"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    autoFocus
                                    aria-label={t('search.placeholder')}
                                />
                                {searchQuery && <button
                                    type="button"
                                    className="ty-search-clear"
                                    aria-label={t('search.clear', { defaultValue: '清空' })}
                                    onClick={() => {
                                        setSearchQuery('');
                                        setMode('landing');
                                        useSearchExploreStore.getState().reset();
                                        inputRef.current?.focus();
                                    }}
                                ><X size={18} /></button>}
                            </form>
                            <button type="button" className="ty-search-close" onClick={onClose} aria-label={t('ui.backToHome')}>
                                <X size={20} />
                            </button>
                        </div>

                        <nav className="ty-search-sources" aria-label={t('search.sourceLabel', { defaultValue: '搜索音源' })}>
                            {sources.map(source => <button
                                type="button"
                                key={source}
                                className="ty-search-chip"
                                aria-pressed={source === searchSourceTab}
                                onClick={() => switchSource(source)}
                            >{getSourceLabel(source)}</button>)}
                        </nav>

                        {mode === 'results' && !showLanding && <div className="ty-search-tabs" role="tablist" aria-label={t('search.categories', { defaultValue: '搜索分类' })}>
                            {visibleTabs.map(item => <button
                                type="button"
                                key={item}
                                role="tab"
                                className="ty-search-tab"
                                aria-selected={tab === item}
                                onClick={() => setTab(item)}
                            >{t(TAB_LABEL[item], { defaultValue: item === 'overview' ? '综合' : item === 'song' ? '单曲' : item === 'artist' ? '歌手' : item === 'playlist' ? '歌单' : '专辑' })}</button>)}
                        </div>}
                    </header>

                    {showLanding ? (
                        <div className="ty-search-scroll" data-testid="tingyu-search-landing">
                            <SearchLanding key={searchSourceTab} source={searchSourceTab} onSearch={(query) => submit(query)} />
                        </div>
                    ) : mode === 'suggest' ? (
                        <div className="ty-search-scroll">
                            <SearchSuggestionsPanel
                                items={suggestionState.items as SearchSuggestions['items']}
                                query={searchQuery}
                                status={suggestionState.status}
                                historyMatches={historyMatches}
                                onKeyword={(text) => submit(text)}
                                onArtist={item => openHit('artist', item.hit)}
                                onAlbum={item => openHit('album', item.hit)}
                                onSong={item => {
                                    // Smartbox supplies an ID, not a complete playable song. Resolve through the existing song pipeline.
                                    submit(item.name);
                                    setTab('song');
                                }}
                            />
                        </div>
                    ) : sourceNeedsSetup ? (
                        <div className="ty-search-scroll"><p className="ty-search-note" role="status">{t('search.sourceNeedsSetup')}</p></div>
                    ) : tab === 'song' ? (
                        <div className="ty-search-body">
                            {isSearching ? (
                                <div className="ty-search-empty"><Loader2 className="animate-spin" size={22} /></div>
                            ) : searchError && results.length === 0 ? (
                                <div className="ty-search-empty">
                                    <AlertCircle size={26} style={{ display: 'block', margin: '0 auto 10px' }} />
                                    <p>{t('search.error')}</p>
                                    <button type="button" onClick={() => submit()} className="ty-search-chip">{t('search.retry')}</button>
                                </div>
                            ) : results.length === 0 ? (
                                <p className="ty-search-empty">{t('home.noResults')}</p>
                            ) : (
                                <>
                                    <div className="ty-list-slot">
                                        <SearchResultsList
                                            tracks={results}
                                            scrollTop={scrollTop}
                                            isDaylight={isDaylight}
                                            onScrollTopChange={setSearchScrollTop}
                                            onPlayTrack={onPlayTrack}
                                            onAddTrackToQueue={onAddTrackToQueue}
                                            onOpenArtist={onOpenArtist}
                                            onOpenAlbum={onOpenAlbum}
                                            footer={(searchError || hasMore) ? <div className="ty-load-more">
                                                <button type="button" disabled={isLoadingMore} onClick={() => (searchError ? submit() : onLoadMore())}>
                                                    {isLoadingMore ? t('localMusic.searching') : searchError ? t('search.retry') : t('home.loadMore')}
                                                </button>
                                            </div> : undefined}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="ty-search-scroll">
                            {tab === 'overview' ? (
                                <SearchOverview
                                    songs={results}
                                    isSearching={isSearching}
                                    songError={searchError}
                                    artists={artists}
                                    albums={albums}
                                    playlists={playlists}
                                    isDaylight={isDaylight}
                                    onOpenArtist={onOpenArtist}
                                    onOpenAlbum={onOpenAlbum}
                                    onPlayTrack={onPlayTrack}
                                    onAddTrackToQueue={onAddTrackToQueue}
                                    onOpenArtistHit={hit => openHit('artist', hit)}
                                    onOpenAlbumHit={hit => openHit('album', hit)}
                                    onOpenPlaylistHit={hit => openHit('playlist', hit)}
                                    onSeeAll={kind => setTab(kind)}
                                />
                            ) : (
                                <>
                                    <SearchCategoryStatus
                                        status={exploreCategory.status}
                                        empty={exploreCategory.items.length === 0}
                                        error={exploreCategory.error}
                                        onRetry={() => { if (tab === 'artist' || tab === 'album' || tab === 'playlist') void useSearchExploreStore.getState().loadMore(tab, deps); }}
                                    />
                                    {tab === 'artist' && artists.items.map(hit => <SearchArtistRow key={`artist:${hit.id}`} hit={hit} onOpen={item => openHit('artist', item)} />)}
                                    {tab === 'album' && albums.items.map(hit => <SearchAlbumRow key={`album:${hit.id}`} hit={hit} onOpen={item => openHit('album', item)} />)}
                                    {tab === 'playlist' && playlists.items.map(hit => <SearchPlaylistRow key={`playlist:${hit.id}`} hit={hit} onOpen={item => openHit('playlist', item)} />)}
                                    {exploreCategory.hasMore && <div className="ty-load-more">
                                        <button type="button" disabled={exploreCategory.status === 'loading'} onClick={loadMoreExplore}>
                                            {exploreCategory.status === 'loading' ? t('localMusic.searching') : t('home.loadMore')}
                                        </button>
                                    </div>}
                                </>
                            )}
                        </div>
                    )}
                    </>}
                </motion.section>
            )}
        </AnimatePresence>
    );
};

export default SearchWorkspace;
