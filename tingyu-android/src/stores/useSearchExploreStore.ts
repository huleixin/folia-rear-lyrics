import { create } from 'zustand';
import type { OnlineProviderId } from '../types/onlineMusic';
import type { LocalPlaylist } from '../types';
import type { SearchAlbumHit, SearchArtistHit, SearchPage, SearchPlaylistHit } from '../types/search';
import { SEARCH_PAGE_LIMIT } from '../types/search';
import { omni } from '../services/onlineMusic/omni';
import { searchLocalPlaylists, searchNavidromeAlbums, searchNavidromeArtists } from '../services/search/deviceSearch';
import type { SearchSource } from './useSearchNavigationStore';

// src/stores/useSearchExploreStore.ts
// 综合搜索里「单曲」以外的分类：歌手、歌单、专辑。单曲仍由 useSearchNavigationStore 负责，
// 这样原有播放、分页、历史与缓存完全不动。
//
// 每个分类独立加载、独立失败：一个分类超时不会把整页清空。请求序号（generation）保证切关键词
// 或切音源之后，旧响应不会覆盖新结果。

export type ExploreKind = 'artist' | 'album' | 'playlist';
export type ExploreStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ExploreCategory<T> {
    items: T[];
    status: ExploreStatus;
    hasMore: boolean;
    offset: number;
    error: string | null;
}

export interface ExploreDeps {
    localPlaylists: readonly LocalPlaylist[];
}

const idleCategory = <T>(): ExploreCategory<T> => ({ items: [], status: 'idle', hasMore: false, offset: 0, error: null });

interface ExploreState {
    query: string;
    source: SearchSource | null;
    artists: ExploreCategory<SearchArtistHit>;
    albums: ExploreCategory<SearchAlbumHit>;
    playlists: ExploreCategory<SearchPlaylistHit>;
    generation: number;
    reset: () => void;
    submit: (payload: { query: string; source: SearchSource; deps: ExploreDeps }) => Promise<void>;
    loadMore: (kind: ExploreKind, deps: ExploreDeps) => Promise<void>;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const fetchCategory = async (
    kind: ExploreKind,
    source: SearchSource,
    query: string,
    deps: ExploreDeps,
    offset: number,
): Promise<SearchPage<SearchArtistHit | SearchAlbumHit | SearchPlaylistHit>> => {
    if (source === 'local') {
        if (kind === 'playlist') return searchLocalPlaylists(query, deps.localPlaylists, SEARCH_PAGE_LIMIT, offset);
        return { items: [], hasMore: false, nextOffset: offset };
    }
    if (source === 'navidrome') {
        if (kind === 'artist') return searchNavidromeArtists(query, SEARCH_PAGE_LIMIT, offset);
        if (kind === 'album') return searchNavidromeAlbums(query, SEARCH_PAGE_LIMIT, offset);
        // Subsonic search3 没有歌单分类；如实返回空页，界面按不支持处理。
        return { items: [], hasMore: false, nextOffset: offset };
    }
    const page = { limit: SEARCH_PAGE_LIMIT, offset };
    const providerId = source as OnlineProviderId;
    if (kind === 'artist') return omni.searchProviderArtists(providerId, query, page);
    if (kind === 'album') return omni.searchProviderAlbums(providerId, query, page);
    return omni.searchProviderPlaylists(providerId, query, page);
};

const isExploreKind = (value: string): value is ExploreKind => value === 'artist' || value === 'album' || value === 'playlist';

export const useSearchExploreStore = create<ExploreState>((set, get) => {
    const apply = (kind: ExploreKind, patch: Partial<ExploreCategory<any>>) => set(state => {
        const key = kind === 'artist' ? 'artists' : kind === 'album' ? 'albums' : 'playlists';
        return { [key]: { ...state[key], ...patch } } as Pick<ExploreState, typeof key>;
    });

    const run = async (kind: ExploreKind, query: string, source: SearchSource, deps: ExploreDeps, append: boolean) => {
        const state = get();
        const generation = state.generation;
        const key = kind === 'artist' ? 'artists' : kind === 'album' ? 'albums' : 'playlists';
        const current = state[key] as ExploreCategory<any>;
        if (current.status === 'loading') return;
        if (append && !current.hasMore && current.status !== 'error') return;
        if (current.status === 'error' && current.items.length === 0) append = false;
        const offset = append ? current.offset : 0;
        apply(kind, { status: 'loading', error: null, ...(append ? {} : { items: [], hasMore: false, offset: 0 }) });
        try {
            const page = await fetchCategory(kind, source, query, deps, offset);
            if (get().generation !== generation) return; // 关键词 / 音源已变，丢弃旧响应
            const latest = get()[key] as ExploreCategory<any>;
            const items = append ? [...latest.items, ...page.items] : page.items;
            apply(kind, { items, status: 'ready', hasMore: page.hasMore, offset: page.nextOffset, error: null });
        } catch (error) {
            if (get().generation !== generation) return;
            console.warn(`[SearchExplore:${source}:${kind}]`, error);
            apply(kind, { status: 'error', error: errorText(error) });
        }
    };

    return {
        query: '',
        source: null,
        artists: idleCategory<SearchArtistHit>(),
        albums: idleCategory<SearchAlbumHit>(),
        playlists: idleCategory<SearchPlaylistHit>(),
        generation: 0,
        reset: () => set(state => ({
            query: '', source: null, generation: state.generation + 1,
            artists: idleCategory<SearchArtistHit>(), albums: idleCategory<SearchAlbumHit>(), playlists: idleCategory<SearchPlaylistHit>(),
        })),
        submit: async ({ query, source, deps }) => {
            const trimmed = query.trim();
            const generation = get().generation + 1;
            set({
                query: trimmed, source, generation,
                artists: idleCategory<SearchArtistHit>(), albums: idleCategory<SearchAlbumHit>(), playlists: idleCategory<SearchPlaylistHit>(),
            });
            if (!trimmed) return;
            const capabilities = exploreCapabilities(source);
            // 三类并发，但各自独立结算：一类失败不影响另外两类。
            await Promise.allSettled((['artist', 'album', 'playlist'] as const)
                .filter(kind => capabilities[kind])
                .map(kind => run(kind, trimmed, source, deps, false)));
        },
        loadMore: async (kind, deps) => {
            const state = get();
            if (!state.query || !state.source || !isExploreKind(kind) || !exploreCapabilities(state.source)[kind]) return;
            await run(kind, state.query, state.source, deps, true);
        },
    };
});

/** 每个来源在当前实现里真实支持哪些分类，供分类栏与空状态使用。 */
export const exploreCapabilities = (source: SearchSource): Record<ExploreKind, boolean> => {
    // 本地：歌单目录可直接搜；歌手 / 专辑的实体页需要从曲库分配表反查歌曲，本轮没有接，避免打开空页。
    if (source === 'local') return { artist: false, album: false, playlist: true };
    if (source === 'navidrome') return { artist: true, album: true, playlist: false };
    const capabilities = omni.getSearchCapabilities(source as OnlineProviderId);
    return { artist: capabilities.artist, album: capabilities.album, playlist: capabilities.playlist };
};

export const sourceSupportsSuggestions = (source: SearchSource): boolean => (
    source !== 'local' && source !== 'navidrome' && omni.getSearchCapabilities(source as OnlineProviderId).suggest
);
