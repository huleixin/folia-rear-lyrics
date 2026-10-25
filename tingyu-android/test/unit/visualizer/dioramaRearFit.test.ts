import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DioramaRearFit } from '@/components/visualizer/diorama/dioramaRearFit';
import { resolveRearReadingBox } from '@/utils/visualizerSurface';

// test/unit/visualizer/dioramaRearFit.test.ts
// Project the corrected geometry independently with Three's Vector3.project, including moving/rolling cameras.
describe('Diorama rear lyric framing', () => {
    for (const [width, height] of [
        [329, 208],
        [347, 212],
        [393, 249],
    ]) {
        it(`protects the whole lyric through camera moves on ${width}×${height}`, () => {
            const safe = resolveRearReadingBox(width, height);
            const fit = new DioramaRearFit(width, height, safe);
            const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
            const parent = new THREE.Group();
            parent.position.set(1, -0.3, -2);
            parent.rotation.set(0.1, 0.2, -0.08);
            const group = new THREE.Group();
            group.matrixAutoUpdate = false;
            parent.add(group);
            const ink = new THREE.Box3(new THREE.Vector3(-2.2, -1.4, 0), new THREE.Vector3(2.2, 1.4, 0));
            const point = new THREE.Vector3();
            for (let frame = 0; frame < 180; frame++) {
                const angle = frame / 37;
                camera.position.set(Math.sin(angle) * 7, Math.cos(angle * 1.3) * 4, 5 + Math.cos(angle) * 4);
                camera.lookAt(0, 0, -4);
                camera.rotateZ(Math.sin(angle) * 0.3);
                group.position.set(Math.cos(angle) * 4, Math.sin(angle * 1.2), -4);
                group.rotation.set(0.1, Math.sin(angle) * 0.3, Math.cos(angle) * 0.2);
                group.scale.setScalar(0.6 + Math.abs(Math.sin(angle)) * 1.8);
                fit.apply(group, camera, ink, 1.5);
                for (let corner = 0; corner < 4; corner++) {
                    point
                        .set(corner & 1 ? ink.max.x : ink.min.x, corner & 2 ? ink.max.y : ink.min.y, 0)
                        .applyMatrix4(group.matrixWorld)
                        .project(camera);
                    const x = ((point.x + 1) * width) / 2,
                        y = ((1 - point.y) * height) / 2;
                    expect(x).toBeGreaterThanOrEqual(safe.left - 0.001);
                    expect(x).toBeLessThanOrEqual(safe.left + safe.width + 0.001);
                    expect(y).toBeGreaterThanOrEqual(safe.top - 0.001);
                    expect(y).toBeLessThanOrEqual(safe.top + safe.height + 0.001);
                }
                const previous = group.matrix.clone();
                fit.apply(group, camera, ink, 1.5);
                expect(
                    Math.max(...previous.elements.map((value, index) => Math.abs(value - group.matrix.elements[index])))
                ).toBeLessThan(1e-8);
            }
        });
    }
    it('keeps the sung body visible when a seek places its authored pose behind the lens', () => {
        const fit = new DioramaRearFit(347, 212, resolveRearReadingBox(347, 212));
        const camera = new THREE.PerspectiveCamera(55, 347 / 212, 0.1, 100);
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        group.position.z = 5;
        const ink = new THREE.Box3(new THREE.Vector3(-2, -0.5, 0), new THREE.Vector3(2, 0.5, 0));
        fit.apply(group, camera, ink, 1);
        expect(new THREE.Vector3().setFromMatrixPosition(group.matrixWorld).z).toBeLessThan(0);
        expect(fit.bounds.width).toBeGreaterThan(100);
        expect(fit.bounds.left).toBeGreaterThan(100);
    });
});
