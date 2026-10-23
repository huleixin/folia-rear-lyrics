import { describe, expect, it, vi } from 'vitest';
import { PlayerState } from '../../../src/types';
import { createRearClockPublisher } from '../../../src/services/rearPlaybackClock';
import { resolveObsBrowserSourceClockTime } from '../../../src/utils/obsBrowserSource';
import type { ObsBrowserSourceClock } from '../../../src/types/obsBrowserSource';

// test/unit/services/rearPlaybackClock.test.ts
const clock = (sentAtMs = 1000): ObsBrowserSourceClock => ({ currentTime: 10, sentAtMs,
    duration: 240, playerState: PlayerState.PLAYING, playbackRate: 1, lyricOffsetMs: 200 });

describe('rear publication independent of main-window animation frames', () => {
    it('uses live audio even when the main-window MotionValue stays frozen', () => {
        const publisher = createRearClockPublisher();
        const first = publisher.sample(clock(), 'track-a', { currentTime: 50, playbackRate: 1.5, advancing: true });
        const next = publisher.sample(clock(1100), 'track-a', { currentTime: 50.15, playbackRate: 1.5, advancing: true });
        expect(first.currentTime).toBe(50);
        expect(next.currentTime).toBe(50.15);
        expect(next.playbackRate).toBe(1.5);
        expect(next.lyricOffsetMs).toBe(200);
        expect(next.sentAtMs).toBe(1100);
    });
    it('does not make an unchanged fallback position look freshly sampled', () => {
        const publisher = createRearClockPublisher();
        publisher.sample(clock(), 'track-a', null);
        const repeated = publisher.sample(clock(1400), 'track-a', null);
        expect(resolveObsBrowserSourceClockTime(repeated, 1400)).toBeCloseTo(10.2);
        expect(repeated.sentAtMs).toBe(1000);
        expect(publisher.sample(clock(1500), 'track-b', null).sentAtMs).toBe(1500);
    });
    it('holds buffering audio instead of extrapolating and snapping back', () => {
        const sample = createRearClockPublisher().sample(clock(), 'track-a', {
            currentTime: 20, playbackRate: 1, advancing: false,
        });
        expect(sample.playerState).toBe(PlayerState.PAUSED);
        expect(resolveObsBrowserSourceClockTime(sample, 5000)).toBeCloseTo(19.8);
    });
    it('keeps an explicitly paused source paused', () => {
        const sample = createRearClockPublisher().sample({ ...clock(), playerState: PlayerState.PAUSED }, 'a', {
            currentTime: 30, playbackRate: 1, advancing: true,
        });
        expect(sample.playerState).toBe(PlayerState.PAUSED);
    });
    it('marks small real seeks and detaches listeners when replacing or disposing a deck', () => {
        const publisher = createRearClockPublisher();
        const deck = new EventTarget() as HTMLAudioElement;
        const nextDeck = new EventTarget() as HTMLAudioElement;
        const remove = vi.spyOn(deck, 'removeEventListener');
        const read = (media: HTMLAudioElement, currentTime = 20) =>
            publisher.sample(clock(), 'track-a', { media, currentTime, playbackRate: 1, advancing: true });
        const before = read(deck);
        deck.dispatchEvent(new Event('seeking'));
        const sought = read(deck, 19.98);
        expect(sought.discontinuity).not.toBe(before.discontinuity);
        const replaced = read(nextDeck);
        expect(remove).toHaveBeenCalledTimes(2);
        deck.dispatchEvent(new Event('seeking'));
        expect(read(nextDeck).discontinuity).toBe(replaced.discontinuity);
        const removeNext = vi.spyOn(nextDeck, 'removeEventListener');
        publisher.dispose();
        expect(removeNext).toHaveBeenCalledTimes(2);
    });
    it('marks a media reload even if the visible track identity stays unchanged', () => {
        const publisher = createRearClockPublisher();
        const media = new EventTarget() as HTMLAudioElement;
        const live = { media, currentTime: 10, playbackRate: 1, advancing: true };
        const before = publisher.sample(clock(), 'a', live);
        media.dispatchEvent(new Event('emptied'));
        expect(publisher.sample(clock(), 'a', live).discontinuity).not.toBe(before.discontinuity);
        publisher.dispose();
    });
});
