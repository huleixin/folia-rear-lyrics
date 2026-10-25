import type { Container, Matrix } from 'pixi.js';
import { fitRearCurrentLine, type RearRect } from '../../../../utils/rearCameraSafeArea';
import type { LineView } from './windowLines';

// src/components/visualizer/lumiere/text/rearFit.ts
// Fit after both camera transforms. Restore canonical poses before the next frame so corrections never accumulate.
export function createLumiereRearFit(pixi: typeof import('pixi.js')) {
    const originals = new Map<Container, Matrix>();
    const corrections = new Map<Container, { scale: number; dx: number; dy: number }>();
    const reset = () => {
        originals.forEach((matrix, node) => { if (!node.destroyed) node.setFromMatrix(matrix); });
        originals.clear();
        corrections.clear();
    };
    const move = (node: Container, scale: number, dx: number, dy: number) => {
        if (!node.parent) return;
        node.updateLocalTransform();
        originals.set(node, node.localTransform.clone());
        const world = node.getGlobalTransform();
        const desired = new pixi.Matrix(world.a * scale, world.b * scale, world.c * scale, world.d * scale,
            world.tx * scale + dx, world.ty * scale + dy);
        node.setFromMatrix(node.parent.getGlobalTransform().invert().append(desired));
    };
    return {
        reset,
        anchor(line: LineView, space: Container, anchor: { x: number; y: number; fontPx: number }) {
            const correction = corrections.get(line.holder);
            if (!correction) return anchor;
            const matrix = space.getGlobalTransform();
            const point = matrix.apply(anchor);
            const local = matrix.invert().apply({ x: point.x * correction.scale + correction.dx, y: point.y * correction.scale + correction.dy });
            return { x: local.x, y: local.y, fontPx: anchor.fontPx * correction.scale };
        },
        constrain(line: LineView, safe: RearRect, weight = 1): RearRect | null {
            if (!line.holder.visible || !line.glyphs.some(glyph => !glyph.blank && glyph.glyph.visible)) return null;
            const bounds = line.holder.getBounds();
            if (!Number.isFinite(bounds.x + bounds.y + bounds.width + bounds.height) || bounds.width <= 0 || bounds.height <= 0) return null;
            const fitted = fitRearCurrentLine({ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }, safe);
            const scale = 1 + (fitted.scale - 1) * weight;
            const dx = (fitted.left - bounds.x * fitted.scale) * weight, dy = (fitted.top - bounds.y * fitted.scale) * weight;
            corrections.set(line.holder, { scale, dx, dy });
            // Halos, flashes and the tracking spot use stage coordinates, but must follow the exact same screen-space fit.
            for (const node of [line.holder, line.haloLayer, line.starLayer, line.spot]) move(node, scale, dx, dy);
            const result = line.holder.getBounds();
            return { left: result.x, top: result.y, width: result.width, height: result.height };
        },
    };
}
