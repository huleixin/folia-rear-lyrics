import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRearReadingBox, getVisualizerSurface, getVisualizerViewportWidth, getVisualizerPaintBounds,
    prepareVisualizerCanvas, resolveRearReadingBox, resolveVisualizerCssSize, resolveVisualizerDimension } from '../../../src/utils/visualizerSurface';

// test/unit/visualizer/visualizerSurface.test.ts
// One reading box owns placement; inside it every renderer works in local coordinates.
afterEach(() => vi.unstubAllGlobals());
function rear(width = 904, height = 572, surface = 'rear-lyrics-panel') {
    vi.stubGlobal('document', { documentElement: { clientWidth: width, clientHeight: height, dataset: { foliaSurface: surface } } });
    vi.stubGlobal('window', { innerWidth: width, innerHeight: height, devicePixelRatio: 1.625 });
}
describe('rear reading box', () => {
    it('places the box right of the camera and above the transport controls', () => {
        const box = resolveRearReadingBox(904, 572);
        expect(box.left).toBe(904 * .37);
        expect(box.left + box.width).toBeCloseTo(904 * .97);
        expect(box.top).toBeCloseTo(572 * .03);
        expect(box.height).toBeCloseTo(572 * .94);
    });
    it('exposes a zero-origin local surface of exactly the box size', () => {
        rear();
        const box = getRearReadingBox()!;
        const surface = getVisualizerSurface()!;
        expect(surface.left).toBe(0);
        expect(surface.top).toBe(0);
        expect(surface.width).toBe(box.width);
        expect(surface.height).toBe(box.height);
        expect(getVisualizerViewportWidth()).toBe(box.width);
        expect(resolveVisualizerCssSize('6vw')).toBe(`${6 * box.width / 100}px`);
    });
    it('leaves the normal player, OBS and wallpaper documents untouched', () => {
        rear(904, 572, 'rear-lyrics');
        expect(getVisualizerSurface()).toBeNull();
        expect(getRearReadingBox()).toBeNull();
        expect(getVisualizerViewportWidth()).toBe(904);
        expect(resolveVisualizerCssSize('6vw')).toBe('6vw');
        expect(resolveVisualizerDimension(180, 320)).toBe(320);
    });
    it('sizes a canvas bitmap to its local CSS box so it cannot be stretched', () => {
        rear(329, 208);
        const surface = getVisualizerSurface()!;
        const canvas = { width: 0, height: 0, style: {} } as HTMLCanvasElement;
        const context = { setTransform: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
        prepareVisualizerCanvas(canvas, context, surface.width, surface.height);
        expect(canvas.width).toBe(Math.floor(surface.width * 1.625));
        expect(canvas.height).toBe(Math.floor(surface.height * 1.625));
        expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, surface.width, surface.height);
        expect(context.setTransform).toHaveBeenLastCalledWith(1.625, 0, 0, 1.625, 0, 0);
        expect(getVisualizerPaintBounds(surface.width, surface.height))
            .toEqual({ width: surface.width, height: surface.height, offsetX: 0, offsetY: 0 });
        expect(resolveVisualizerDimension(180, 320)).toBe(180);
    });
    it('recomputes after a rear viewport resize', () => {
        rear(556, 352); const previous = getRearReadingBox();
        rear(904, 572); expect(getRearReadingBox()).not.toBe(previous);
        expect(getRearReadingBox()!.left).toBe(904 * .37);
    });
});
