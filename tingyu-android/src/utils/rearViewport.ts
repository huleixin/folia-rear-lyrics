// src/utils/rearViewport.ts
// Convert the native visible WebView intersection into CSS pixels before sizing the lyric frame.
export interface RearNativeViewport {
    width: number; height: number;
    visibleLeft: number; visibleTop: number; visibleWidth: number; visibleHeight: number;
}
export interface RearViewport { left: number; top: number; width: number; height: number }

export function resolveRearViewport(layout: { width: number; height: number },
    visual?: { width: number; height: number; offsetLeft: number; offsetTop: number } | null,
    native?: RearNativeViewport | null): RearViewport {
    const width = visual && visual.width > 0 ? Math.min(layout.width, visual.width) : layout.width;
    const height = visual && visual.height > 0 ? Math.min(layout.height, visual.height) : layout.height;
    const left = Math.max(0, visual?.offsetLeft ?? 0), top = Math.max(0, visual?.offsetTop ?? 0);
    const fallback = { left, top, width, height };
    if (!native || ![native.width, native.height, native.visibleLeft, native.visibleTop, native.visibleWidth, native.visibleHeight]
        .every(Number.isFinite) || native.width <= 0 || native.height <= 0
        || native.visibleWidth <= 0 || native.visibleHeight <= 0) return fallback;
    const x = Math.max(0, Math.min(native.width, native.visibleLeft));
    const y = Math.max(0, Math.min(native.height, native.visibleTop));
    return { left: left + width * x / native.width, top: top + height * y / native.height,
        width: width * Math.min(native.visibleWidth, native.width - x) / native.width,
        height: height * Math.min(native.visibleHeight, native.height - y) / native.height };
}
