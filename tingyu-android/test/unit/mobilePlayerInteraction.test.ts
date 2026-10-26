// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { resolveMiniSwipe } from '../../src/library/suites/mobile/useMiniPlayerSwipe';
import { resolveStageRenderRatio } from '../../src/utils/stageRenderBudget';

// test/unit/mobilePlayerInteraction.test.ts
vi.mock('../../src/utils/platform', () => ({ isAndroidNativeRuntime: () => true }));
afterEach(() => { delete document.documentElement.dataset.foliaSurface; });
describe('mini-player gesture intent', () => {
    it('requires distance or a deliberate flick and respects queue boundaries', () => {
        expect(resolveMiniSwipe(-80, 0, 280, true, true)).toBe('next');
        expect(resolveMiniSwipe(80, 0, 280, true, true)).toBe('previous');
        expect(resolveMiniSwipe(-10, -2, 280, true, true)).toBeNull();
        expect(resolveMiniSwipe(-30, -0.7, 280, true, true)).toBe('next');
        expect(resolveMiniSwipe(-30, 0.7, 280, true, true)).toBeNull();
        expect(resolveMiniSwipe(-120, -1, 280, false, true)).toBeNull();
        expect(resolveMiniSwipe(120, 1, 280, true, false)).toBeNull();
    });
});
describe('phone raster budget', () => {
    it('caps dense main canvases without enlarging low-quality choices', () => {
        expect(resolveStageRenderRatio(3)).toBe(1.5);
        expect(resolveStageRenderRatio(1.25)).toBe(1.25);
        expect(resolveStageRenderRatio(0.75, 0.75)).toBe(0.75);
        expect(resolveStageRenderRatio(NaN)).toBe(1);
    });
    it('retains the accepted rear renderer resolution', () => {
        document.documentElement.dataset.foliaSurface = 'rear-lyrics-panel';
        expect(resolveStageRenderRatio(3)).toBe(2);
        expect(resolveStageRenderRatio(3, 3)).toBe(3);
    });
});
