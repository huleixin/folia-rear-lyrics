import { useEffect } from 'react';
import { currentTime } from '../stores/motionSignals';
import { usePlaybackStore, selectDisplaySong, selectDisplayPlayerState } from '../stores/usePlaybackStore';
import { PlayerState } from '../types';
import type { SongResult } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { PlaybackListenTracker } from '../utils/playbackListenTracker';
import { hydratePreferences, recordDiscoveryFeedback } from '../services/discovery/preferences';
import { useDiscoverySettingsStore } from '../stores/useDiscoverySettingsStore';

/** Observe the existing clock outside React. No database write or component update on clock ticks. */
export function useDiscoveryListening() {
    useEffect(() => {
        void hydratePreferences();
        const tracker = new PlaybackListenTracker();
        let song: SongResult | null = null, session = '', playing = false, lastSample = 0;
        const settle = () => {
            const report = tracker.settle();
            if (song && report) recordDiscoveryFeedback(song, 'listen', { session, seconds: report.playedSeconds, completed: report.totalSeconds > 0 && report.playedSeconds >= report.totalSeconds * .95 });
            tracker.clear();
        };
        const update = () => {
            const state = usePlaybackStore.getState(), next = selectDisplaySong(state);
            playing = selectDisplayPlayerState(state) === PlayerState.PLAYING;
            if (!useDiscoverySettingsStore.getState().record) { tracker.clear(); song = null; return; }
            if ((next ? getPlaybackSongKey(next) : null) === (song ? getPlaybackSongKey(song) : null)) return;
            settle(); song = next; session = `${Date.now()}:${Math.random()}`;
            if (next) tracker.start({ songKey: getPlaybackSongKey(next), mediaId: String(next.id), totalSeconds: next.durationMs / 1000 });
        };
        const unsubscribe = usePlaybackStore.subscribe(update);
        const settings = useDiscoverySettingsStore.subscribe(update); update();
        const clock = currentTime.on('change', value => {
            if (!playing || !song) return;
            const now = performance.now(); if (now - lastSample < 200) return; lastSample = now;
            if (tracker.handleProgress(value).restarted) {
                settle(); session = `${Date.now()}:${Math.random()}`;
                tracker.start({ songKey: getPlaybackSongKey(song), mediaId: String(song.id), totalSeconds: song.durationMs / 1000 });
            }
        });
        return () => { unsubscribe(); settings(); clock(); tracker.clear(); };
    }, []);
}
