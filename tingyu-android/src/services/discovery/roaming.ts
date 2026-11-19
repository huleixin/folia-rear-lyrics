import { create } from 'zustand';
import { PlayerState, type SongResult } from '../../types';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { useDiscoveryPreferences } from './preferences';
import { mixRoaming, type RoamingMode } from './ranking';

export const ROAM_INITIAL_TARGET = 20;
export const ROAM_REPLENISH_THRESHOLD = 8;
export const ROAM_REPLENISH_BATCH_MIN = 10;
export const ROAM_REPLENISH_BATCH_TARGET = 15;
export const ROAM_REPLENISH_BATCH_MAX = 20;
export const ROAM_MAX_QUEUE_LENGTH = 120;
export const ROAM_KEEP_HISTORY_TRACKS = 20;

export type RoamingStatus = 'idle' | 'active' | 'replenishing' | 'error' | 'exhausted';

export interface DiscoveryRoamingState {
    active: boolean;
    mode: RoamingMode;
    status: RoamingStatus;
    exhausted: boolean;
    remainingUpcoming: number;
    notice: string;
}

export type RoamingFetchMore = (context: {
    mode: RoamingMode;
    seenKeys: ReadonlySet<string>;
    round: number;
}) => Promise<SongResult[]>;

export interface StartDiscoveryRoamingOptions {
    mode?: RoamingMode;
    fetchMore?: RoamingFetchMore;
    seed?: string;
}

const DEFAULT_STATE: DiscoveryRoamingState = {
    active: false,
    mode: 'balanced',
    status: 'idle',
    exhausted: false,
    remainingUpcoming: 0,
    notice: '',
};

export const useDiscoveryRoaming = create<DiscoveryRoamingState>(() => ({ ...DEFAULT_STATE }));

let stop: (() => void) | undefined;
let saved: SongResult[] = [];
let owned = new Set<string>();
let seenKeys = new Set<string>();
let failedKeys = new Set<string>();
let remainingPool: SongResult[] = [];
let activeFetchMore: RoamingFetchMore | undefined;
let activeAppend: ((songs: SongResult[]) => void) | undefined;
let activeSeed = '';
let sessionGeneration = 0;
let replenishRound = 0;
let appending = false;
let fetchingMore = false;
let nextRetryAt = 0;
let consecutiveErrors = 0;

function isBlockedOrFailed(song: SongResult): boolean {
    const key = getPlaybackSongKey(song);
    if (failedKeys.has(key)) return true;
    const prefs = useDiscoveryPreferences.getState().values;
    return Boolean(prefs[key]?.blocked);
}

function dedupeFilterCandidates(songs: SongResult[], exclude: ReadonlySet<string> = new Set()): SongResult[] {
    const map = new Map<string, SongResult>();
    for (const song of songs) {
        const key = getPlaybackSongKey(song);
        if (!key || exclude.has(key) || isBlockedOrFailed(song) || map.has(key)) continue;
        map.set(key, song);
    }
    return [...map.values()];
}

function trimPlayedHistoryIfNeeded(state: ReturnType<typeof usePlaybackStore.getState>, currentIndex: number) {
    if (state.playQueue.length <= ROAM_MAX_QUEUE_LENGTH || currentIndex <= ROAM_KEEP_HISTORY_TRACKS) return;
    const dropCount = currentIndex - ROAM_KEEP_HISTORY_TRACKS;
    if (dropCount <= 0) return;
    const trimmed = state.playQueue.slice(dropCount);
    appending = true;
    try {
        state.setPlayQueue(trimmed);
    } finally {
        appending = false;
    }
}

function takeBatchFromPool(present: Set<string>, targetCount: number): SongResult[] {
    const batch: SongResult[] = [];
    while (remainingPool.length && batch.length < targetCount) {
        const song = remainingPool.shift()!;
        const key = getPlaybackSongKey(song);
        if (!present.has(key) && !isBlockedOrFailed(song)) {
            present.add(key);
            owned.add(key);
            seenKeys.add(key);
            batch.push(song);
        }
    }
    return batch;
}

