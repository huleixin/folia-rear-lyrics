import { describe, expect, it } from 'vitest';
import { PlayerState } from '../../../src/types';
import type { RearLyricsClock } from '../../../src/types/rearLyricsClock';
import { createRearClockSynchronizer } from '../../../src/utils/rearLyricsClock';
import { resolveObsBrowserSourceClockTime as position } from '../../../src/utils/obsBrowserSource';

// test/unit/visualizer/rearLyricsClock.test.ts
const clock = (patch: Partial<RearLyricsClock> = {}): RearLyricsClock => ({ currentTime: 10, duration: 240,
    sentAtMs: 1000, playerState: PlayerState.PLAYING, playbackRate: 1,
    timelineId: 'a', discontinuity: 'session:0', ...patch });

describe('rear lyric clock continuity', () => {
    it('reproduces backwards motion with raw packets but never with corrected 60 fps output', () => {
        const sync = createRearClockSynchronizer();
        let stable = sync.accept(clock(), 1000);
        let raw = clock(), lastFrame = 10, rawBacksteps = 0;
        for (let frame = 1; frame <= 600; frame++) {
            const now = 1000 + frame * 1000 / 60;
            if (frame % 6 === 0) {
                const before = position(stable, now);
                const next = clock({ sentAtMs: now, currentTime: 10 + (now - 1000) / 1000
                    + (frame % 12 === 0 ? -0.06 : 0.06) });
                if (position(next, now) < position(raw, now)) rawBacksteps++;
                raw = next; stable = sync.accept(next, now);
                expect(position(stable, now)).toBeCloseTo(before, 8);
            }
            const nextFrame = position(stable, now);
            expect(nextFrame).toBeGreaterThanOrEqual(lastFrame);
            lastFrame = nextFrame;
        }
        expect(rawBacksteps).toBeGreaterThan(30);
        expect(lastFrame).toBeCloseTo(20, 1);
    });
    it('preserves the anchor for repeated or older packets', () => {
        const sync = createRearClockSynchronizer();
        const raw = clock();
        const anchor = sync.accept(raw, 1000);
        expect(sync.accept({ ...raw }, 2000)).toBe(anchor);
        expect(sync.accept(clock({ sentAtMs: 900, currentTime: 9 }), 2100)).toBe(anchor);
        expect(position(anchor, 2100)).toBeCloseTo(11.1);
    });
    it.each([2, 9.98, 80])('immediately honors a real seek to %s, including a tiny backwards seek', target => {
        const sync = createRearClockSynchronizer();
        sync.accept(clock(), 1000);
        const sought = sync.accept(clock({ currentTime: target, discontinuity: 'session:1', sentAtMs: 1010 }), 1010);
        expect(position(sought, 1010)).toBe(target);
    });
    it('switches tracks even when their positions are only milliseconds apart', () => {
        const sync = createRearClockSynchronizer();
        sync.accept(clock(), 1000);
        const changed = sync.accept(clock({ currentTime: 9.99, timelineId: 'b', sentAtMs: 1010 }), 1010);
        expect(position(changed, 1010)).toBe(9.99);
    });
    it('still accepts a large unmarked seek from an older publisher', () => {
        const sync = createRearClockSynchronizer();
        sync.accept(clock(), 1000);
        expect(position(sync.accept(clock({ currentTime: 2, sentAtMs: 1100 }), 1100), 1100)).toBe(2);
    });
    it('pauses without drift and resumes from the exact media position', () => {
        const sync = createRearClockSynchronizer();
        sync.accept(clock(), 1000);
        const paused = sync.accept(clock({ currentTime: 10.05, sentAtMs: 1100, playerState: PlayerState.PAUSED }), 1100);
        expect(position(paused, 5000)).toBe(10.05);
        const resumed = sync.accept(clock({ currentTime: 10.05, sentAtMs: 5000 }), 5000);
        expect(position(resumed, 6000)).toBeCloseTo(11.05);
    });
    it('preserves actual playback rate changes and does not confuse slewing with such changes', () => {
        const sync = createRearClockSynchronizer();
        sync.accept(clock(), 1000);
        const slow = sync.accept(clock({ currentTime: 10.05, sentAtMs: 1100 }), 1100);
        expect(slow.playbackRate).toBeLessThan(1);
        const before = position(slow, 1200);
        const next = sync.accept(clock({ currentTime: 10.2, sentAtMs: 1200 }), 1200);
        expect(position(next, 1200)).toBeCloseTo(before, 8);
        const faster = sync.accept(clock({ currentTime: 10.3, sentAtMs: 1300, playbackRate: 2 }), 1300);
        expect(position(faster, 2300)).toBeCloseTo(12.3);
    });
    it('preserves lyric offset and clamps the extrapolated position at song end', () => {
        const sync = createRearClockSynchronizer();
        const value = sync.accept(clock({ lyricOffsetMs: 300, duration: 10.2 }), 1000);
        expect(position(value, 1000)).toBeCloseTo(9.7);
        expect(position(value, 5000)).toBeCloseTo(9.9);
    });
});
