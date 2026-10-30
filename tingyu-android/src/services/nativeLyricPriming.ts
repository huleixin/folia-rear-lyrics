import { getPlaybackSongKey, isLocalPlaybackSong, isNavidromePlaybackSong } from '../utils/appPlaybackGuards';
import { getPrefetchedData } from './prefetchService';
import { getSongCacheWithLegacyMigration } from './onlineMusic/resourceCache';
import { migrateLyricDataRenderHints } from '../utils/lyrics/renderHints';
import { buildColorOsLyricInfo } from '../utils/lyrics/colorOsLyricInfo';
import { publishColorOsLyricInfo } from '../platform/foliaColorOsLyrics';
import { nextColorOsGeneration } from './lyricSessionGeneration';
import { createProviderSongMetadata } from '../utils/songMetadata';
import type { AudioQualityPreference } from '../types/onlineMusic';
import type { LyricData, SongResult } from '../types';

// src/services/nativeLyricPriming.ts
// Hand the native player the lyrics of tracks it is about to reach, before it reaches them.
//
// Without this, the lyric timeline for track N+1 can only be published after JS wakes up, finds
// out the track changed, loads lyrics and crosses the bridge. In a locked background session that
// chain may not run for minutes, and the island shows nothing for the whole time - not because
// the lyrics are missing but because nobody handed them over.
//
// These are cache reads only (prefetch memory -> IndexedDB). No network, no new work per track,
// and a bounded set so the same track is never rebuilt twice in a session.

const PRIMED_LIMIT = 16;
const primed: string[] = [];

const markPrimed = (key: string) => {
    if (primed.includes(key)) return;
    primed.push(key);
    while (primed.length > PRIMED_LIMIT) primed.shift();
};

const isPrimed = (key: string) => primed.includes(key);

/** Playback ended / another session took over: allow rebuilding later. */
export const resetNativeLyricPriming = (): void => {
    primed.length = 0;
};

const readCachedLyrics = async (song: SongResult, quality: AudioQualityPreference): Promise<LyricData | null> => {
    try {
        const prefetched = getPrefetchedData(song, quality);
        if (prefetched?.lyrics?.lines?.length) return prefetched.lyrics;
        const cached = await getSongCacheWithLegacyMigration<LyricData>('lyric', song, migrateLyricDataRenderHints);
        return cached?.lines?.length ? cached : null;
    } catch {
        return null;
    }
};

/**
 * Publish the cached timelines of upcoming tracks into the native lyric cache.
 *
 * Safe to call on every refill: tracks already primed are skipped, tracks without cached lyrics
 * are simply not primed (the player screen still publishes them when they actually play).
 */
export const primeNativeLyricsForSongs = async (
    songs: SongResult[],
    quality: AudioQualityPreference,
): Promise<void> => {
    for (const song of songs) {
        const key = getPlaybackSongKey(song);
        if (!key || isPrimed(key) || isLocalPlaybackSong(song) || isNavidromePlaybackSong(song)) continue;
        const lyrics = await readCachedLyrics(song, quality);
        if (!lyrics) continue;
        const metadata = createProviderSongMetadata(song);
        const built = buildColorOsLyricInfo({
            title: song.name ?? '',
            artist: metadata.artists.map(artist => artist.name).filter(Boolean).join(' / '),
            album: metadata.album.name,
            songId: song.id == null ? null : String(song.id),
            durationMs: Math.max(0, Math.round(song.durationMs ?? metadata.durationMs ?? 0)),
            lines: lyrics.lines,
            isWordByWord: lyrics.isWordByWord === true,
            sessionGeneration: nextColorOsGeneration(),
        });
        if (!built) continue;
        markPrimed(key);
        await publishColorOsLyricInfo(built.lyricInfo, built.hasTranslation, key);
    }
};
