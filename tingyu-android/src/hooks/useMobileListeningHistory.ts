import { useEffect } from 'react';
import { PlayerState } from '../types';
import { usePlaybackStore, selectDisplaySong, selectDisplayPlayerState } from '../stores/usePlaybackStore';
import { useMobileLibraryStore } from '../stores/useMobileLibraryStore';
import { isLocalPlaybackSong, isNavidromePlaybackSong } from '../utils/appPlaybackGuards';

// src/hooks/useMobileListeningHistory.ts
// Subscribe to discrete playback changes, not a clock; remains active while the original stage is open.
export const useMobileListeningHistory = () => {
    useEffect(() => {
        const record = () => {
            const state = usePlaybackStore.getState();
            const song = selectDisplaySong(state);
            if (
                song &&
                selectDisplayPlayerState(state) === PlayerState.PLAYING &&
                !isLocalPlaybackSong(song) &&
                !isNavidromePlaybackSong(song)
            ) {
                useMobileLibraryStore.getState().remember(song);
            }
        };
        record();
        return usePlaybackStore.subscribe(record);
    }, []);
};
