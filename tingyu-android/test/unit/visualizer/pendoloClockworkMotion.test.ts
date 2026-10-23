import { describe, expect, it } from 'vitest';
import {
    createPendoloClockworkMotionState,
    normalizePendoloBass,
    stepPendoloClockworkMotion,
} from '@/components/visualizer/pendolo/pendoloClockworkMotion';
import { resolvePendoloMotionProfile } from '@/components/visualizer/pendolo/pendoloMotionProfile';
import { resolvePendoloClockworkAnchors } from '@/components/visualizer/pendolo/pendoloClockworkScene';
import { buildPendoloClockworkCachedScene } from '@/components/visualizer/pendolo/pendoloClockworkMeshes';

// test/unit/visualizer/pendoloClockworkMotion.test.ts

describe('Pendolo clockwork motion', () => {
    it('normalizes byte-scale and unit-scale bass into 0..1', () => {
        expect(normalizePendoloBass(0.4)).toBeCloseTo(0.4);
        expect(normalizePendoloBass(128)).toBeCloseTo(128 / 255);
        expect(normalizePendoloBass(-1)).toBe(0);
        expect(normalizePendoloBass(300)).toBe(1);
    });

    it('advances phase while playing and freezes while paused', () => {
        const profile = resolvePendoloMotionProfile('normal');
        const playing = createPendoloClockworkMotionState();
        const paused = createPendoloClockworkMotionState();

        const played = stepPendoloClockworkMotion(playing, 0.1, 0.5, false, profile);
        stepPendoloClockworkMotion(paused, 0.1, 0.5, true, profile);

        expect(played.phase).toBeGreaterThan(0);
        expect(paused.phase).toBe(0);
        expect(paused.secondGearAngle).toBe(0);
    });

    it('steps the seconds gear toward discrete tooth targets over time', () => {
        const profile = resolvePendoloMotionProfile('normal');
        const state = createPendoloClockworkMotionState();

        for (let i = 0; i < 40; i++) {
            stepPendoloClockworkMotion(state, 0.05, 0.3, false, profile);
        }

        expect(state.secondGearStep).toBeGreaterThanOrEqual(1);
        expect(state.secondGearAngle).toBeGreaterThan(0);
    });
});

describe('Pendolo clockwork scene/mesh', () => {
    it('resolves shared gear anchors from layout', () => {
        const anchors = resolvePendoloClockworkAnchors({
            centerX: 100,
            centerY: 200,
            baseRadius: 120,
            lyricRingRadius: 300,
        });
        expect(anchors.balanceCx).toBeCloseTo(100 + 120 * 0.2);
        expect(anchors.balanceCy).toBeCloseTo(200 - 120 * 0.75);
        expect(anchors.coverRadius).toBeCloseTo(120 * 0.88);
        expect(anchors.focalAxisEndRadius).toBeLessThan(300);
    });

    it('builds a non-empty mesh for full decor and empty for none', () => {
        const base = {
            centerX: 400,
            centerY: 300,
            baseRadius: 160,
            lyricRingRadius: 420,
            escapementAngle: 0.2,
            phase: 1.1,
            bassOscillation: 0.05,
            secondGearAngle: 0.3,
            primaryTextColor: '#ffffff',
            accentTextColor: '#ffcc66',
            backgroundColor: '#000000',
            showCenterGradient: true,
            showCover: false,
            coverImage: null,
        };

        const empty = buildPendoloClockworkCachedScene({ ...base, showGearDecor: 'none' });
        expect(empty.parts).toHaveLength(0);
        expect(empty.vertexCount).toBe(0);

        const full = buildPendoloClockworkCachedScene({ ...base, showGearDecor: 'full' });
        expect(full.parts.length).toBeGreaterThan(8);
        expect(full.parts.length).toBeLessThanOrEqual(32);
        expect(full.vertexCount).toBeGreaterThan(1000);
        expect(full.key).toBe(buildPendoloClockworkCachedScene({ ...base, showGearDecor: 'full' }).key);
    });
});
