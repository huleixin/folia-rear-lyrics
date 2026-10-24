import { describe, expect, it } from 'vitest';
import { fitCladdaghRearLine, type CladdaghRearGlyph } from '@/components/visualizer/claddagh/claddaghRearLayout';

// test/unit/visualizer/claddaghRearLayout.test.ts
// Check the corners of rotating, enlarged glyphs, rather than only their centre points.
describe('Claddagh rear current sentence', () => {
    const safe = { left: 104, top: 5, width: 238, height: 202 };
    it.each([-38, 0, 38])('keeps a diagonal orbit and enlarged glyphs inside the camera-safe area (%s degrees)', angle => {
        const glyphs: CladdaghRearGlyph[] = [-170, -80, 0, 80, 170].map(x => ({
            x, y: -x * .8, width: 24, height: 30, scale: 2, angle, opacity: 1,
        }));
        const fit = fitCladdaghRearLine(glyphs, safe);
        expect(fit.scale).toBeGreaterThan(0);
        expect(fit.scale).toBeLessThan(1);
        for (const glyph of glyphs) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            const radians = glyph.angle * Math.PI / 180;
            const x = sx * glyph.width / 2 * glyph.scale, y = sy * glyph.height / 2 * glyph.scale;
            const projectedX = fit.x + (glyph.x + x * Math.cos(radians) - y * Math.sin(radians)) * fit.scale;
            const projectedY = fit.y + (glyph.y + x * Math.sin(radians) + y * Math.cos(radians)) * fit.scale;
            expect(projectedX).toBeGreaterThanOrEqual(safe.left);
            expect(projectedX).toBeLessThanOrEqual(safe.left + safe.width);
            expect(projectedY).toBeGreaterThanOrEqual(safe.top);
            expect(projectedY).toBeLessThanOrEqual(safe.top + safe.height);
        }
    });
    it('centres short lyrics in the reading area without shrinking them or including invisible orbit glyphs', () => {
        const glyph: CladdaghRearGlyph = { x: 0, y: 0, width: 20, height: 24, scale: 1.6, angle: -38, opacity: 1 };
        const fit = fitCladdaghRearLine([glyph, { ...glyph, x: -800, opacity: 0 }], safe);
        expect(fit).toEqual({ x: 223, y: 106, scale: 1 });
        expect(fitCladdaghRearLine([], safe)).toEqual(fit);
    });
});
