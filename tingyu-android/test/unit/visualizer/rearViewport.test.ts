import { describe, expect, it } from 'vitest';
import { resolveRearViewport } from '../../../src/utils/rearViewport';

// test/unit/visualizer/rearViewport.test.ts
describe('rear visible viewport, not the retained main-screen layout', () => {
    it('keeps the normal full rear frame unchanged', () => {
        expect(resolveRearViewport({ width: 556, height: 352 })).toEqual({ left: 0, top: 0, width: 556, height: 352 });
    });
    it('uses the top visual viewport when the layout is larger on both axes', () => {
        expect(resolveRearViewport({ width: 700, height: 500 },
            { width: 556, height: 352, offsetLeft: 0, offsetTop: 0 }))
            .toEqual({ left: 0, top: 0, width: 556, height: 352 });
    });
    it('accounts for a native view retaining a larger task after migration', () => {
        const rect = resolveRearViewport({ width: 700, height: 500 }, null,
            { width: 1137.5, height: 812.5, visibleLeft: 0, visibleTop: 0, visibleWidth: 904, visibleHeight: 572 });
        expect(rect.width).toBeCloseTo(904 / 1.625);
        expect(rect.height).toBeCloseTo(572 / 1.625);
        // The right reading edge and the entire progress row now belong to the physical rear area.
        expect(rect.width * .97).toBeLessThan(904 / 1.625);
        expect(rect.height * .92).toBeLessThan(572 / 1.625);
    });
    it('includes visible-origin offsets exactly once', () => {
        expect(resolveRearViewport({ width: 800, height: 600 },
            { width: 600, height: 400, offsetLeft: 10, offsetTop: 5 },
            { width: 900, height: 600, visibleLeft: 30, visibleTop: 15, visibleWidth: 840, visibleHeight: 555 }))
            .toEqual({ left: 30, top: 15, width: 560, height: 370 });
    });
    it('ignores unready and invalid native snapshots rather than blanking the lyrics', () => {
        const layout = { width: 556, height: 352 };
        expect(resolveRearViewport(layout, null, {} as never)).toEqual(resolveRearViewport(layout));
        expect(resolveRearViewport(layout, null, { width: 0, height: 0, visibleLeft: 0, visibleTop: 0, visibleWidth: 0, visibleHeight: 0 }))
            .toEqual(resolveRearViewport(layout));
    });
});
