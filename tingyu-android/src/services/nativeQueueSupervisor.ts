import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { hasBeforePlayHook } from './hostExtensionHooks';
import { resolveNativeQueueWindow } from './nativeQueueWindow';
import { primeNativeLyricsForSongs } from './nativeLyricPriming';
import { setNativeAudioQueue } from './nativeAudioElement';
import { shufflePlayback } from './shufflePlayback';
import type { LocalSong } from '../types';
import type { NativeAudioState } from '../types/nativeAudio';

// src/services/nativeQueueSupervisor.ts
// The refill loop that does not need React.
//
// Replenishment used to be a React effect keyed on the current song: Media3 auto-advanced, an
// event reached the WebView, `playSong` adopted the new item, the store changed, the effect ran
// again and resolved the next window. Every step in that chain assumes a live render loop, so a
// backgrounded/throttled WebView silently drops the last step - and the native playlist, which
// can only auto-advance into items it already holds, eventually drains and stops.
//
// This module answers the native player directly: Media3 says "low water" or "drained", and this
// resolves a window from zustand state (readable without a render) and pushes it back, anchored
// on the track the ENGINE is on rather than the possibly stale one the UI is showing. No timers,
// no polling: one native event in, one window out.
const SIGNAL_EVENT = 'tingyu-native-queue-request';
/** Two native asks inside this window are one ask (low water + boundary can overlap). */
const MIN_INTERVAL_MS = 1_200;

let target: (() => HTMLAudioElement | null) | null = null;
let localSongs: LocalSong[] = [];
let inflight: Promise<void> | null = null;
let lastRunAt = 0;
let installed = false;

/**
 * Window ids are persisted so a WebView reload cannot hand the native player a *lower*
 * generation than it has already seen: the engine would then treat every new window as stale
 * and the session would drain with no way to refill.
 */
const GENERATION_KEY = 'tingyu.native.queue.generation';
const readGeneration = (): number => {
    try {
        const stored = Number(window.localStorage.getItem(GENERATION_KEY) ?? 0);
        return Number.isFinite(stored) && stored > 0 ? stored : 0;
    } catch {
        return 0;
    }
};
let generation = typeof window === 'undefined' ? 0 : readGeneration();

export const configureNativeQueueSupervisor = (options: {
    /** Read lazily: the active deck's element changes on an automix hand-off. */
    getElement: () => HTMLAudioElement | null;
    localSongs?: LocalSong[];
}): void => {
    target = options.getElement;
    if (options.localSongs) localSongs = options.localSongs;
};

/** Monotonic per-session window id; native echoes it back in diagnostics. */
export const nextNativeQueueGeneration = (): number => {
    generation += 1;
    try {
        window.localStorage.setItem(GENERATION_KEY, String(generation));
    } catch {
        // Persistence is a reload guard, not a requirement.
    }
    return generation;
};

/** Resolve and hand over the next window, anchored on `songKey` (the engine's current item). */
export const replenishNativeQueue = async (reason: string, songKey: string): Promise<void> => {
    const element = target?.() ?? null;
    if (!element) return;
    if (inflight) return;
    const now = Date.now();
    if (reason !== 'foreground' && now - lastRunAt < MIN_INTERVAL_MS) return;
    const store = usePlaybackStore.getState();
    if (!store.currentSong || store.activePlaybackContext !== 'main') return;
    const settings = useAudioSettingsStore.getState();
    const anchor = songKey || getPlaybackSongKey(store.currentSong);
    if (!store.playQueue.some(candidate => getPlaybackSongKey(candidate) === anchor)) {
        // The engine is on an item this queue no longer contains (queue replaced under it).
        // Resolving from a foreign anchor would corrupt the order; the next transition retries.
        return;
    }
    const controller = new AbortController();
    inflight = (async () => {
        try {
            if (settings.loopMode === 'one' || hasBeforePlayHook()) {
                // Native repeat-one owns the boundary; extension hooks must be able to cancel.
                await setNativeAudioQueue(element, [], { anchor, continues: false, generation: nextNativeQueueGeneration() });
                return;
            }
            const window = await resolveNativeQueueWindow({
                songKey: anchor,
                queue: store.playQueue,
                localSongs,
                quality: settings.audioQuality,
                loop: settings.loopMode,
                shuffleActive: shufflePlayback.active(),
                signal: controller.signal,
                isCurrent: () => !controller.signal.aborted && (target?.() ?? null) === element,
            });
            if (controller.signal.aborted || (target?.() ?? null) !== element) return;
            await setNativeAudioQueue(element, window.tracks, {
                anchor,
                continues: window.continues,
                generation: nextNativeQueueGeneration(),
            });
            // Lyrics for the tracks just handed over: cache reads only, so a background
            // auto-advance can publish the right timeline without waking React.
            void primeNativeLyricsForSongs(window.songs, settings.audioQuality);
        } catch {
            // A failed window is not fatal: the native player is still in WAITING_FOR_NEXT and
            // will ask again on its own schedule.
        } finally {
            inflight = null;
            lastRunAt = Date.now();
        }
    })();
    await inflight;
};

const onNativeSignal = (event: Event): void => {
    const state = (event as CustomEvent<NativeAudioState | undefined>).detail;
    void replenishNativeQueue('native-signal', state?.songKey ?? '');
};

const onForeground = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    // Returning to the foreground is exactly when a drained window must be refilled: the user
    // is looking, and the previous attempts may have happened while the renderer was frozen.
    void replenishNativeQueue('foreground', '');
};

/** Install once; the listener survives every render because it holds no React state. */
export const installNativeQueueSupervisor = (): void => {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    window.addEventListener(SIGNAL_EVENT, onNativeSignal);
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);
    window.addEventListener('online', onForeground);
};
