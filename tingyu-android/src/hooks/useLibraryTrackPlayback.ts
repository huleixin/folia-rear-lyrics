import { useCallback } from 'react';
import type { SongResult } from '../types';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { usePlaybackEntryViewStore } from '../stores/usePlaybackEntryViewStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// src/hooks/useLibraryTrackPlayback.ts
// Keep the existing "stay here" playback semantics without subscribing a page to transport ticks.
export function useLibraryTrackPlayback(play: (track: SongResult, queue: SongResult[]) => void, toggle?: () => void) {
    return useCallback(
        (track: SongResult, queue: SongResult[]) => {
            const current = usePlaybackStore.getState().currentSong;
            if (
                toggle &&
                current &&
                usePlaybackEntryViewStore.getState().playbackEntryView === 'stay' &&
                getPlaybackSongKey(current) === getPlaybackSongKey(track)
            )
                toggle();
            else play(track, queue);
        },
        [play, toggle]
    );
}
