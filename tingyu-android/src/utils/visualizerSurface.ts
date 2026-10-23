// src/utils/visualizerSurface.ts
// Reading bounds and animation paint bounds are independent. Other Folia/OBS surfaces are unchanged.
export function resolveRearReadingSurface(width: number, height: number) {
    return { left: width * .37, top: 0, width: width * .60, height, paintWidth: width, paintHeight: height };
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
export function resolveVisualizerCssSize(value: string) {
    const surface = getVisualizerSurface();
    return surface ? value.replace(/(-?\d*\.?\d+)vw/g, (_match, amount) => `${Number(amount) * surface.width / 100}px`) : value;
}
export function getVisualizerPaintBounds(width: number, height: number) {
    const surface = getVisualizerSurface();
    return { width: surface?.paintWidth ?? width, height, offsetX: surface?.left ?? 0, offsetY: 0 };
}
/** Clear the full bitmap, then restore layout coordinates; never stretch or duplicate the lyrics. */
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
