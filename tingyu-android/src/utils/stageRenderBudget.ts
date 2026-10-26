import { isAndroidNativeRuntime } from './platform';

// src/utils/stageRenderBudget.ts
/** Raster density only: never changes CSS dimensions, lyric positions or rear camera geometry. */
export function resolveStageRenderRatio(ratio: number | undefined, maximum = 2) {
    const requested = Math.min(maximum, Math.max(1, Number.isFinite(ratio) ? ratio! : 1));
    if (!isAndroidNativeRuntime() || document.documentElement.dataset.foliaSurface === 'rear-lyrics-panel') return requested;
    // Dense phone screens do not need desktop-size full-screen intermediate textures.
    return Math.min(requested, 1.5);
}
