import { PlayerState } from '../types';
import type { RearLyricsClock } from '../types/rearLyricsClock';
import { resolveObsBrowserSourceClockTime } from './obsBrowserSource';

// src/utils/rearLyricsClock.ts
const project = (clock: RearLyricsClock, now: number) =>
    resolveObsBrowserSourceClockTime({ ...clock, lyricOffsetMs: 0 }, now);

/** Slew small transport/decoder errors without ever moving the running playhead backwards.
 * Real seeks, track changes and playback-state changes remain immediate. Rear surface only. */
export function createRearClockSynchronizer() {
    let incoming: RearLyricsClock | null = null;
    let anchor: RearLyricsClock | null = null;
    return {
        accept(next: RearLyricsClock, now = Date.now()): RearLyricsClock {
            const sameEpoch = incoming?.timelineId === next.timelineId
                && incoming?.discontinuity === next.discontinuity;
            if (anchor && incoming && sameEpoch) {
                if (next.sentAtMs < incoming.sentAtMs) return anchor;
                if (next.sentAtMs === incoming.sentAtMs && next.currentTime === incoming.currentTime
                    && next.playerState === incoming.playerState && next.playbackRate === incoming.playbackRate
                    && next.duration === incoming.duration && next.lyricOffsetMs === incoming.lyricOffsetMs) return anchor;
            }
            const predicted = anchor ? project(anchor, now) : 0;
            const error = project(next, now) - predicted;
            const reset = !anchor || !incoming || !sameEpoch
                || next.playerState !== incoming.playerState || next.playbackRate !== incoming.playbackRate
                || next.playerState !== PlayerState.PLAYING || Math.abs(error) > 0.35;
            if (reset) {
                anchor = { ...next };
            } else {
                const rate = next.playbackRate || 1;
                const correction = Math.max(-rate * 0.08, Math.min(rate * 0.08, error * 0.5));
                // Keep the position continuous; correct only the rate, not the current frame.
                anchor = { ...next, currentTime: predicted, sentAtMs: now, playbackRate: rate + correction };
            }
            incoming = next;
            return anchor;
        },
    };
}
