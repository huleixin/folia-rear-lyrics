import { describe, expect, it } from 'vitest';
import { DEFAULT_PENDOLO_TUNING } from '@/types';
import { resolveRearReadingBox } from '@/utils/visualizerSurface';
import { resolvePendoloRearLayout } from '@/components/visualizer/pendolo/pendoloRearLayout';
import {
    resolveClockworkReach,
    resolvePendoloClockworkBox,
} from '@/components/visualizer/pendolo/pendoloClockworkScene';
import { calculatePendoloWheelLayout } from '@/components/visualizer/pendolo/pendoloGeometry';

// test/unit/visualizer/pendoloRearLayout.test.ts
describe('Pendolo rear clockwork placement', () => {
    for (const [width, height] of [
        [329, 208],
        [347, 212],
        [393, 249],
    ]) {
        for (const showCenterGradient of [true, false]) {
            it(`keeps the entire assembly on ${width}×${height}, gradient=${showCenterGradient}`, () => {
                const safe = resolveRearReadingBox(width, height);
                const layout = resolvePendoloRearLayout(width, height, safe, {
                    ...DEFAULT_PENDOLO_TUNING,
                    showCenterGradient,
                });
                const { centerX, centerY, baseRadius, lyricRadiusOffset } = layout;
                const reach = resolveClockworkReach(baseRadius, showCenterGradient);
                // The left half crosses the camera boundary, but no part crosses the physical panel edge.
                expect(centerX - baseRadius).toBeLessThan(safe.left);
                expect(centerX).toBeGreaterThanOrEqual(safe.left);
                expect(centerX - reach).toBeGreaterThanOrEqual(0);
                expect(centerY - reach).toBeGreaterThanOrEqual(0);
                expect(centerX + reach).toBeLessThanOrEqual(width);
                expect(centerY + reach).toBeLessThanOrEqual(height);
                const canvas = resolvePendoloClockworkBox(
                    centerX,
                    centerY,
                    baseRadius,
                    baseRadius + lyricRadiusOffset,
                    width,
                    height,
                    showCenterGradient
                );
                expect(canvas.left + canvas.width).toBeLessThanOrEqual(width);
                expect(canvas.top + canvas.height).toBeLessThanOrEqual(height);
                expect(layout.lyricX).toBeGreaterThan(safe.left);
                expect(layout.lyricX + layout.textWidth).toBeLessThanOrEqual(safe.left + safe.width);
                const [focal] = calculatePendoloWheelLayout(
                    [{ fullText: 'lyric', startTime: 0, endTime: 8, words: [] }],
                    0,
                    0,
                    width,
                    height,
                    layout.tuning,
                    lyricRadiusOffset
                );
                expect(focal?.x).toBeCloseTo(layout.lyricX);
                expect(focal?.y).toBeCloseTo(centerY);
            });
        }
    }
});
