import { fitRearCurrentLine, type RearRect } from '../../../utils/rearCameraSafeArea';

// src/components/visualizer/claddagh/claddaghRearLayout.ts
// A fixed pivot shared by the axis and orbit. Visibility must never change the pivot or layout scale.
export function getCladdaghRearOrigin(safe: RearRect) {
    return { x: safe.left + safe.width / 2, y: safe.top + safe.height / 2 };
}

interface RearOrbitOptions {
    radius: number; ellipseTiltDeg: number; focusScaleRatio: number;
    glyphRadius: number; chorusStagger: number; intensity: 'calm' | 'normal' | 'chaotic';
}

// Bound every phase of the ellipse and its largest beat, including rotated glyph corners.
// Computed once per layout instead of fitting a different subset of visible glyphs on each frame.
export function resolveCladdaghRearOrbit(safe: RearRect, options: RearOrbitOptions) {
    const origin = getCladdaghRearOrigin(safe);
    const radians = options.ellipseTiltDeg * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
    const maxPowerScale = { calm: 1.08, normal: 1.25, chaotic: 1.95 }[options.intensity];
    const radius = options.radius * maxPowerScale;
    const glyph = options.glyphRadius * 1.2 * (1 + Math.max(0, options.focusScaleRatio));
    const halfWidth = radius * (cos + .09 * sin) + options.chorusStagger * sin + glyph;
    const halfHeight = radius * (sin + .09 * cos) + options.chorusStagger * cos + glyph;
    const inset = Math.max(3, safe.width * .02);
    const fit = fitRearCurrentLine({ left: origin.x - halfWidth, top: origin.y - halfHeight,
        width: halfWidth * 2, height: halfHeight * 2 }, {
        left: safe.left + inset, top: safe.top + inset,
        width: safe.width - inset * 2, height: safe.height - inset * 2,
    });
    return { ...origin, scale: fit.scale };
}

// Keep the pulsing axis beside the camera too, without moving its midpoint with the beat.
export function resolveCladdaghRearAxis(safe: RearRect, angle: number) {
    const origin = getCladdaghRearOrigin(safe), inset = Math.max(4, safe.width * .02);
    const radians = angle * Math.PI / 180;
    const maxLength = Math.min((safe.width - inset * 2) / Math.max(.0001, Math.abs(Math.cos(radians))),
        (safe.height - inset * 2) / Math.max(.0001, Math.abs(Math.sin(radians))));
    return { ...origin, width: maxLength * .9, maxScaleX: 1 / .9 };
}
