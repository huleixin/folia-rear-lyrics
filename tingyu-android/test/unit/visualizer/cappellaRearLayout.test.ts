import { describe, it, expect } from 'vitest';
import { fitCappellaRearFont, resolveCappellaRearBudget, resolveCappellaRearMotion } from '../../../src/components/visualizer/cappella/cappellaRearLayout';
import { getCappellaIntensityConfig } from '../../../src/components/visualizer/cappella/cappellaIntensity';

// test/unit/visualizer/cappellaRearLayout.test.ts
describe('rear cappella bubble containment', () => {
    it('includes padding and borders in the safe width for every theme intensity', () => {
        for (const width of [220, 238, 620]) for (const intensity of ['calm','normal','chaotic'] as const) {
            const motion = getCappellaIntensityConfig(intensity).motion;
            const budget = resolveCappellaRearBudget({ width, height: 202 }, motion.activePaddingX, motion.activePaddingY);
            expect(budget.maxTextWidth + motion.activePaddingX * 2 + 2).toBe(width - 12);
            expect(budget.maxHeight).toBe(190);
        }
    });
    it('does not expand a full-width row into the lens band or off the right edge', () => {
        const original = getCappellaIntensityConfig('chaotic').motion;
        const motion = resolveCappellaRearMotion(original);
        expect(motion.activeScale).toBe(1);
        expect(motion.rowEnterScale).toBe(1);
        expect(original.activeScale).toBeGreaterThan(1);
    });
    it('retains the preferred font when it fits and fits excessive height with uniform font sizing', () => {
        expect(fitCappellaRearFont(24, 190, font => font * 4)).toBe(24);
        const font = fitCappellaRearFont(48, 190, value => value * 6);
        expect(font * 6).toBeLessThanOrEqual(190);
        expect(font).toBeGreaterThan(30);
    });
});
