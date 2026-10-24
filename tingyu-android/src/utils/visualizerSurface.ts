// src/utils/visualizerSurface.ts
// The rear panel is one document. The background paints full-bleed; lyrics live in a reading box
// to the right of the camera and above the native transport controls. Inside that box all
// coordinates are local (0,0), so a renderer can never offset itself twice.
const CONTROLS_GAP = 62;

export function resolveRearReadingBox(width: number, height: number) {
    const controls = Math.max(18, height * .08) + CONTROLS_GAP;
    return { left: width * .37, top: 0, width: Math.max(1, width * .60),
        height: Math.max(1, height - controls) };
}
/** Local content rect: same size as the reading box, origin at zero. */
const localOf = (box: { width: number; height: number }) => ({
    left: 0, top: 0, width: box.width, height: box.height,
    paintWidth: box.width, paintHeight: box.height,
});
let cachedBox: { key: string; box: ReturnType<typeof resolveRearReadingBox> } | null = null;
export function getRearReadingBox() {
    if (typeof document === 'undefined' || document.documentElement.dataset.foliaSurface !== 'rear-lyrics-panel') return null;
    const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
    const key = `${width}x${height}`;
    if (!cachedBox || cachedBox.key !== key) cachedBox = { key, box: resolveRearReadingBox(width, height) };
    return cachedBox.box;
}
export function getVisualizerSurface() {
    const box = getRearReadingBox();
    return box ? localOf(box) : null;
}
export function getVisualizerViewportWidth() {
    return getVisualizerSurface()?.width ?? (typeof window === 'undefined' ? 1200 : window.innerWidth);
}
/** Desktop minimum sizes do not exist on the rear panel: a floor there stretches the canvas bitmap. */
export function resolveVisualizerDimension(value: number, minimum: number) {
    return Math.max(value, getVisualizerSurface() ? 1 : minimum);
}
export function resolveVisualizerCssSize(value: string) {
    const surface = getVisualizerSurface();
    return surface ? value.replace(/(-?\d*\.?\d+)(vw|vh|vmin|vmax)/g, (_match, amount, unit) => {
        const dimension = unit === 'vw' ? surface.width : unit === 'vh' ? surface.height
            : unit === 'vmin' ? Math.min(surface.width, surface.height) : Math.max(surface.width, surface.height);
        return `${Number(amount) * dimension / 100}px`;
    }) : value;
}
export function getVisualizerPaintBounds(width: number, height: number) {
    return { width, height, offsetX: 0, offsetY: 0 };
}
/** Bitmap and CSS size describe the same local rectangle; no extra camera translation. */
export function prepareVisualizerCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, width: number, height: number) {
    const paint = getVisualizerPaintBounds(width, height);
    const dpr = window.devicePixelRatio || 1;
    const pixelsWide = Math.max(1, Math.floor(paint.width * dpr));
    const pixelsHigh = Math.max(1, Math.floor(paint.height * dpr));
    if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
        canvas.width = pixelsWide; canvas.height = pixelsHigh;
        canvas.style.width = `${paint.width}px`; canvas.style.height = `${paint.height}px`;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, paint.width, paint.height);
    return paint;
}