function commitAppendBatch(batch: SongResult[]) {
    if (!batch.length) return;
    appending = true;
    try {
        if (activeAppend) {
            activeAppend(batch);
        } else {
            const state = usePlaybackStore.getState();
            const present = new Set(state.playQueue.map(getPlaybackSongKey));
            const filtered = batch.filter(song => !present.has(getPlaybackSongKey(song)));
            if (filtered.length) state.setPlayQueue([...state.playQueue, ...filtered]);
        }
    } finally {
        appending = false;
    }
    const after = usePlaybackStore.getState();
    const curKey = after.currentSong ? getPlaybackSongKey(after.currentSong) : '';
    const idx = curKey ? after.playQueue.findIndex(s => getPlaybackSongKey(s) === curKey) : -1;
    if (idx >= 0) {
        trimPlayedHistoryIfNeeded(after, idx);
    }
    const finalState = usePlaybackStore.getState();
    const finalIdx = curKey ? finalState.playQueue.findIndex(s => getPlaybackSongKey(s) === curKey) : -1;
    const upcoming = finalIdx >= 0 ? Math.max(0, finalState.playQueue.length - 1 - finalIdx) : finalState.playQueue.length;
    useDiscoveryRoaming.setState({
        status: 'active',
        exhausted: false,
        remainingUpcoming: upcoming,
        notice: '',
    });
}

async function triggerAsyncFetchAndReplenish(generation: number) {
    if (fetchingMore || !activeFetchMore) return;
    const now = Date.now();
    if (now < nextRetryAt) return;
    fetchingMore = true;
    const mode = useDiscoveryRoaming.getState().mode;
    useDiscoveryRoaming.setState({ status: 'replenishing', notice: '正在补充漫游歌曲…' });
    try {
        replenishRound += 1;
        const fetched = await activeFetchMore({
            mode,
            seenKeys: new Set(seenKeys),
            round: replenishRound,
        });
        if (generation !== sessionGeneration || !useDiscoveryRoaming.getState().active) return;

        consecutiveErrors = 0;
        nextRetryAt = 0;

        const state = usePlaybackStore.getState();
        const present = new Set(state.playQueue.map(getPlaybackSongKey));
        const exclude = new Set([...present, ...seenKeys]);
        const freshUnique = dedupeFilterCandidates(fetched, exclude);

        if (freshUnique.length) {
            const prefs = useDiscoveryPreferences.getState().values;
            const mixed = mixRoaming(
                freshUnique,
                prefs,
                mode,
                `${activeSeed || new Date().toLocaleDateString('sv-SE')}:r${replenishRound}`,
                Math.max(freshUnique.length, ROAM_REPLENISH_BATCH_MAX),
            );
            mixed.forEach(song => {
                const key = getPlaybackSongKey(song);
                owned.add(key);
                seenKeys.add(key);
            });
            remainingPool.push(...mixed);
        }

        const batch = takeBatchFromPool(present, ROAM_REPLENISH_BATCH_TARGET);
        if (batch.length) {
            commitAppendBatch(batch);
            return;
        }

        if (!remainingPool.length) {
            useDiscoveryRoaming.setState({
                status: 'exhausted',
                exhausted: true,
                notice: '当前曲库已全部漫游完毕',
            });
        } else {
            useDiscoveryRoaming.setState({ status: 'active', exhausted: false, notice: '' });
        }
    } catch {
        if (generation !== sessionGeneration || !useDiscoveryRoaming.getState().active) return;
        consecutiveErrors += 1;
        const backoffMs = Math.min(60_000, 10_000 * Math.pow(2, Math.min(3, consecutiveErrors - 1)));
        nextRetryAt = Date.now() + backoffMs;
        useDiscoveryRoaming.setState({
            status: 'error',
            notice: '网络波动，稍后自动重试补充歌曲',
        });
    } finally {
        fetchingMore = false;
    }
}

