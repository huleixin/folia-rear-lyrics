import { useEffect } from 'react';
import { currentTime } from '../stores/motionSignals';
import { usePlaybackStore, selectDisplaySong, selectDisplayPlayerState } from '../stores/usePlaybackStore';
import { PlayerState } from '../types';
import type { SongResult } from '../types';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../utils/appPlaybackGuards';
import { PlaybackListenTracker } from '../utils/playbackListenTracker';
import { hydratePreferences, recordDiscoveryFeedback } from '../services/discovery/preferences';
import { useDiscoverySettingsStore } from '../stores/useDiscoverySettingsStore';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import { LISTENING_STATISTICS_CLEARED, storeListeningSession } from '../services/listeningStatistics';

// src/hooks/useDiscoveryListening.ts

/** Observe the existing clock outside React. No database write or component update on clock ticks. */
export function useDiscoveryListening() {
    useEffect(() => {
        void hydratePreferences();
        const tracker = new PlaybackListenTracker();
        let song: SongResult | null = null, session = '', playing = false, lastSample = 0;
        let startedAt = 0, providerId = '', accountKey = '';
        const begin = (next: SongResult) => {
            startedAt = Date.now(); session = globalThis.crypto?.randomUUID?.() ?? `${startedAt}:${Math.random()}`;
            const source = getPlaybackSourceRef(next);
            providerId = source.kind === 'online' ? source.providerId : source.kind;
            accountKey = source.kind === 'online'
                ? String(useOnlineProviderAccountStore.getState().accounts[source.providerId]?.user?.id ?? 'anonymous') : 'device';
            tracker.start({ songKey: getPlaybackSongKey(next), mediaId: String(next.id), totalSeconds: next.durationMs / 1000 });
        };
        const settle = () => {
            const report = tracker.settle();
            if (song && report && useDiscoverySettingsStore.getState().record) {
                const completed = report.totalSeconds > 0 && report.playedSeconds >= report.totalSeconds * .95;
                recordDiscoveryFeedback(song, 'listen', { session, seconds: report.playedSeconds, completed });
                void storeListeningSession({ id: session, songKey: report.songKey, providerId, accountKey,
                    startedAt, endedAt: Date.now(), seconds: report.playedSeconds, completed, song });
            }
            tracker.clear();
        };
        const update = () => {
            const state = usePlaybackStore.getState(), next = selectDisplaySong(state);
            playing = selectDisplayPlayerState(state) === PlayerState.PLAYING;
            if (!useDiscoverySettingsStore.getState().record) { tracker.clear(); song = null; return; }
            if ((next ? getPlaybackSongKey(next) : null) === (song ? getPlaybackSongKey(song) : null)) return;
            settle(); song = next;
            if (next) begin(next);
        };
        const unsubscribe = usePlaybackStore.subscribe(update);
        const settings = useDiscoverySettingsStore.subscribe(update); update();
        const resetStatistics = () => { tracker.clear(); if (song) begin(song); };
        window.addEventListener(LISTENING_STATISTICS_CLEARED, resetStatistics);
        const clock = currentTime.on('change', value => {
            if (!playing || !song) return;
            const now = performance.now(); if (now - lastSample < 200) return; lastSample = now;
            if (tracker.handleProgress(value).restarted) {
                settle(); begin(song);
            }
        });
        return () => { unsubscribe(); settings(); clock(); window.removeEventListener(LISTENING_STATISTICS_CLEARED, resetStatistics); settle(); };
    }, []);
}
