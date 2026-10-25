import type { Container, Matrix } from 'pixi.js';
import { fitRearCurrentLine, type RearRect } from '../../../utils/rearCameraSafeArea';
import { clamp01, easeTemperaInOut } from './temperaMotion';
import type { TemperaGlyphView } from './temperaTextView';
import type { TemperaShot } from './types';

// src/components/visualizer/tempera/temperaRearFit.ts
// A shot is the compiler's current phrase (or whole line). Correct its reading ink only,
// after both camera transforms; artwork and already departing phrases keep the full panel.
export function createTemperaRearFit(pixi: typeof import('pixi.js'), glyphs: readonly TemperaGlyphView[], shot: TemperaShot) {
    const originals = new Map<Container, Matrix>();
    const reset = () => {
        originals.forEach((matrix, node) => { if (!node.destroyed) node.setFromMatrix(matrix); });
        originals.clear();
    };
    const measure = (): RearRect | null => {
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const glyph of glyphs) for (const node of [glyph.display, glyph.shadow]) {
            if (!node) continue;
            // Waiting characters participate too; revealing a new word must not reframe the phrase.
            const b = node.getLocalBounds(), w = node.getGlobalTransform();
            for (const x of [b.x, b.x + b.width]) for (const y of [b.y, b.y + b.height]) {
                const px = w.a * x + w.c * y + w.tx, py = w.b * x + w.d * y + w.ty;
                left = Math.min(left, px); top = Math.min(top, py);
                right = Math.max(right, px); bottom = Math.max(bottom, py);
            }
        }
        return Number.isFinite(left + top + right + bottom) && right > left && bottom > top
            ? { left, top, width: right - left, height: bottom - top } : null;
    };
    const move = (node: Container, scale: number, dx: number, dy: number) => {
        if (!node.parent) return;
        node.updateLocalTransform();
        originals.set(node, node.localTransform.clone());
        const w = node.getGlobalTransform();
        const desired = new pixi.Matrix(w.a * scale, w.b * scale, w.c * scale, w.d * scale,
            w.tx * scale + dx, w.ty * scale + dy);
        node.setFromMatrix(node.parent.getGlobalTransform().invert().append(desired));
    };
    return {
        reset,
        constrain(time: number, safe: RearRect): RearRect | null {
            if (time >= shot.endTime + .5) return null;
            const bounds = measure();
            if (!bounds) return null;
            const fit = fitRearCurrentLine(bounds, safe);
            // The next shot inherits the safe reading focus. This one can then leave naturally,
            // including behind the cameras, rather than snapping back or hitting a rectangular mask.
            const weight = 1 - easeTemperaInOut(clamp01((time - shot.endTime) / .5));
            const scale = 1 + (fit.scale - 1) * weight;
            const dx = (fit.left - bounds.left * fit.scale) * weight;
            const dy = (fit.top - bounds.top * fit.scale) * weight;
            for (const glyph of glyphs) {
                move(glyph.display, scale, dx, dy);
                if (glyph.shadow) move(glyph.shadow, scale, dx, dy);
                for (const echo of glyph.echoes) move(echo, scale, dx, dy);
            }
            return time >= shot.startTime && time < shot.endTime ? measure() : null;
        },
    };
}
export type TemperaRearFit = ReturnType<typeof createTemperaRearFit>;
