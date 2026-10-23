import type { GridViewCollectionDescriptor } from '../../../library/core/contracts/collection';
import type { LocalPlaylist } from '../../../types';
import type { SearchAlbumHit, SearchArtistHit, SearchPlaylistHit } from '../../../types/search';

// src/components/app/search/searchCollectionOpen.ts
// 把搜索结果转换成现有集合导航认识的描述符；歌手 / 专辑 / 歌单详情页沿用资料库那套，不新建页面。

export type SearchCollectionHit = SearchArtistHit | SearchAlbumHit | SearchPlaylistHit;

export const buildSearchCollectionDescriptor = (
    kind: 'artist' | 'album' | 'playlist',
    hit: SearchCollectionHit,
    localPlaylists: readonly LocalPlaylist[],
): GridViewCollectionDescriptor | null => {
    if (hit.providerId === 'local') {
        if (kind !== 'playlist') return null;
        const playlist = localPlaylists.find(item => item.id === String(hit.id));
        if (!playlist) return null;
        return {
            source: 'local',
            id: playlist.id,
            playlistId: playlist.id,
            name: playlist.name,
            type: 'playlist',
            songIds: [...playlist.songIds],
            trackCount: playlist.songIds.length,
        };
    }
    if (hit.providerId === 'navidrome') {
        if (kind === 'playlist') return null;
        return {
            source: 'navidrome',
            id: String(hit.id),
            name: hit.name,
            type: kind,
            coverUrl: hit.coverUrl,
            ...(kind === 'artist'
                ? { albumCount: (hit as SearchArtistHit).albumCount }
                : { trackCount: (hit as SearchAlbumHit).trackCount, albumArtist: (hit as SearchAlbumHit).artistName }),
        };
    }
    const base = {
        source: 'online' as const,
        providerId: hit.providerId,
        id: String(hit.id),
        name: hit.name,
        type: kind,
        coverUrl: hit.coverUrl,
    };
    if (kind === 'artist') {
        const artist = hit as SearchArtistHit;
        return { ...base, albumCount: artist.albumCount, ...(artist.description ? { description: artist.description } : {}) };
    }
    if (kind === 'album') {
        const album = hit as SearchAlbumHit;
        return {
            ...base,
            trackCount: album.trackCount,
            albumArtist: album.artistName,
            ...(album.artistName ? { artists: [{ id: '', name: album.artistName }] } : {}),
        };
    }
    const playlist = hit as SearchPlaylistHit;
    return {
        ...base,
        trackCount: playlist.trackCount,
        ...(playlist.creatorName ? { creator: { id: '', nickname: playlist.creatorName } } : {}),
        ...(playlist.description ? { description: playlist.description } : {}),
    };
};
