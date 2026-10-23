import type { ObsBrowserSourceClock } from './obsBrowserSource';

// src/types/rearLyricsClock.ts
export type RearPlaybackClockSample = {
    currentTime: number;
    playbackRate: number;
    advancing: boolean;
    media?: HTMLAudioElement | null;
};
export type RearPlaybackClockReader = () => RearPlaybackClockSample | null;
export interface RearLyricsClock extends ObsBrowserSourceClock {
    timelineId?: string;
    /** Changes on real media seeks/reloads, including tiny backwards seeks. */
    discontinuity?: string;
}
