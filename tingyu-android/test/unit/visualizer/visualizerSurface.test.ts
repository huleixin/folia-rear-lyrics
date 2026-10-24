import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVisualizerSurface, getVisualizerViewportWidth, getVisualizerViewportHeight, getVisualizerPaintBounds,
    prepareVisualizerCanvas, resolveRearReadingSurface, resolveVisualizerCssSize, resolveVisualizerDimension } from '../../../src/utils/visualizerSurface';

// test/unit/visualizer/visualizerSurface.test.ts
// The wallpaper is full-panel. Lyric layout, canvas and CSS all share one local reading rectangle.
afterEach(() => vi.unstubAllGlobals());
function rear(width = 904, height = 572, surface = 'rear-lyrics-panel') {
    vi.stubGlobal('document', { documentElement: { clientWidth: width, clientHeight: height, dataset: { foliaSurface: surface } } });
    vi.stubGlobal('window', { innerWidth: width, innerHeight: height, devicePixelRatio: 1.625 });
}
describe('rear lyric coordinate contract', () => {
    it.each([[904, 572], [556, 352], [430, 272], [393, 249], [360, 228]])('keeps lyrics and subtitles above real control bounds at %dx%d', (width, height) => {
        const surface = resolveRearReadingSurface(width, height);
        const controlsTop = height - Math.max(18, height * .08) - 66;
        expect(surface.left).toBeGreaterThanOrEqual(width * .37);
        expect(surface.left + surface.width).toBeLessThan(width);
        expect(surface.top).toBeGreaterThan(0);
        expect(surface.lyricHeight).toBeGreaterThan(0);
        expect(surface.lyricHeight + 8 + surface.subtitleHeight).toBeCloseTo(surface.height);
        expect(surface.top + surface.height).toBeLessThanOrEqual(controlsTop - 12);
        expect(surface.paintWidth).toBe(width);
        expect(surface.paintHeight).toBe(height);
    });
    it('uses local width and body height for all viewport units', () => {
        rear(); const surface = getVisualizerSurface()!;
        expect(getVisualizerViewportWidth()).toBe(surface.width);
        expect(getVisualizerViewportHeight()).toBe(surface.lyricHeight);
        expect(resolveVisualizerCssSize('6vw')).toBe(`${6 * surface.width / 100}px`);
        expect(resolveVisualizerCssSize('70vh')).toBe(`${70 * surface.lyricHeight / 100}px`);
        expect(resolveVisualizerCssSize('10vmin')).toBe(`${Math.min(surface.width, surface.lyricHeight) / 10}px`);
    });
    it('removes Pixi minimum floors only inside the rear panel', () => {
        rear(); expect(resolveVisualizerDimension(180, 320)).toBe(180);
        expect(resolveVisualizerDimension(105, 240)).toBe(105);
        expect(resolveVisualizerDimension(0, 320)).toBe(1);
        rear(904, 572, 'rear-lyrics');
        expect(resolveVisualizerDimension(180, 320)).toBe(320);
        expect(getVisualizerSurface()).toBeNull();
        expect(getVisualizerViewportWidth()).toBe(904);
        expect(resolveVisualizerCssSize('6vw')).toBe('6vw');
    });
    it('has equal bitmap/CSS aspect ratios and no second offset at fractional DPR', () => {
        rear(); const surface = getVisualizerSurface()!;
        const canvas = { width: 0, height: 0, style: {} } as HTMLCanvasElement;
        const context = { setTransform: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
        prepareVisualizerCanvas(canvas, context, surface.width, surface.lyricHeight);
        prepareVisualizerCanvas(canvas, context, surface.width, surface.lyricHeight);
        expect(canvas.width).toBe(Math.floor(surface.width * 1.625));
        expect(canvas.height).toBe(Math.floor(surface.lyricHeight * 1.625));
        expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, surface.width, surface.lyricHeight);
        expect(context.setTransform).toHaveBeenLastCalledWith(1.625, 0, 0, 1.625, 0, 0);
        expect(canvas.style.left).toBe('0px');
        expect(Number.parseFloat(canvas.style.width)).toBe(surface.width);
        expect(getVisualizerPaintBounds(surface.width, surface.lyricHeight)).toEqual({ width: surface.width, height: surface.lyricHeight, offsetX: 0, offsetY: 0 });
    });
    it('recomputes after a rear viewport resize without using main-screen dimensions', () => {
        rear(556, 352); const previous = getVisualizerSurface();
        rear(904, 572); expect(getVisualizerSurface()).not.toBe(previous);
        expect(getVisualizerSurface()?.paintWidth).toBe(904);
    });
});
