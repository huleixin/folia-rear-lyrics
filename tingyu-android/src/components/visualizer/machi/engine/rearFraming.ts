import * as THREE from 'three';
import type { RearRect } from '../../../../utils/rearCameraSafeArea';

// src/components/visualizer/machi/engine/rearFraming.ts
// Keep real sign faces on the visible display by shifting the projection of the whole diorama.
export interface MachiLetteringFace { corners: THREE.Vector3[]; normal: THREE.Vector3 }

export function collectMachiLettering(root: THREE.Object3D): MachiLetteringFace[] {
    const faces: MachiLetteringFace[] = [];
    root.updateWorldMatrix(true, true);
    root.traverse(object => {
        if (!object.userData.machiLettering || !(object instanceof THREE.Mesh)) return;
        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox!;
        faces.push({
            corners: [[box.min.x, box.min.y], [box.min.x, box.max.y], [box.max.x, box.min.y], [box.max.x, box.max.y]]
                .map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(object.matrixWorld)),
            normal: new THREE.Vector3(0, 0, 1).transformDirection(object.matrixWorld),
        });
    });
    return faces;
}

/** Reused scratch vectors; no React updates, canvas resizing or geometry allocation per frame. */
export class MachiRearFraming {
    private readonly point = new THREE.Vector3();
    private readonly direction = new THREE.Vector3();

    fit(camera: THREE.OrthographicCamera, faces: readonly MachiLetteringFace[], safe: RearRect) {
        camera.updateMatrixWorld(true);
        camera.getWorldDirection(this.direction).negate();
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (const face of faces) {
            if (face.normal.dot(this.direction) <= 0.05) continue;
            for (const corner of face.corners) {
                this.point.copy(corner).project(camera);
                const x = (this.point.x + 1) / 2, y = (1 - this.point.y) / 2;
                left = Math.min(left, x); right = Math.max(right, x);
                top = Math.min(top, y); bottom = Math.max(bottom, y);
            }
        }
        if (!Number.isFinite(left)) return;
        const scale = Math.min(1, safe.width / Math.max(1e-6, right - left), safe.height / Math.max(1e-6, bottom - top));
        const width = (right - left) * scale, height = (bottom - top) * scale;
        const x = .5 + ((left + right) / 2 - .5) * scale;
        const y = .5 + ((top + bottom) / 2 - .5) * scale;
        const cx = THREE.MathUtils.clamp(x, safe.left + width / 2, safe.left + safe.width - width / 2);
        const cy = THREE.MathUtils.clamp(y, safe.top + height / 2, safe.top + safe.height - height / 2);
        const halfW = (camera.right - camera.left) / (2 * scale);
        const halfH = (camera.top - camera.bottom) / (2 * scale);
        // OrthographicCamera applies zoom around the frustum center; translation must account for it.
        const centerX = (camera.right + camera.left) / 2 - (cx - x) * 2 * halfW / camera.zoom;
        const centerY = (camera.top + camera.bottom) / 2 + (cy - y) * 2 * halfH / camera.zoom;
        camera.left = centerX - halfW; camera.right = centerX + halfW;
        camera.top = centerY + halfH; camera.bottom = centerY - halfH;
        camera.updateProjectionMatrix();
    }
}
