import { getPlaybackSongKey, isLocalPlaybackSong, isNavidromePlaybackSong } from '../utils/appPlaybackGuards';
import { getPrefetchedData, resolvePrefetchAudioUrl, updatePrefetchedAudioUrl } from './prefetchService';
import { nativeAudioUrlForRef } from './nativeLocalMusic';
import { buildNativePlaybackPayload } from './nativePlaybackBridge';
import { shufflePlayback } from './shufflePlayback';
import type { AudioQualityPreference } from '../types/onlineMusic';
import type { LocalSong, SongResult } from '../types';
import type { NativeQueueTrack } from '../types/nativeAudio';

// src/services/nativeQueueWindow.ts
// One implementation of "what comes next", shared by both triggers.
//
// The window is the only part of continuous playback that needs the network: Media3 can only
// auto-advance into items it already holds a resolved URI for. Two very different callers need
// it -
//   1. the React effect, when JS is awake and the track changed;
//   2. the native supervisor, when Media3 itself says the window is running dry (possibly with
//      no React render and a stale JS song in the store).
// Keeping one implementation is what stops the two from disagreeing about order, shuffle or
// loop; `continues` is the piece the native side needs to tell "playlist finished" from
// "window finished", which the old code could not distinguish at all.

/** How many online tracks are resolved ahead. Bounds lookahead, not total playback. */
export const ONLINE_QUEUE_WINDOW = 5;
/** A provider that never answers must not freeze replenishment forever. */
export const RESOLVE_TIMEOUT_MS = 15_000;
/** Unresolvable candidates are skipped, but a fully broken provider must not spin the window. */
const MAX_UNRESOLVED_SKIPS = 3;
/** Local files need no lookahead limit: their URIs are already on disk. */
const LOCAL_QUEUE_LIMIT = 999;

export interface NativeQueueWindowOptions {
    /** Track the window is anchored on - the ENGINE's current item when native asked. */
    songKey: string;
    queue: SongResult[];
    localSongs: LocalSong[];
    quality: AudioQualityPreference;
    loop: 'off' | 'all' | 'one';
    shuffleActive: boolean;
    /** Aborted when the playback intent changed; every await re-checks it. */
    signal: AbortSignal;
    /** Re-checked before each await returns: a stale window must never overwrite a new one. */
    isCurrent: () => boolean;
    /** Called with the tracks resolved so far, so the first next-track URI is usable at once. */
    onProgress?: (tracks: NativeQueueTrack[]) => Promise<void> | void;
}

export interface NativeQueueWindowResult {
    tracks: NativeQueueTrack[];
    /**
     * The logical playlist still has music after this window: the native player must keep the
     * session open and ask for a refill instead of reporting a finished playlist.
     */
    continues: boolean;
    /** The upcoming songs in queue order (for priming their lyrics into the native cache). */
    songs: SongResult[];
}

const raceTimeout = async <T>(value: Promise<T>, ms: number): Promise<T | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            value,
            new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
};

/**
 * The tracks that should follow `songKey`, with URIs resolved.
 *
 * Failure policy (each one learned from a background stop):
 * - one unresolvable track is skipped, not fatal: a rate limit on track N must not strand
 *   tracks N+1.. that are perfectly playable;
 * - a hanging provider request races a timeout instead of freezing the whole window;
 * - skipped tracks stay in the logical queue - the JS queue owns order, this only decides what
 *   the native player may auto-advance into.
 */
export const resolveNativeQueueWindow = async (
    options: NativeQueueWindowOptions,
): Promise<NativeQueueWindowResult> => {
    const { songKey, queue, localSongs, quality, loop, shuffleActive, signal, isCurrent, onProgress } = options;
    const tracks: NativeQueueTrack[] = [];
    const songs: SongResult[] = [];
    const valid = () => !signal.aborted && isCurrent();
    if (!valid()) return { tracks, continues: false, songs };

    const index = queue.findIndex(candidate => getPlaybackSongKey(candidate) === songKey);
    if (index < 0) return { tracks, continues: false, songs };

    const current = queue[index];
    const shuffled = shuffleActive ? shufflePlayback.next(queue, current) : null;
    let full = shuffled ? [shuffled] : queue.slice(index + 1);
    const wrapped = full.length === 0 && loop === 'all';
    if (wrapped) full = queue.slice();
    // "More music after this window" has three independent sources: candidates we are not
    // queueing yet, a wrapping loop, or a shuffled jump that will be recomputed from JS anyway.
    let continues = loop === 'all' || shuffled != null || full.length > ONLINE_QUEUE_WINDOW;
    const localOnly = full.length > 0 && full.every(isLocalPlaybackSong);
    const candidates = full.slice(0, localOnly ? LOCAL_QUEUE_LIMIT : ONLINE_QUEUE_WINDOW);
    if (localOnly && candidates.length >= full.length) continues = loop === 'all';

    let skips = 0;
    for (const next of candidates) {
        if (!valid()) return { tracks, continues: false, songs };
        let uri: string | null = null;
        if (isLocalPlaybackSong(next)) {
            const record = localSongs.find(candidate => candidate.id === next.localRef.songId);
            uri = record?.nativeAudioRef
                ? await nativeAudioUrlForRef(record.nativeAudioRef)
                : record?.nativeAudioUrl ?? null;
        } else if (!isNavidromePlaybackSong(next)) {
            const existing = getPrefetchedData(next, quality);
            const resolved = existing?.audioUrl && existing.audioUrl !== 'CACHED_IN_DB'
                ? { audioUrl: existing.audioUrl, replayGain: existing.replayGain }
                : await raceTimeout(resolvePrefetchAudioUrl(next, quality, signal), RESOLVE_TIMEOUT_MS);
            uri = resolved?.audioUrl ?? null;
            if (uri && uri !== 'CACHED_IN_DB') updatePrefetchedAudioUrl(next, uri, quality, resolved?.replayGain);
        }
        if (!valid()) return { tracks, continues: false, songs };
        if (!uri || !/^(https?:|content:|file:)/.test(uri)) {
            if (++skips >= MAX_UNRESOLVED_SKIPS) break;
            continue;
        }
        const metadata = buildNativePlaybackPayload(next, true, 0, (next.durationMs ?? 0) / 1000);
        tracks.push({
            songKey: getPlaybackSongKey(next),
            uri,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            coverUrl: metadata.coverUrl,
            duration: metadata.duration,
        });
        songs.push(next);
        if (!localOnly && onProgress) await onProgress(tracks.slice());
    }
    return { tracks, continues, songs };
};
