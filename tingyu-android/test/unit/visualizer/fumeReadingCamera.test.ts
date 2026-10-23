import { describe, expect, it } from 'vitest';
import type { FumeBlock } from '../../../src/components/visualizer/fume/fumeTypes';
import { resolveFumeReadingCamera } from '../../../src/components/visualizer/fume/fumeReadingCamera';

// test/unit/visualizer/fumeReadingCamera.test.ts
// The whole resting print row, not just the latest letter, must fit inside the rear reading rectangle.
const block = { x: 800, y: 400, lineHeight: 48, renderLines: [
    { left: 10, top: 0, width: 600, start: 0, end: 8 },
    { left: 15, top: 48, width: 380, start: 8, end: 15 },
] } as unknown as FumeBlock;
describe('Fume rear reading target', () => {
    it.each([4, 7.9, 10, 15])('keeps the full active row readable at progress %s', progress => {
        const viewport = { width: 333.6, height: 352 };
        const target = resolveFumeReadingCamera(block, progress, viewport)!;
        const row = block.renderLines.find(value => progress <= value.end)!;
        const projectedLeft = viewport.width / 2 + (block.x + row.left - target.x) * target.scale;
        const projectedRight = projectedLeft + row.width * target.scale;
        expect(projectedLeft).toBeGreaterThan(0);
        expect(projectedRight).toBeLessThan(viewport.width);
    });
    it('does not chase a cursor off the end of the same reading row', () => {
        const viewport = { width: 333.6, height: 352 };
        expect(resolveFumeReadingCamera(block, 1, viewport)).toEqual(resolveFumeReadingCamera(block, 7, viewport));
    });
    it('fits a long print row in the 321 CSS-pixel high-density viewport reported by the phone', () => {
        const viewport = { width: 321 * .60, height: 203 };
        const long = { ...block, renderLines: [{ ...block.renderLines[0], width: 1800, end: 15 }] };
        const target = resolveFumeReadingCamera(long, 10, viewport)!;
        expect(target.scale).toBeGreaterThan(0);
        expect(1800 * target.scale).toBeLessThan(viewport.width);
    });
});
