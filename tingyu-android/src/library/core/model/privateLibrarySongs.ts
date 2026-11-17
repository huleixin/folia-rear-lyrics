import type { SmartCandidate } from './smartPlaylists';
import type { ListeningSessionRecord } from '../../../types/listeningStatistics';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';

// src/library/core/model/privateLibrarySongs.ts
/** Search only supplied private data, never invoke a public provider search. */
export function privateLibrarySongs(candidates: readonly SmartCandidate[], records: readonly ListeningSessionRecord[], query = '') {
    const liked = candidates.filter(candidate => candidate.liked).map(candidate => candidate.song);
    const seen = new Set<string>();
    const recent = [...records].sort((a, b) => b.startedAt - a.startedAt).flatMap(record => {
        const key = getPlaybackSongKey(record.song);
        if (seen.has(key)) return [];
        seen.add(key); return [record.song];
    });
    const needle = query.normalize('NFKC').trim().toLocaleLowerCase();
    const matches = needle ? candidates.filter(({ song }) =>
        [song.name, song.album?.name, ...song.artists.map(artist => artist.name)]
            .some(value => value?.normalize('NFKC').toLocaleLowerCase().includes(needle))).map(candidate => candidate.song) : [];
    return { liked, recent, matches };
}
