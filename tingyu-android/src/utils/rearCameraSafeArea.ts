// src/utils/rearCameraSafeArea.ts
// Physical-to-CSS conversion adapted from wmqc97/folia-android (4d86ad2), AGPL-3.0.
// The measured 17 Pro Max camera band is a fallback, never a right-side clipping mask.
export const REAR_REFERENCE = { width: 976, cameraRight: 277 } as const;
export interface RearRect { left: number; top: number; width: number; height: number }

export function resolveRearSafeLeft(width: number, safeLeftPx = REAR_REFERENCE.cameraRight as number,
    physicalWidthPx = REAR_REFERENCE.width as number) {
    const ratio = Number.isFinite(safeLeftPx) && Number.isFinite(physicalWidthPx)
        && physicalWidthPx > 0 && safeLeftPx >= 0 && safeLeftPx < physicalWidthPx
        ? safeLeftPx / physicalWidthPx : REAR_REFERENCE.cameraRight / REAR_REFERENCE.width;
    return Math.max(0, width) * ratio;
}

/** Fit the whole transformed current sentence, preserving aspect ratio and avoiding hard clipping. */
export function fitRearCurrentLine(bounds: RearRect, safe: RearRect) {
    const scale = Math.min(1, safe.width / Math.max(1, bounds.width), safe.height / Math.max(1, bounds.height));
    const width = bounds.width * scale, height = bounds.height * scale;
    const left = Math.max(safe.left, Math.min(bounds.left + (bounds.width - width) / 2, safe.left + safe.width - width));
    const top = Math.max(safe.top, Math.min(bounds.top + (bounds.height - height) / 2, safe.top + safe.height - height));
    return { left, top, width, height, scale };
}
