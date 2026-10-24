import { describe, expect, it } from 'vitest';
import { fitRearCurrentLine, resolveRearSafeLeft } from '../../../src/utils/rearCameraSafeArea';

// test/unit/visualizer/rearCameraSafeArea.test.ts
describe('rear current-line projection', () => {
    it('converts physical camera width by viewport ratio, independently of devicePixelRatio', () => {
        expect(resolveRearSafeLeft(347)).toBeCloseTo(98.485, 2);
        expect(resolveRearSafeLeft(904, 277, 976)).toBeCloseTo(256.566, 2);
        expect(resolveRearSafeLeft(347, NaN, 0)).toBe(resolveRearSafeLeft(347));
    });
    it('keeps the whole sentence inside the reading region at several frame scales and positions', () => {
        for (const width of [329, 347, 904]) {
            const height = width * 596 / 976;
            const safe = { left: resolveRearSafeLeft(width) + 5, top: 5,
                width: width - resolveRearSafeLeft(width) - 10, height: height - 10 };
            for (const left of [-500, 0, 90, 500]) for (const scale of [.2, 1, 3]) {
                const fit = fitRearCurrentLine({ left, top: -90, width: 500 * scale, height: 130 * scale }, safe);
                expect(fit.left).toBeGreaterThanOrEqual(safe.left - .001);
                expect(fit.top).toBeGreaterThanOrEqual(safe.top - .001);
                expect(fit.left + fit.width).toBeLessThanOrEqual(safe.left + safe.width + .001);
                expect(fit.top + fit.height).toBeLessThanOrEqual(safe.top + safe.height + .001);
                expect(fit.width / fit.height).toBeCloseTo(500 / 130);
            }
        }
    });
});
