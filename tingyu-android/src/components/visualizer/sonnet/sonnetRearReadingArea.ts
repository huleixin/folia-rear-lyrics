import type { SonnetTuning } from '../../../types';
import type { RearRect } from '../../../utils/rearCameraSafeArea';

// src/components/visualizer/sonnet/sonnetRearReadingArea.ts
// Mirrors the lens shader's output-to-input mapping. Calculate only when layout/settings change.
export function resolveSonnetRearReadingArea(safe: RearRect, width: number, height: number,
    tuning: SonnetTuning, staticMode: boolean, horizontalShift = 0): RearRect {
    if (staticMode || (!tuning.postProcessEnabled && horizontalShift <= 0)) return safe;
    const guard = tuning.postProcessEnabled
        ? 2 + height * .012 * tuning.postProcessLensDispersion + 3 * tuning.postProcessRgbShift : 1;
    const target = { left: safe.left + guard + horizontalShift, top: safe.top + guard,
        width: Math.max(4, safe.width - 2 * (guard + horizontalShift)), height: Math.max(4, safe.height - 2 * guard) };
    if (!tuning.postProcessEnabled) return target;
    const aspect = width / height, curvature = tuning.postProcessLensDistortion * .32;
    const sample = (x: number, y: number) => {
        const cx = (x - .5) * aspect, cy = y - .5, r2 = cx * cx + cy * cy;
        const scale = 1 - curvature * r2 + curvature * .16 * r2 * r2;
        return { x: (x - .5) * scale + .5, y: cy * scale + .5 };
    };
    let left = 0, right = 1, top = 0, bottom = 1;
    const l = target.left / width, r = (target.left + target.width) / width;
    const t = target.top / height, b = (target.top + target.height) / height;
    // Include the full outside strips, not just the four corners: strong curvature can fold near an edge.
    for (let i = 0; i <= 48; i++) for (let j = 0; j <= 48; j++) {
        const u = i / 48, v = j / 48;
        left = Math.max(left, sample(u * l, v).x);
        right = Math.min(right, sample(r + u * (1 - r), v).x);
        top = Math.max(top, sample(u, v * t).y);
        bottom = Math.min(bottom, sample(u, b + v * (1 - b)).y);
    }
    // One source pixel also covers the sampling-grid approximation and bilinear texture filtering.
    const sourceGuard = 1 + height * .012 * tuning.postProcessLensDispersion;
    return { left: left * width + sourceGuard, top: top * height + sourceGuard,
        width: Math.max(4, (right - left) * width - 2 * sourceGuard), height: Math.max(4, (bottom - top) * height - 2 * sourceGuard) };
}
