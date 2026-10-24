import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';
import type { Theme } from '../../types';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../utils/fontStacks';
import { getVisualizerSurface } from '../../utils/visualizerSurface';

// src/components/visualizer/rearTextLayout.ts
// Measure at line changes, preserving text and font weight; never scale a canvas on one axis.
const fonts = new Map<string, number>();
export function rearLyricFont(text: string, theme: Theme, scale = 1) {
    const surface = getVisualizerSurface();
    if (!surface) return null;
    const width = surface.width * .84, height = surface.lyricHeight * .72;
    const family = resolveThemeFontStack(theme), weight = resolveThemeFontWeight(theme, 700);
    const key = JSON.stringify([text, family, weight, width, height, scale]);
    const cached = fonts.get(key);
    if (cached !== undefined) return cached;
    let low = 16, high = Math.max(low, Math.min(36 * scale, height / 2.5, width / 5));
    for (let attempt = 0; attempt < 6 && high - low > .5; attempt++) {
        const size = (low + high) / 2;
        const prepared = prepareWithSegments(text || ' ', `${weight} ${size}px ${family}`);
        const measured = layoutWithLines(prepared, width, size * 1.45);
        if (measured.lines.length * size * 1.45 <= height && measured.lines.every(line => line.width <= width)) low = size;
        else high = size;
    }
    const result = Math.floor(low * 2) / 2;
    fonts.set(key, result); if (fonts.size > 64) fonts.delete(fonts.keys().next().value!);
    return result;
}

/** Fit translated/romanized tracks together so the second row cannot land on the touch controls. */
export function rearSubtitleFont(texts: string[], theme: Theme, scale = 1) {
    const surface = getVisualizerSurface();
    if (!surface) return null;
    const width = surface.width - 24, height = surface.subtitleHeight - 4;
    const family = resolveThemeFontStack(theme), weight = resolveThemeFontWeight(theme, 500);
    const key = JSON.stringify(['subtitle', texts, family, weight, width, height, scale]);
    const cached = fonts.get(key); if (cached !== undefined) return cached;
    let low = 12, high = Math.max(low, Math.min(16, 15 * scale));
    for (let attempt = 0; attempt < 4 && high - low > .5; attempt++) {
        const candidate = (low + high) / 2;
        const total = texts.reduce((sum, text) => sum + layoutWithLines(prepareWithSegments(text || ' ', `${weight} ${candidate}px ${family}`), width, candidate * 1.3).lines.length * candidate * 1.3, 0);
        if (total + Math.max(0, texts.length - 1) * 3 <= height) low = candidate;
        else high = candidate;
    }
    const size = Math.floor(low * 2) / 2;
    fonts.set(key, size); if (fonts.size > 64) fonts.delete(fonts.keys().next().value!);
    return size;
}
