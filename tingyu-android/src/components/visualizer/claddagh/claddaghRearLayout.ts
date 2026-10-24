import { fitRearCurrentLine, type RearRect } from '../../../utils/rearCameraSafeArea';

// src/components/visualizer/claddagh/claddaghRearLayout.ts
// Fit the projected current ring, including each glyph's rotation and emphasis scale.
export interface CladdaghRearGlyph {
    x: number; y: number; scale: number; angle: number;
    width: number; height: number; opacity: number;
}
export interface CladdaghRearTransform { x: number; y: number; scale: number }

export function fitCladdaghRearLine(glyphs: CladdaghRearGlyph[], safe: RearRect): CladdaghRearTransform {
    const originX = safe.left + safe.width / 2, originY = safe.top + safe.height / 2;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const glyph of glyphs) {
        if (glyph.opacity < .02 || glyph.width <= 0 || glyph.height <= 0) continue;
        const angle = glyph.angle * Math.PI / 180;
        const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
        const halfWidth = (glyph.width * cos + glyph.height * sin) * glyph.scale / 2;
        const halfHeight = (glyph.width * sin + glyph.height * cos) * glyph.scale / 2;
        left = Math.min(left, originX + glyph.x - halfWidth);
        right = Math.max(right, originX + glyph.x + halfWidth);
        top = Math.min(top, originY + glyph.y - halfHeight);
        bottom = Math.max(bottom, originY + glyph.y + halfHeight);
    }
    if (!Number.isFinite(left)) return { x: originX, y: originY, scale: 1 };
    const inset = Math.max(3, safe.width * .02);
    const target = fitRearCurrentLine({ left, top, width: right - left, height: bottom - top }, {
        left: safe.left + inset, top: safe.top + inset,
        width: safe.width - inset * 2, height: safe.height - inset * 2,
    });
    return { x: target.left + (originX - left) * target.scale,
        y: target.top + (originY - top) * target.scale, scale: target.scale };
}
