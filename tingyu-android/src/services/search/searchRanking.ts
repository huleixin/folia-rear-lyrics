import type { UnifiedSong } from '../../types';
import type { SearchAlbumHit, SearchArtistHit, SearchPlaylistHit } from '../../types/search';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { getProviderSongMetadata } from '../onlineMusic/songMetadata';
import { normalizeMusicName } from '../musicIdentity';
import { isSongUnavailable } from '../onlineMusic/songAvailability';
import type { SearchSort } from '../../stores/useSearchSettingsStore';

// src/services/search/searchRanking.ts
export function searchRelevance(query: string, name: string, artists = '', album = ''): number {
    const q = normalizeMusicName(query), n = normalizeMusicName(name), a = normalizeMusicName(artists), b = normalizeMusicName(album);
    if (!q) return 0;
    if (q === n || q === [n, a].filter(Boolean).join(' ') || q === [a, n].filter(Boolean).join(' ')) return 1000;
    if (n.startsWith(q)) return 800;
    if (n.includes(q)) return 700;
    if (q === a) return 600;
    if (q === b) return 500;
    const tokens = q.split(' '), text = [n, a, b].join(' ');
    return tokens.every(token => text.includes(token)) ? 400 : 0;
}
export function rankSearchBatch(songs: UnifiedSong[], query: string, sort: SearchSort, priority: string): UnifiedSong[] {
    const score = (song: UnifiedSong) => {
        const metadata = getProviderSongMetadata(song), ref = getPlaybackSourceRef(song);
        // Exact relevance cannot be outweighed by a source preference or availability hint.
        return searchRelevance(query, song.name, metadata.artists.map(artist => artist.name).join(' '), metadata.album.name)
            + (sort === 'local' && ref.kind === 'local' ? 20 : 0)
            + (sort === 'provider' && ref.kind === 'online' && ref.providerId === priority ? 20 : 0)
            - (isSongUnavailable(song) ? 5 : 0);
    };
    return songs.map((song, index) => ({ song, index, score: score(song) }))
        .sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.song);
}
export function appendRankedSearch(previous: UnifiedSong[], incoming: UnifiedSong[], query: string, sort: SearchSort, priority: string) {
    const seen = new Set(previous.map(getPlaybackSongKey));
    const fresh = incoming.filter(song => { const key = getPlaybackSongKey(song); if (seen.has(key)) return false; seen.add(key); return true; });
    return [...previous, ...rankSearchBatch(fresh, query, sort, priority)];
}
export type BestSearchMatch = { kind: 'song'; song: UnifiedSong }
    | { kind: 'artist'; hit: SearchArtistHit } | { kind: 'album'; hit: SearchAlbumHit } | { kind: 'playlist'; hit: SearchPlaylistHit };
export function bestSearchMatch(query: string, songs: UnifiedSong[], artists: SearchArtistHit[], albums: SearchAlbumHit[], playlists: SearchPlaylistHit[]): BestSearchMatch | null {
    const q = normalizeMusicName(query); if (!q) return null;
    const song = songs.find(song => !isSongUnavailable(song) && searchRelevance(query, song.name,
        getProviderSongMetadata(song).artists.map(artist => artist.name).join(' ')) === 1000);
    if (song) return { kind: 'song', song };
    const artist = artists.find(hit => normalizeMusicName(hit.name) === q); if (artist) return { kind: 'artist', hit: artist };
    const album = albums.find(hit => normalizeMusicName(hit.name) === q); if (album) return { kind: 'album', hit: album };
    const playlist = playlists.find(hit => normalizeMusicName(hit.name) === q); return playlist ? { kind: 'playlist', hit: playlist } : null;
}
