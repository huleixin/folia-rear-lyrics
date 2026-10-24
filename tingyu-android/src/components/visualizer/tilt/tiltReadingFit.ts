import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';
import type { Theme } from '../../../types';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../../utils/fontStacks';
import { getVisualizerSurface } from '../../../utils/visualizerSurface';

// src/components/visualizer/tilt/tiltReadingFit.ts
// Fit only the resting typography. Original per-character and enter/exit transforms remain untouched.
export function fitTiltReadingLayout<T extends {
    segments: { text: string; isTilt: boolean; isShortLastLine: boolean }[]; scaleMultiplier: number;
}>(layout: T, theme: Theme, fontScale: number): T {
    const surface = getVisualizerSurface();
    if (!surface || !layout.segments.length) return layout;
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const basePx = Math.max(3.125 * rem, Math.min(5.625 * rem, surface.width * .06875));
    let widest = 0, totalHeight = 0;
    for (const segment of layout.segments) {
        const px = basePx * fontScale * layout.scaleMultiplier * (segment.isShortLastLine && !segment.isTilt ? 1.18 : 1);
        const font = `${segment.isTilt ? 'italic ' : ''}${resolveThemeFontWeight(theme, segment.isTilt ? 300 : 400)} ${px}px ${resolveThemeFontStack(theme)}`;
        const measured = layoutWithLines(prepareWithSegments(segment.text, font), 99999, px * 1.4);
        // Normal Tilt lines add .08em letter spacing; reserve it in the resting width too.
        widest = Math.max(widest, (measured.lines[0]?.width ?? 0) + (segment.isTilt ? 0 : [...segment.text].length * px * .08));
        totalHeight += px * 1.4;
    }
    const fit = Math.min(1, surface.width * .84 / Math.max(1, widest),
        Math.max(48, surface.lyricHeight * .7 - 48 - (layout.segments.length - 1) * 12) / Math.max(1, totalHeight));
    return { ...layout, scaleMultiplier: layout.scaleMultiplier * fit };
}
