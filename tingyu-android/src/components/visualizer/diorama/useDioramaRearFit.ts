import { useLayoutEffect, useMemo, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { getRearSafeInset } from '../../../utils/visualizerSurface';
import { DioramaRearFit } from './dioramaRearFit';

// src/components/visualizer/diorama/useDioramaRearFit.ts
// Resize-aware controller and opt-in development probe; the existing scene frame calls apply after its camera update.
export function useDioramaRearFit(groupRef: RefObject<THREE.Group | null>, ink: THREE.Box3 | null, reservedBottom = 0) {
    const { size, camera } = useThree();
    const safe = getRearSafeInset();
    const fit = useMemo(
        () =>
            safe && size.width > 0 && size.height > 0
                ? new DioramaRearFit(size.width, size.height, {
                      ...safe,
                      height: Math.max(safe.height * 0.3, safe.height - reservedBottom),
                  })
                : null,
        [size.width, size.height, safe?.left, safe?.top, safe?.width, safe?.height, reservedBottom]
    );
    useLayoutEffect(() => {
        if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('probe')) return;
        const target = window as unknown as { __dioramaRearProbe?: () => unknown };
        const read = () => {
            const group = groupRef.current;
            if (!fit || !group || !ink) return null;
            group.updateWorldMatrix(true, true);
            const bounds = fit.project(group, camera, ink);
            const mats: number[] = [];
            group.traverse((object) => {
                const mesh = object as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
                if (mesh.renderOrder === 19 && mesh.material) mats.push(mesh.material.opacity);
            });
            return {
                bounds: { ...bounds },
                safe,
                index: group.userData.lineIndex,
                matrix: group.matrix.toArray(),
                minOpacity: Math.min(...mats),
                rows: group.userData.rows,
            };
        };
        target.__dioramaRearProbe = read;
        return () => {
            if (target.__dioramaRearProbe === read) delete target.__dioramaRearProbe;
        };
    }, [fit, camera, groupRef, ink, safe?.left, safe?.top, safe?.width, safe?.height]);
    return fit;
}
