import { usePlaybackStore } from '../stores/usePlaybackStore';

// src/hooks/useDebugLyricIndex.ts
// The application shell only needs line changes while its debug snapshot is visible.
// Lyric renderers keep their own subscriptions and the authoritative sync clock.
export function useDebugLyricIndex(enabled: boolean): number {
    return usePlaybackStore(state => enabled ? state.currentLineIndex : -1);
}
