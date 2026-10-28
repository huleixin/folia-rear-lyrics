import { create } from 'zustand';
import { PLAYBACK_TEST_SESSION_ENGINE, type PlaybackTestEngine } from '../utils/playbackEngineTestBuild';

// src/stores/usePlaybackEngineTestStore.ts
export const usePlaybackEngineTestStore = create<{
    selected: PlaybackTestEngine; actual: 'web' | 'media3' | 'pending'; reason: string;
    select: (engine: PlaybackTestEngine) => void;
}>((set) => ({
    selected: PLAYBACK_TEST_SESSION_ENGINE, actual: 'web', reason: 'selected-stable',
    select: selected => set({ selected }),
}));
export function setPlaybackTestActual(actual: 'web' | 'media3' | 'pending', reason: string) {
    const previous=usePlaybackEngineTestStore.getState();
    if(previous.actual!==actual||previous.reason!==reason)usePlaybackEngineTestStore.setState({actual,reason});
}
