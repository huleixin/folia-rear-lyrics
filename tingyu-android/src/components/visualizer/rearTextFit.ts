import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import type { Theme } from '../../types';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../utils/fontStacks';
import { getVisualizerSurface } from '../../utils/visualizerSurface';

// src/components/visualizer/rearTextFit.ts
// Rear panel only: choose a lyric size that actually fits the reading box. Front stage keeps its clamp().
const cache = new Map<string, number>();

export function fitRearLyricFont(text: string, theme: Theme, options: {
    scale?: number; maxLines?: number; weight?: number; widthRatio?: number; heightRatio?: number;
} = {}): number | null {
    const surface = getVisualizerSurface();
    if (!surface || !text.trim()) return null;
    const { scale = 1, maxLines = 2, weight = resolveThemeFontWeight(theme, 700),
        widthRatio = .94, heightRatio = .5 } = options;
    const width = Math.max(24, surface.width * widthRatio);
    const height = Math.max(20, surface.height * heightRatio);
    const family = resolveThemeFontStack(theme);
    const key = [text, family, weight, width, height, maxLines, scale].join('|');
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    // CJK glyphs are about one em wide: keep roughly seven per line so wrapping stays even.
    let low = 10, high = Math.max(low, Math.min(28, surface.height * .22, width / 7));
    for (let i = 0; i < 7 && high - low > .5; i += 1) {
        const size = (low + high) / 2;
        const laid = layoutWithLines(prepareWithSegments(text, `${weight} ${size}px ${family}`), width, size * 1.35);
        const fits = laid.lines.length <= maxLines && laid.lines.length * size * 1.35 <= height;
        if (fits) low = size; else high = size;
    }
    const result = Math.max(10, Math.floor(low));
    cache.set(key, result);
    if (cache.size > 96) cache.delete(cache.keys().next().value!);
    return result;
}

/** Word-level jitter has to stay inside the box; the desktop spread assumes a 1080px stage. */
export function rearJitterScale(): number {
    return getVisualizerSurface() ? .22 : 1;
}
