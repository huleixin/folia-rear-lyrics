import type { FumeBlock, ViewportSize } from './fumeTypes';
import { resolveCameraScaleForBlock } from './fumeCamera';

// src/components/visualizer/fume/fumeReadingCamera.ts
// Rear-screen resting focus frames the current print row, rather than placing only its cursor on screen.
// The original camera springs and flight transitions still move between these fitted targets.
export function resolveFumeReadingCamera(block: FumeBlock, printedProgress: number, viewport: ViewportSize, columnWidth?: number) {
    const row = block.renderLines.find(value => printedProgress <= value.end) ?? block.renderLines.at(-1);
    if (!row) return null;
    return {
        x: block.x + row.left + row.width * .5,
        y: block.y + row.top + block.lineHeight * .5,
        // columnWidth is the camera-free column on the rear panel: the sung row must fit inside it.
        scale: Math.max(.001, Math.min(resolveCameraScaleForBlock(block, viewport),
            (columnWidth ?? viewport.width) * .82 / Math.max(1, row.width),
            viewport.height * .50 / Math.max(1, block.lineHeight))),
    };
}
