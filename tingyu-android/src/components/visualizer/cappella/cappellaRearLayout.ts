import type { CappellaIntensityConfig } from './cappellaTypes';

// src/components/visualizer/cappella/cappellaRearLayout.ts
// The rear bubble fits its final border box, including padding, without scaling the full-width row.
export function resolveCappellaRearBudget(surface: { width: number; height: number }, paddingX: number, paddingY: number) {
    const maxWidth = Math.max(1, surface.width - 12);
    const maxHeight = Math.max(1, surface.height - 12);
    return { maxWidth, maxHeight, maxTextWidth: Math.max(1, maxWidth - paddingX * 2 - 2),
        maxTextHeight: Math.max(1, maxHeight - paddingY * 2 - 2) };
}

export function resolveCappellaRearMotion(motion: CappellaIntensityConfig['motion']) {
    return { ...motion, activeScale: 1, passedScale: 1, rowEnterScale: 1, rowExitScale: 1,
        rowEnterY: 4, rowExitY: -4 };
}

/** Measure the complete sentence once so later reveal/growth never needs to overflow the panel. */
export function fitCappellaRearFont(desired: number, maxHeight: number,
    measureHeight: (font: number) => number) {
    if (measureHeight(desired) <= maxHeight) return desired;
    let low = Math.min(10, desired), high = desired;
    for (let i = 0; i < 9; i++) {
        const mid = (low + high) / 2;
        if (measureHeight(mid) <= maxHeight) low = mid; else high = mid;
    }
    return low;
}
