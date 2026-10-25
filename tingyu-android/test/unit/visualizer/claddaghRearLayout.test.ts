import { describe, expect, it } from 'vitest';
import { resolveCladdaghRearAxis, resolveCladdaghRearOrbit } from '@/components/visualizer/claddagh/claddaghRearLayout';

// test/unit/visualizer/claddaghRearLayout.test.ts
// Sweep the orbit, beat range and glyph corners. The pivot must stay identical to the axis midpoint.
describe('Claddagh fixed rear orbit', () => {
    const safe = { left: 104, top: 5, width: 238, height: 202 };
    const intensities = ['calm', 'normal', 'chaotic'] as const;
    for (const intensity of intensities) it.each([0, 45, 90])(`fits every phase and beat (${intensity}, %s degrees)`, tilt => {
        const glyphWidth = 24, glyphHeight = 30, focus = .65, stagger = 3.6;
        const fit = resolveCladdaghRearOrbit(safe, { radius: 90, ellipseTiltDeg: tilt, intensity,
            focusScaleRatio: focus, glyphRadius: Math.hypot(glyphWidth, glyphHeight) / 2, chorusStagger: stagger });
        const axis = resolveCladdaghRearAxis(safe, 90 - tilt);
        expect(fit.x).toBe(axis.x);expect(fit.y).toBe(axis.y);
        for (const power of [0, .5, 1]) for (let phase = 0; phase < 72; phase++) {
            const theta = phase * Math.PI / 36, depth = (Math.cos(theta) + 1) / 2;
            const radius = 90 * (1 + power * { calm: .08, normal: .25, chaotic: .95 }[intensity]);
            const rawX = Math.sin(theta) * radius * (.35 + .65 * depth ** 1.2);
            const rawY = Math.cos(theta) * radius * .09 + stagger;
            const angle = -tilt * Math.PI / 180;
            const cx = rawX * Math.cos(angle) - rawY * Math.sin(angle);
            const cy = rawX * Math.sin(angle) + rawY * Math.cos(angle);
            const scale = (.22 + .98 * depth ** 1.5) * (1 + focus);
            for (const rotation of [-38, 0, 38]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
                const a = rotation * Math.PI / 180, x = sx * glyphWidth / 2 * scale, y = sy * glyphHeight / 2 * scale;
                const px = fit.x + (cx + x * Math.cos(a) - y * Math.sin(a)) * fit.scale;
                const py = fit.y + (cy + x * Math.sin(a) + y * Math.cos(a)) * fit.scale;
                expect(px).toBeGreaterThanOrEqual(safe.left);expect(px).toBeLessThanOrEqual(safe.left + safe.width);
                expect(py).toBeGreaterThanOrEqual(safe.top);expect(py).toBeLessThanOrEqual(safe.top + safe.height);
            }
        }
    });
    it.each([0, 45, 90])('keeps the pulsing axis endpoints in the reading area (%s degrees)', angle => {
        const axis = resolveCladdaghRearAxis(safe, angle);
        for (const pulse of [1, axis.maxScaleX]) for (const sign of [-1, 1]) {
            const radians = angle * Math.PI / 180;
            const x = axis.x + sign * axis.width * pulse / 2 * Math.cos(radians);
            const y = axis.y + sign * axis.width * pulse / 2 * Math.sin(radians);
            expect(x).toBeGreaterThanOrEqual(safe.left);expect(x).toBeLessThanOrEqual(safe.left + safe.width);
            expect(y).toBeGreaterThanOrEqual(safe.top);expect(y).toBeLessThanOrEqual(safe.top + safe.height);
        }
    });
});
