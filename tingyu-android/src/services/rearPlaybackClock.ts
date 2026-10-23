import { PlayerState } from '../types';
import type { ObsBrowserSourceClock } from '../types/obsBrowserSource';
import type { RearLyricsClock, RearPlaybackClockSample } from '../types/rearLyricsClock';

// src/services/rearPlaybackClock.ts
/** Publish the media clock, not a main-window animation frame with a new timestamp. */
export function createRearClockPublisher() {
    const session = `${Date.now()}-${Math.random()}`;
    let revision = 0;
    let media: HTMLAudioElement | null = null;
    let previous: RearLyricsClock | null = null;
    const invalidate = () => { revision += 1; };
    const detach = () => {
        media?.removeEventListener('seeking', invalidate);
        media?.removeEventListener('emptied', invalidate);
    };
    return {
        sample(base: ObsBrowserSourceClock, timelineId: string, live: RearPlaybackClockSample | null): RearLyricsClock {
            const nextMedia = live?.media ?? null;
            if (media !== nextMedia) {
                detach(); media = nextMedia; invalidate();
                media?.addEventListener('seeking', invalidate);
                media?.addEventListener('emptied', invalidate);
            }
            const next: RearLyricsClock = {
                ...base, timelineId, discontinuity: `${session}:${revision}`,
                ...(live ? {
                    currentTime: live.currentTime,
                    playbackRate: live.playbackRate,
                    playerState: base.playerState === PlayerState.PLAYING && !live.advancing
                        ? PlayerState.PAUSED : base.playerState,
                } : {}),
            };
            // A fallback MotionValue can freeze when the main WebView is backgrounded.
            // Repeating its timestamp would pull the rear playhead backwards every 100 ms.
            if (!live && previous && previous.timelineId === timelineId
                && previous.discontinuity === next.discontinuity
                && previous.currentTime === next.currentTime
                && previous.playerState === next.playerState && previous.playbackRate === next.playbackRate) {
                next.sentAtMs = previous.sentAtMs;
            }
            previous = next;
            return next;
        },
        dispose: detach,
    };
}
