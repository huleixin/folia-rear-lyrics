// src/utils/visualizerSurface.ts
// Background paints in the outer full-panel document; every lyric renderer uses local reading coordinates.
export function resolveRearReadingSurface(width: number, height: number) {
    const top = height * .045;
    // Reserve the existing touch controls even while hidden: revealing them must not move lyrics.
    const controlsTop = height - Math.max(18, height * .08) - 66;
    const readingHeight = Math.max(1, controlsTop - top - 12);
    const subtitleHeight = Math.min(72, Math.max(32, height * .17));
    return { left: width * .39, top, width: width * .57, height: readingHeight,
        lyricHeight: Math.max(1, readingHeight - subtitleHeight - 8), subtitleHeight,
        paintWidth: width, paintHeight: height };
}
let cachedSurface: ReturnType<typeof resolveRearReadingSurface> | null = null;
export function getVisualizerSurface() {
    if (typeof document === 'undefined' || document.documentElement.dataset.foliaSurface !== 'rear-lyrics-panel') return null;
    const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
    if (!cachedSurface || cachedSurface.paintWidth !== width || cachedSurface.paintHeight !== height)
        cachedSurface = resolveRearReadingSurface(width, height);
    return cachedSurface;
}
export function getVisualizerViewportWidth() {
    return getVisualizerSurface()?.width ?? (typeof window === 'undefined' ? 1200 : window.innerWidth);
}
export function getVisualizerViewportHeight() {
    return getVisualizerSurface()?.lyricHeight ?? (typeof window === 'undefined' ? 800 : window.innerHeight);
}
/** Rear canvases use their actual local host size; desktop minimums would squash the bitmap. */
export function resolveVisualizerDimension(value: number, minimum: number) {
    return Math.max(value, getVisualizerSurface() ? 1 : minimum);
}
export function resolveVisualizerCssSize(value: string) {
    const surface = getVisualizerSurface();
    return surface ? value.replace(/(-?\d*\.?\d+)(vw|vh|vmin|vmax)/g, (_match, amount, unit) => {
        const dimension = unit === 'vw' ? surface.width : unit === 'vh' ? surface.lyricHeight : unit === 'vmin' ? Math.min(surface.width, surface.lyricHeight) : Math.max(surface.width, surface.lyricHeight);
        return `${Number(amount) * dimension / 100}px`;
    }) : value;
}
export function getVisualizerPaintBounds(width: number, height: number) {
    return { width, height, offsetX: 0, offsetY: 0 };
}
/** Bitmap and CSS size describe the same local rectangle; no second camera translation. */
export function prepareVisualizerCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, width: number, height: number) {
    const paint = getVisualizerPaintBounds(width, height);
    const dpr = window.devicePixelRatio || 1;
    const pixelsWide = Math.max(1, Math.floor(paint.width * dpr));
    const pixelsHigh = Math.max(1, Math.floor(paint.height * dpr));
    if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
        canvas.width = pixelsWide; canvas.height = pixelsHigh;
        canvas.style.width = `${paint.width}px`; canvas.style.height = `${paint.height}px`;
    }
    const left = `${-paint.offsetX}px`;
    if (canvas.style.left !== left) canvas.style.left = left;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, paint.width, paint.height);
    context.setTransform(dpr, 0, 0, dpr, paint.offsetX * dpr, paint.offsetY * dpr);
    return paint;
}
