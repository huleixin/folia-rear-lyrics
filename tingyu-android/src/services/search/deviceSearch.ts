import type { LocalPlaylist } from '../../types';
import type { NavidromeConfig } from '../../types/navidrome';
import { getNavidromeConfig, navidromeApi } from '../navidromeService';
import type { SearchAlbumHit, SearchArtistHit, SearchPage, SearchPlaylistHit } from '../../types/search';
import type { LocalSong } from '../../types';
import type { LocalLibraryCatalogSnapshot } from '../../hooks/useLocalLibraryCatalog';
import { buildLocalCatalogIndex } from '../../library/core/model/localCatalogLinks';
import { followEntityRedirect } from '../../utils/localLibraryIndex';

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

/** Search only active catalog entities that map to at least one current local song. */
export const searchLocalCatalogEntities = (
    kind: 'artist' | 'album',
    query: string,
    catalog: LocalLibraryCatalogSnapshot,
    songs: readonly LocalSong[],
    limit: number,
    offset: number,
): SearchPage<SearchArtistHit | SearchAlbumHit> => {
    if (!catalog.ready || !query.trim()) return { items: [], total: 0, hasMore: false, nextOffset: offset };
    const index = buildLocalCatalogIndex(catalog);
    const songIds = new Set(songs.map(song => song.id));
    const membersByEntity = new Map<string, Set<string>>();
    const addMember = (entityId: string, songId: string) => {
        const members = membersByEntity.get(entityId) ?? new Set<string>();
        members.add(songId);
        membersByEntity.set(entityId, members);
    };
    // Resolve redirects once per assignment, then reuse the index for every matching entity.
    for (const assignment of catalog.assignments) {
        if (kind === 'artist') {
            for (const sourceId of assignment.artistEntityIds) {
                const activeId = followEntityRedirect(sourceId, index.entitiesById);
                if (activeId && index.entitiesById.get(activeId)?.kind === 'artist') addMember(activeId, assignment.songId);
            }
        } else if (assignment.albumEntityId) {
            const activeId = followEntityRedirect(assignment.albumEntityId, index.entitiesById);
            if (activeId && index.entitiesById.get(activeId)?.kind === 'album') addMember(activeId, assignment.songId);
        }
    }
    const hits = catalog.entities
        .filter(entity => entity.kind === kind && !entity.mergedInto)
        .filter(entity => matches(query, entity.displayName, ...entity.aliases, ...entity.normalizedAliases))
        .map(entity => {
            const ownedIds = membersByEntity.get(entity.id);
            const count = ownedIds ? [...ownedIds].filter(id => songIds.has(id)).length : 0;
            return count > 0 ? { entity, count } : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .map(({ entity, count }) => kind === 'artist'
            ? ({ providerId: 'local' as const, id: entity.id, name: entity.displayName, aliases: entity.aliases, songCount: count })
            : ({ providerId: 'local' as const, id: entity.id, name: entity.displayName, aliases: entity.aliases, trackCount: count }));
    return paginate(hits, limit, offset);
};

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
