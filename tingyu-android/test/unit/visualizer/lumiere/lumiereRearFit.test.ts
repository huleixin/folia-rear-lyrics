import { describe, expect, it } from 'vitest';
import * as pixi from 'pixi.js';
import { createLumiereRearFit } from '@/components/visualizer/lumiere/text/rearFit';
import type { LineView } from '@/components/visualizer/lumiere/text/windowLines';

// test/unit/visualizer/lumiere/lumiereRearFit.test.ts
// Nested camera + transition poses must fit uniformly, without moving neighbors or accumulating on repeated frames.
describe('Lumiere rear current-line fit', () => {
    it.each([[329, 208], [347, 212], [393, 249]])('protects ink and attached light at %s × %s', (width, height) => {
        const stage = new pixi.Container(), camera = new pixi.Container(), transition = new pixi.Container();
        stage.addChild(transition); transition.addChild(camera);
        const holder = new pixi.Container(), haloLayer = new pixi.Container(), starLayer = new pixi.Container();
        const spot = new pixi.Graphics().rect(-5, -5, 10, 10).fill(0xffffff);
        const ink = new pixi.Graphics().rect(-130, -30, 260, 60).fill(0xffffff);
        holder.addChild(ink); camera.addChild(holder, haloLayer, starLayer, spot);
        const neighbor = new pixi.Graphics().rect(0, 0, 20, 20).fill(0xffffff); camera.addChild(neighbor);
        const line = { holder, haloLayer, starLayer, spot, glyphs: [{ blank: false, glyph: ink }] } as unknown as LineView;
        const fit = createLumiereRearFit(pixi);
        const safe = { left: width * .3, top: 5, width: width * .68, height: height - 50 };
        for (let frame = 0; frame < 180; frame++) {
            fit.reset();
            transition.position.set(width / 2, height / 2); transition.pivot.set(width / 2, height / 2);
            transition.scale.set(.8 + (frame % 30) / 60);
            camera.rotation = Math.sin(frame / 18) * .16; camera.position.set(Math.sin(frame / 25) * 16, 7);
            holder.position.set(width * .4 + Math.sin(frame / 10) * 130, height * .6);
            holder.scale.set(.8 + (frame % 20) / 40); holder.rotation = Math.sin(frame / 20) * .8;
            haloLayer.position.copyFrom(holder.position); starLayer.position.copyFrom(holder.position); spot.position.copyFrom(holder.position);
            const canonicalAnchor = { x: holder.x, y: holder.y, fontPx: 24 };
            const before = holder.getGlobalTransform().clone(), neighborBefore = neighbor.getBounds().rectangle.clone();
            const bounds = fit.constrain(line, safe)!;
            expect(bounds.left).toBeGreaterThanOrEqual(safe.left - .001);
            expect(bounds.top).toBeGreaterThanOrEqual(safe.top - .001);
            expect(bounds.left + bounds.width).toBeLessThanOrEqual(safe.left + safe.width + .001);
            expect(bounds.top + bounds.height).toBeLessThanOrEqual(safe.top + safe.height + .001);
            const origin = holder.getGlobalTransform().apply({ x: 0, y: 0 });
            const burst = fit.anchor(line, camera, canonicalAnchor);
            const burstPoint = camera.getGlobalTransform().apply(burst);
            expect(burstPoint.x).toBeCloseTo(origin.x, 5); expect(burstPoint.y).toBeCloseTo(origin.y, 5);
            expect(burst.fontPx).toBeGreaterThan(0); expect(burst.fontPx).toBeLessThanOrEqual(24);
            for (const light of [haloLayer, starLayer, spot]) {
                const p = light.getGlobalTransform().apply({ x: 0, y: 0 });
                expect(p.x).toBeCloseTo(origin.x, 5); expect(p.y).toBeCloseTo(origin.y, 5);
            }
            expect(neighbor.getBounds().rectangle).toEqual(neighborBefore);
            fit.reset();
            expect(fit.anchor(line, camera, canonicalAnchor)).toEqual(canonicalAnchor);
            const restored = holder.getGlobalTransform();
            for (const key of ['a','b','c','d','tx','ty'] as const) expect(restored[key]).toBeCloseTo(before[key], 5);
            const repeated = fit.constrain(line, safe)!;
            expect(repeated.left).toBeCloseTo(bounds.left, 5); expect(repeated.width).toBeCloseTo(bounds.width, 5);
        }
        fit.reset(); stage.destroy({ children: true });
    });
});
