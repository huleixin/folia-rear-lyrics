import { motionValue } from 'framer-motion';

// src/utils/mobileStageSubtitleClearance.ts
// Written only by the front-display controls; rear/preview hosts never publish a value.
export const mobileStageSubtitleClearance = motionValue(0);
const SUBTITLE_CONTROL_GAP_PX = 24;

export function resolveMobileStageSubtitleClearance(stage: DOMRect, controls: DOMRect): number {
    if (stage.height <= 0 || controls.height <= 0 || controls.width <= 0
        || controls.top >= stage.bottom || controls.bottom <= stage.top) return 0;
    return Math.ceil(stage.bottom - controls.top + SUBTITLE_CONTROL_GAP_PX);
}

export function resolveHostSubtitleBottom(legacy: number, clearance: number, isPlayerHost: boolean): number {
    return isPlayerHost ? Math.max(legacy, clearance) : legacy;
}
