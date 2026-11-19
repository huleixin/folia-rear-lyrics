import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/services/appDatabase', () => ({
    appDatabase: { session: { get: async () => undefined, put: async () => {} } },
}));

import { PlayerState, type SongResult } from '../../../src/types';
import { usePlaybackStore } from '../../../src/stores/usePlaybackStore';
import {
    ROAM_INITIAL_TARGET,
    ROAM_REPLENISH_THRESHOLD,
    startDiscoveryRoaming,
    switchRoamingMode,
    endDiscoveryRoaming,
    useDiscoveryRoaming,
} from '../../../src/services/discovery/roaming';
import { getPlaybackSongKey } from '../../../src/utils/appPlaybackGuards';

const makeSong = (id: number, providerId = 'netease'): SongResult => ({
    id,
    name: `Song ${id}`,
    artists: [{ id: id * 10, name: `Artist ${id}` }],
    album: { id: 1, name: 'Album' },
    durationMs: 180000,
    sourceRef: { kind: 'online', providerId, mediaId: String(id) },
} as SongResult);

describe('continuous discovery roaming', () => {
    beforeEach(() => {
        endDiscoveryRoaming(false);
        usePlaybackStore.setState({
            currentSong: null,
            playQueue: [],
            playerState: PlayerState.PAUSED,
        });
    });

    afterEach(() => {
        endDiscoveryRoaming(false);
    });

    it('starts with 20 songs when enough candidates exist, and uses actual count when fewer than 20 without duplicating', () => {
        const thirtySongs = Array.from({ length: 30 }, (_, i) => makeSong(i + 1));
        let startedQueue: SongResult[] = [];
        startDiscoveryRoaming(
            thirtySongs,
            (song, queue) => {
                startedQueue = queue;
                usePlaybackStore.setState({ currentSong: song, playQueue: queue, playerState: PlayerState.PLAYING });
            },
            songs => {
                const cur = usePlaybackStore.getState().playQueue;
                usePlaybackStore.setState({ playQueue: [...cur, ...songs] });
            },
        );
        expect(startedQueue).toHaveLength(ROAM_INITIAL_TARGET);
        expect(new Set(startedQueue.map(getPlaybackSongKey)).size).toBe(ROAM_INITIAL_TARGET);
        expect(useDiscoveryRoaming.getState().active).toBe(true);

        endDiscoveryRoaming(false);
        const fiveSongs = Array.from({ length: 5 }, (_, i) => makeSong(100 + i));
        startDiscoveryRoaming(
            fiveSongs,
            (song, queue) => {
                startedQueue = queue;
                usePlaybackStore.setState({ currentSong: song, playQueue: queue, playerState: PlayerState.PLAYING });
            },
        );
        expect(startedQueue).toHaveLength(5);
    });

    it('replenishes 10-20 songs when remaining upcoming tracks drop to <= 8 and fetches more when pool runs low', async () => {
        const initialBatch = Array.from({ length: 22 }, (_, i) => makeSong(i + 1));
        const fetchedBatch = Array.from({ length: 18 }, (_, i) => makeSong(100 + i));
        const fetchMore = vi.fn().mockResolvedValue(fetchedBatch);

        startDiscoveryRoaming(
            initialBatch,
            (song, queue) => {
                usePlaybackStore.setState({ currentSong: song, playQueue: queue, playerState: PlayerState.PLAYING });
            },
            songs => {
                const cur = usePlaybackStore.getState().playQueue;
                usePlaybackStore.setState({ playQueue: [...cur, ...songs] });
            },
            { mode: 'balanced', fetchMore },
        );

        // Advance to index 12 -> 20 - 1 - 12 = 7 remaining (<= 8 threshold)
        const queueAfterStart = usePlaybackStore.getState().playQueue;
        expect(queueAfterStart).toHaveLength(20);
        usePlaybackStore.setState({ currentSong: queueAfterStart[12], playerState: PlayerState.PLAYING });

        // Pool had 2 leftover songs (21, 22) appended immediately, and fetchMore called in background
        await vi.waitFor(() => {
            expect(fetchMore).toHaveBeenCalledTimes(1);
        });
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(usePlaybackStore.getState().playQueue.length).toBeGreaterThan(20);
        expect(ROAM_REPLENISH_THRESHOLD).toBe(8);
    });

    it('switches roaming mode without exiting or interrupting the current playing song', () => {
        const songs = Array.from({ length: 25 }, (_, i) => makeSong(i + 1));
        startDiscoveryRoaming(
            songs,
            (song, queue) => {
                usePlaybackStore.setState({ currentSong: song, playQueue: queue, playerState: PlayerState.PLAYING });
            },
        );

        const initialCurrent = usePlaybackStore.getState().playQueue[2];
        usePlaybackStore.setState({ currentSong: initialCurrent, playerState: PlayerState.PLAYING });

        const switched = switchRoamingMode('explore');
        expect(switched).toBe(true);
        expect(useDiscoveryRoaming.getState().active).toBe(true);
        expect(useDiscoveryRoaming.getState().mode).toBe('explore');
        expect(usePlaybackStore.getState().currentSong).toEqual(initialCurrent);
        const newQueue = usePlaybackStore.getState().playQueue;
        const idx = newQueue.findIndex(s => getPlaybackSongKey(s) === getPlaybackSongKey(initialCurrent));
        expect(idx).toBe(2);
        expect(newQueue.length - 1 - idx).toBeGreaterThan(0);
    });

    it('restores original queue when exiting roaming and handles fetchMore errors gracefully', async () => {
        const original = [makeSong(901), makeSong(902)];
        usePlaybackStore.setState({ playQueue: original });

        const songs = Array.from({ length: 12 }, (_, i) => makeSong(i + 1));
        const fetchMore = vi.fn().mockRejectedValue(new Error('network timeout'));
        startDiscoveryRoaming(
            songs,
            (song, queue) => {
                usePlaybackStore.setState({ currentSong: song, playQueue: queue, playerState: PlayerState.PLAYING });
            },
            undefined,
            { mode: 'familiar', fetchMore },
        );

        // With 12 songs, remainingUpcoming is 11; advance to index 4 (remaining = 7 <= 8)
        const q = usePlaybackStore.getState().playQueue;
        usePlaybackStore.setState({ currentSong: q[4], playerState: PlayerState.PLAYING });

        await vi.waitFor(() => {
            expect(useDiscoveryRoaming.getState().status).toBe('error');
        });
        expect(useDiscoveryRoaming.getState().active).toBe(true);

        endDiscoveryRoaming(true);
        expect(useDiscoveryRoaming.getState().active).toBe(false);
        expect(usePlaybackStore.getState().playQueue.map(s => s.id)).toEqual([5, 901, 902]);
    });
});
