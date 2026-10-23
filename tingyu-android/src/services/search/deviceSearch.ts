import type { LocalPlaylist } from '../../types';
import type { NavidromeConfig } from '../../types/navidrome';
import { getNavidromeConfig, navidromeApi } from '../navidromeService';
import type { SearchAlbumHit, SearchArtistHit, SearchPage, SearchPlaylistHit } from '../../types/search';

// src/services/search/deviceSearch.ts
// 本地曲库与 Navidrome 的多类型搜索。两者都不是 Omni provider，所以单独放在这里；
// 只把各自目录里真实存在的条目交出去：本地实体来自曲库目录，Navidrome 来自 search3。

const normalize = (value: string) => value.trim().toLowerCase();
const matches = (query: string, ...values: Array<string | undefined>) => {
    const needle = normalize(query);
    return values.some(value => value && normalize(value).includes(needle));
};

const paginate = <T>(all: T[], limit: number, offset: number): SearchPage<T> => {
    const start = Math.max(0, offset);
    const pageSize = Math.max(1, limit);
    const items = all.slice(start, start + pageSize);
    const nextOffset = start + items.length;
    return { items, total: all.length, hasMore: nextOffset < all.length, nextOffset };
};

export const searchLocalPlaylists = (
    query: string,
    playlists: readonly LocalPlaylist[],
    limit: number,
    offset: number,
): SearchPage<SearchPlaylistHit> => paginate(
    playlists
        .filter(playlist => matches(query, playlist.name))
        .map(playlist => ({
            providerId: 'local' as const,
            id: playlist.id,
            name: playlist.name,
            trackCount: playlist.songIds.length,
        })),
    limit,
    offset,
);

const navidromeCover = (config: NavidromeConfig, coverArt?: string) => (
    coverArt ? navidromeApi.getCoverArtUrl(config, coverArt, 300) : undefined
);

export const searchNavidromeArtists = async (
    query: string, limit: number, offset: number,
): Promise<SearchPage<SearchArtistHit>> => {
    const config = getNavidromeConfig();
    if (!config) return { items: [], hasMore: false, nextOffset: offset };
    const result = await navidromeApi.search(config, query, limit, 0, 0);
    const list = Array.isArray(result.artist) ? result.artist : [];
    return {
        items: list.map(artist => ({
            providerId: 'navidrome' as const,
            id: artist.id,
            name: artist.name,
            coverUrl: navidromeCover(config, artist.coverArt),
            albumCount: artist.albumCount,
        })),
        hasMore: false,
        nextOffset: offset + list.length,
    };
};

export const searchNavidromeAlbums = async (
    query: string, limit: number, offset: number,
): Promise<SearchPage<SearchAlbumHit>> => {
    const config = getNavidromeConfig();
    if (!config) return { items: [], hasMore: false, nextOffset: offset };
    const result = await navidromeApi.search(config, query, 0, limit, 0);
    const list = Array.isArray(result.album) ? result.album : [];
    return {
        items: list.map(album => ({
            providerId: 'navidrome' as const,
            id: album.id,
            name: album.name,
            coverUrl: navidromeCover(config, album.coverArt),
            artistName: album.artist,
            releaseDate: album.year ? String(album.year) : undefined,
            trackCount: album.songCount,
        })),
        hasMore: false,
        nextOffset: offset + list.length,
    };
};
