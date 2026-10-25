import * as THREE from 'three';
import { fitRearCurrentLine, type RearRect } from '../../../utils/rearCameraSafeArea';
import { LINE_FONT_SIZE } from './dioramaSceneConstants';
import type { PlacedUnitRaster } from './dioramaSceneTypes';
import { DIORAMA_RASTER_FONT_PX } from './dioramaTextRaster';

// src/components/visualizer/diorama/dioramaRearFit.ts
// Reframe only the active 3D lyric after the camera moves. The camera, particles and departing text stay untouched.
export function getDioramaInkBox(units: readonly PlacedUnitRaster[]) {
    const box = new THREE.Box3();
    const ratio = LINE_FONT_SIZE / DIORAMA_RASTER_FONT_PX;
    for (const unit of units) {
        const ink = unit.raster.inkBounds;
        const left = ink
            ? unit.centerX + (ink.left - unit.raster.canvasWidthPx / 2) * ratio
            : unit.centerX - unit.width / 2;
        const top = ink
            ? (unit.centerY ?? 0) + (unit.raster.canvasHeightPx / 2 - ink.top) * ratio
            : (unit.centerY ?? 0) + unit.height / 2;
        const right = ink ? left + ink.width * ratio : unit.centerX + unit.width / 2;
        const bottom = ink ? top - ink.height * ratio : (unit.centerY ?? 0) - unit.height / 2;
        box.expandByPoint(new THREE.Vector3(left, bottom, 0));
        box.expandByPoint(new THREE.Vector3(right, top, 0));
    }
    return box;
}

/** Reuses matrix/vector storage; no React state, DOM reads or text rasterisation on animation frames. */
export class DioramaRearFit {
    private combined = new THREE.Matrix4();
    private original = new THREE.Matrix4();
    private screen = new THREE.Matrix4();
    private correction = new THREE.Matrix4();
    private parentInverse = new THREE.Matrix4();
    private point = new THREE.Vector3();
    private cameraPoint = new THREE.Vector3();
    readonly bounds: RearRect = { left: 0, top: 0, width: 0, height: 0 };
    private enlarged: RearRect = { left: 0, top: 0, width: 0, height: 0 };
    private safe: RearRect;

    constructor(readonly width: number, readonly height: number, safe: RearRect) {
        const xPad = safe.width * 0.035,
            yPad = safe.height * 0.07;
        this.safe = {
            left: safe.left + xPad,
            top: safe.top + yPad,
            width: safe.width - xPad * 2,
            height: safe.height - yPad * 2,
        };
    }

    project(group: THREE.Group, camera: THREE.Camera, ink: THREE.Box3) {
        this.combined.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(group.matrixWorld);
        let left = Infinity,
            right = -Infinity,
            top = Infinity,
            bottom = -Infinity;
        for (let corner = 0; corner < 4; corner++) {
            this.point
                .set(corner & 1 ? ink.max.x : ink.min.x, corner & 2 ? ink.max.y : ink.min.y, 0)
                .applyMatrix4(this.combined);
            const x = ((this.point.x + 1) * this.width) / 2,
                y = ((1 - this.point.y) * this.height) / 2;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
        this.bounds.left = left;
        this.bounds.top = top;
        this.bounds.width = right - left;
        this.bounds.height = bottom - top;
        return this.bounds;
    }

    apply(group: THREE.Group, camera: THREE.Camera, ink: THREE.Box3, fontScale: number) {
        if (ink.isEmpty()) return;
        camera.updateMatrixWorld();
        // Always start from the authored pose. Feeding last frame's correction back into this frame causes pumping/flicker.
        group.updateMatrix();
        group.updateWorldMatrix(true, false);
        this.original.copy(group.matrixWorld);
        this.combined.multiplyMatrices(camera.matrixWorldInverse, this.original);
        let inFront = true;
        for (let corner = 0; corner < 4; corner++) {
            this.cameraPoint
                .set(corner & 1 ? ink.max.x : ink.min.x, corner & 2 ? ink.max.y : ink.min.y, 0)
                .applyMatrix4(this.combined);
            if (this.cameraPoint.z >= -0.2) inFront = false;
        }
        // On a distant seek/song flight the new line may be behind the lens. Keep its readable body in front;
        // the original corridor still flies past in the full-panel scene.
        if (!inFront) {
            this.original.makeTranslation(0, 0, -5.2).premultiply(camera.matrixWorld);
            group.matrixWorld.copy(this.original);
        }
        const raw = this.project(group, camera, ink);
        if (
            !Number.isFinite(raw.left) ||
            !Number.isFinite(raw.top) ||
            !Number.isFinite(raw.width) ||
            !Number.isFinite(raw.height)
        )
            return;
        const desiredHeight = ((ink.max.y - ink.min.y) / LINE_FONT_SIZE) * this.height * 0.105 * fontScale;
        const grow = Math.max(1, Math.min(3, desiredHeight / Math.max(1, raw.height)));
        this.enlarged.left = raw.left - (raw.width * (grow - 1)) / 2;
        this.enlarged.top = raw.top - (raw.height * (grow - 1)) / 2;
        this.enlarged.width = raw.width * grow;
        this.enlarged.height = raw.height * grow;
        const fit = fitRearCurrentLine(this.enlarged, this.safe);
        const scale = grow * fit.scale;
        const dx = fit.left - raw.left * scale,
            dy = fit.top - raw.top * scale;
        this.screen.set(
            scale,
            0,
            0,
            scale - 1 + (2 * dx) / this.width,
            0,
            scale,
            0,
            1 - scale - (2 * dy) / this.height,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1
        );
        this.correction
            .copy(camera.matrixWorld)
            .multiply(camera.projectionMatrixInverse)
            .multiply(this.screen)
            .multiply(camera.projectionMatrix)
            .multiply(camera.matrixWorldInverse)
            .multiply(this.original);
        this.parentInverse.identity();
        if (group.parent) this.parentInverse.copy(group.parent.matrixWorld).invert();
        group.matrix.copy(this.parentInverse).multiply(this.correction);
        group.matrixWorldNeedsUpdate = true;
        group.updateWorldMatrix(false, true);
        this.project(group, camera, ink);
    }
}
