import type { Container, Matrix } from 'pixi.js';
import { fitRearCurrentLine, type RearRect } from '../../../utils/rearCameraSafeArea';
import type { SegmentView } from './sonnetTextViewBuilder';
import { clamp01, easeSonnetInOut } from './sonnetMotion';

// src/components/visualizer/sonnet/sonnetRearFit.ts
// Group by the parser's source line, never by the hero role or the camera's current word.
// Only reading ink defines the fit; ghosts, MG artwork and decorative giant text may use the full panel.
export function createSonnetRearFit(pixi: typeof import('pixi.js'), segments: readonly SegmentView[]) {
    const groups = new Map<NonNullable<SegmentView['sourceLine']>, SegmentView[]>();
    for (const segment of segments) {
        if (!segment.sourceLine || segment.role === 'decoration') continue;
        const group = groups.get(segment.sourceLine) ?? [];
        group.push(segment);
        groups.set(segment.sourceLine, group);
    }
    const originals = new Map<Container, Matrix>();
    const reset = () => {
        originals.forEach((matrix, node) => { if (!node.destroyed) node.setFromMatrix(matrix); });
        originals.clear();
    };
    const measure = (group: readonly SegmentView[]): RearRect | null => {
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (const segment of group) for (const glyph of segment.glyphs) {
            if (glyph.isBackgroundShape || glyph.isTextGlyph === false || !glyph.display.visible) continue;
            // Include waiting glyphs too: the composition cannot grow/shrink whenever another character lights up.
            const bounds = (glyph.ink ?? glyph.display).getBounds();
            left = Math.min(left, bounds.x); top = Math.min(top, bounds.y);
            right = Math.max(right, bounds.x + bounds.width); bottom = Math.max(bottom, bounds.y + bounds.height);
        }
        return Number.isFinite(left + top + right + bottom) && right > left && bottom > top
            ? { left, top, width: right - left, height: bottom - top } : null;
    };
    const move = (node: Container, scale: number, dx: number, dy: number) => {
        if (!node.parent || originals.has(node)) return;
        node.updateLocalTransform();
        originals.set(node, node.localTransform.clone());
        const world = node.getGlobalTransform();
        const desired = new pixi.Matrix(world.a * scale, world.b * scale, world.c * scale, world.d * scale,
            world.tx * scale + dx, world.ty * scale + dy);
        node.setFromMatrix(node.parent.getGlobalTransform().invert().append(desired));
    };
    return {
        reset,
        constrain(time: number, safe: RearRect): RearRect | null {
            let current: RearRect | null = null;
            for (const [line, group] of groups) {
                if (time < line.startTime - .5 || time >= line.endTime + .5) continue;
                const bounds = measure(group);
                if (!bounds) continue;
                const fit = fitRearCurrentLine(bounds, safe);
                const weight = easeSonnetInOut(clamp01((time - line.startTime + .5) / .5))
                    * (1 - easeSonnetInOut(clamp01((time - line.endTime) / .5)));
                const scale = 1 + (fit.scale - 1) * weight;
                const dx = (fit.left - bounds.left * fit.scale) * weight, dy = (fit.top - bounds.top * fit.scale) * weight;
                for (const segment of group) {
                    move(segment.guide.container, scale, dx, dy);
                    if (segment.frameDecor) move(segment.frameDecor.container, scale, dx, dy);
                    for (const glyph of segment.glyphs) {
                        move(glyph.display, scale, dx, dy);
                        if (glyph.halo) move(glyph.halo, scale, dx, dy);
                        if (glyph.caWrapper) move(glyph.caWrapper, scale, dx, dy);
                    }
                }
                if (time >= line.startTime && time < line.endTime) current = measure(group);
            }
            return current;
        },
    };
}

export type SonnetRearFit = ReturnType<typeof createSonnetRearFit>;