function evaluateQueueAndReplenish(forceCheck = false) {
    const roamState = useDiscoveryRoaming.getState();
    if (!roamState.active || appending) return;
    const state = usePlaybackStore.getState();
    if (!state.currentSong) return;

    const key = getPlaybackSongKey(state.currentSong);
    if (!owned.has(key)) {
        endDiscoveryRoaming(false);
        return;
    }

    const index = state.playQueue.findIndex(song => getPlaybackSongKey(song) === key);
    if (index < 0) return;

    const remainingUpcoming = Math.max(0, state.playQueue.length - 1 - index);
    if (roamState.remainingUpcoming !== remainingUpcoming) {
        useDiscoveryRoaming.setState({ remainingUpcoming });
    }

    if (remainingUpcoming > ROAM_REPLENISH_THRESHOLD) {
        if (roamState.exhausted) {
            useDiscoveryRoaming.setState({ exhausted: false, status: 'active', notice: '' });
        }
        return;
    }

    // Only a genuine advance / playback or explicit wake-up check may replenish.
    if (!forceCheck && state.playerState !== PlayerState.PLAYING) return;

    const present = new Set(state.playQueue.map(getPlaybackSongKey));
    const batch = takeBatchFromPool(present, ROAM_REPLENISH_BATCH_TARGET);
    if (batch.length) {
        commitAppendBatch(batch);
        // Proactively top up candidate pool in background if it's getting low
        if (remainingPool.length < ROAM_REPLENISH_BATCH_MIN && activeFetchMore && !fetchingMore) {
            void triggerAsyncFetchAndReplenish(sessionGeneration);
        }
        return;
    }

    if (activeFetchMore) {
        void triggerAsyncFetchAndReplenish(sessionGeneration);
    } else if (!remainingPool.length) {
        useDiscoveryRoaming.setState({
            status: 'exhausted',
            exhausted: true,
            notice: '当前曲库已全部漫游完毕',
        });
    }
}

/** Uses the existing queue writer and playback entry; never owns a second transport. */
export function startDiscoveryRoaming(
    candidates: SongResult[],
    play: (song: SongResult, queue: SongResult[]) => void,
    append?: (songs: SongResult[]) => void,
    options: StartDiscoveryRoamingOptions = {},
) {
    const unique = dedupeFilterCandidates(candidates);
    if (!unique.length) return;

    if (!useDiscoveryRoaming.getState().active) {
        saved = usePlaybackStore.getState().playQueue;
    }
    stop?.();
    sessionGeneration += 1;
    replenishRound = 0;
    fetchingMore = false;
    nextRetryAt = 0;
    consecutiveErrors = 0;

    const mode: RoamingMode = options.mode ?? 'balanced';
    activeFetchMore = options.fetchMore;
    activeAppend = append;
    activeSeed = options.seed ?? new Date().toLocaleDateString('sv-SE');

    const initial = unique.slice(0, ROAM_INITIAL_TARGET);
    remainingPool = unique.slice(ROAM_INITIAL_TARGET);
    owned = new Set(unique.map(getPlaybackSongKey));
    seenKeys = new Set(initial.map(getPlaybackSongKey));

    useDiscoveryRoaming.setState({
        active: true,
        mode,
        status: 'active',
        exhausted: false,
        remainingUpcoming: Math.max(0, initial.length - 1),
        notice: '',
    });

    play(initial[0], initial);

    const onWakeOrTrack = () => evaluateQueueAndReplenish(true);
    const onVisibility = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            evaluateQueueAndReplenish(true);
        }
    };
    const unsubscribeStore = usePlaybackStore.subscribe(() => evaluateQueueAndReplenish(false));
    if (typeof window !== 'undefined') {
        window.addEventListener('tingyu-native-queue-track', onWakeOrTrack);
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility);
    }

    stop = () => {
        unsubscribeStore();
        if (typeof window !== 'undefined') {
            window.removeEventListener('tingyu-native-queue-track', onWakeOrTrack);
        }
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', onVisibility);
        }
    };

    if (initial.length <= ROAM_REPLENISH_THRESHOLD && activeFetchMore) {
        void triggerAsyncFetchAndReplenish(sessionGeneration);
    }
}

