import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVisualizerSurface, getVisualizerViewportWidth, getVisualizerPaintBounds, prepareVisualizerCanvas,
    resolveRearReadingSurface, resolveVisualizerCssSize } from '../../../src/utils/visualizerSurface';

// test/unit/visualizer/visualizerSurface.test.ts
// Layout avoids the camera, but neither DOM overflow nor canvas bitmap bounds end at that boundary.
afterEach(() => vi.unstubAllGlobals());
function rear(width = 904, height = 572, surface = 'rear-lyrics-panel') {
    vi.stubGlobal('document', { documentElement: { clientWidth: width, clientHeight: height, dataset: { foliaSurface: surface } } });
    vi.stubGlobal('window', { innerWidth: width, innerHeight: height, devicePixelRatio: 1.625 });
}
describe('independent reading and paint bounds', () => {
    it('reserves a right edge margin without moving the full paint origin', () => {
        const surface = resolveRearReadingSurface(904, 572);
        expect(surface.left).toBe(904 * .37);
        expect(surface.left + surface.width).toBeCloseTo(904 * .97);
        expect(surface.paintWidth).toBe(904);
    });
    it('uses the reading width for text layout, not the whole rear display width', () => {
        rear();
        expect(getVisualizerViewportWidth()).toBe(904 * .60);
        expect(getVisualizerPaintBounds(904 * .60, 572).width).toBe(904);
        expect(resolveVisualizerCssSize('6vw')).toBe(`${6 * (904 * .60) / 100}px`);
    });
    it('does not alter the normal player, OBS or wallpaper document', () => {
        rear(904, 572, 'rear-lyrics');
        expect(getVisualizerSurface()).toBeNull();
        expect(getVisualizerViewportWidth()).toBe(904);
        expect(resolveVisualizerCssSize('6vw')).toBe('6vw');
        expect(getVisualizerPaintBounds(570, 572)).toEqual({ width: 570, height: 572, offsetX: 0, offsetY: 0 });
    });
    it('clears the full canvas and applies the right reading offset exactly once', () => {
        rear();
        const canvas = { width: 0, height: 0, style: {} } as HTMLCanvasElement;
        const context = { setTransform: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
        prepareVisualizerCanvas(canvas, context, 904 * .60, 572);
        prepareVisualizerCanvas(canvas, context, 904 * .60, 572);
        expect(canvas.width).toBe(Math.floor(904 * 1.625));
        expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 904, 572);
        expect(context.setTransform).toHaveBeenLastCalledWith(1.625, 0, 0, 1.625, 904 * .37 * 1.625, 0);
        expect(canvas.style.left).toBe(`${-904 * .37}px`);
    });
    it('updates from the rear screen dimensions rather than any main-screen orientation state', () => {
        rear(556, 352);
        expect(getVisualizerSurface()?.paintWidth).toBe(556);
        expect(getVisualizerSurface()?.width).toBe(556 * .60);
        rear(904, 572);
        expect(getVisualizerSurface()?.paintWidth).toBe(904);
    });
});