/**
 * Switch roaming mode directly without exiting roaming or interrupting the current song.
 * Replaces upcoming unplayed tracks with the newly mixed batch for the target mode.
 */
export function switchRoamingMode(mode: RoamingMode, extraCandidates: SongResult[] = []): boolean {
    const roamState = useDiscoveryRoaming.getState();
    if (!roamState.active) return false;

    const state = usePlaybackStore.getState();
    const currentSong = state.currentSong;
    if (!currentSong) return false;

    sessionGeneration += 1;
    fetchingMore = false;
    nextRetryAt = 0;
    consecutiveErrors = 0;

    const currentKey = getPlaybackSongKey(currentSong);
    const currentIndex = state.playQueue.findIndex(song => getPlaybackSongKey(song) === currentKey);
    const historyAndCurrent = currentIndex >= 0 ? state.playQueue.slice(0, currentIndex + 1) : [currentSong];
    const oldUpcoming = currentIndex >= 0 ? state.playQueue.slice(currentIndex + 1) : [];
    const historyKeys = new Set(historyAndCurrent.map(getPlaybackSongKey));

    const combinedPool = dedupeFilterCandidates(
        [...oldUpcoming, ...remainingPool, ...extraCandidates],
        historyKeys,
    );
    const prefs = useDiscoveryPreferences.getState().values;
    const mixed = mixRoaming(
        combinedPool,
        prefs,
        mode,
        `${activeSeed || new Date().toLocaleDateString('sv-SE')}:mode:${mode}:${sessionGeneration}`,
        Math.max(combinedPool.length, ROAM_INITIAL_TARGET),
    );

    const nextUpcoming = mixed.slice(0, ROAM_INITIAL_TARGET);
    remainingPool = mixed.slice(ROAM_INITIAL_TARGET);

    owned = new Set([
        ...historyAndCurrent.map(getPlaybackSongKey),
        ...mixed.map(getPlaybackSongKey),
    ]);
    nextUpcoming.forEach(song => seenKeys.add(getPlaybackSongKey(song)));

    appending = true;
    try {
        state.setPlayQueue([...historyAndCurrent, ...nextUpcoming]);
    } finally {
        appending = false;
    }

    useDiscoveryRoaming.setState({
        active: true,
        mode,
        status: 'active',
        exhausted: false,
        remainingUpcoming: nextUpcoming.length,
        notice: '',
    });

    if (nextUpcoming.length <= ROAM_REPLENISH_THRESHOLD && activeFetchMore) {
        void triggerAsyncFetchAndReplenish(sessionGeneration);
    }
    return true;
}

export function markRoamingSongFailed(song: SongResult) {
    const key = getPlaybackSongKey(song);
    if (key) failedKeys.add(key);
}

export function endDiscoveryRoaming(restore = true) {
    sessionGeneration += 1;
    fetchingMore = false;
    stop?.();
    stop = undefined;
    if (restore && useDiscoveryRoaming.getState().active) {
        const state = usePlaybackStore.getState();
        const current = state.currentSong;
        state.setPlayQueue(
            current
                ? [current, ...saved.filter(song => getPlaybackSongKey(song) !== getPlaybackSongKey(current))]
                : saved,
        );
    }
    useDiscoveryRoaming.setState({ ...DEFAULT_STATE });
    owned.clear();
    seenKeys.clear();
    failedKeys.clear();
    remainingPool = [];
    activeFetchMore = undefined;
    activeAppend = undefined;
    saved = [];
    nextRetryAt = 0;
    consecutiveErrors = 0;
}
