import { useLayoutEffect, type RefObject } from 'react';
import { mobileStageSubtitleClearance, resolveMobileStageSubtitleClearance } from '../../../../utils/mobileStageSubtitleClearance';

// src/components/app/overlays/mobile-stage/useMobileStageSubtitleClearance.ts
export function useMobileStageSubtitleClearance(stageRef: RefObject<HTMLDivElement | null>, visible: boolean) {
    useLayoutEffect(() => {
        const stage = stageRef.current;
        const controls = stage?.querySelector<HTMLElement>('.mps-player');
        if (!visible || !stage || !controls) {
            mobileStageSubtitleClearance.set(0);
            return;
        }
        let frame: number | undefined;
        const measure = () => {
            frame = undefined;
            const bottom = resolveMobileStageSubtitleClearance(stage.getBoundingClientRect(), controls.getBoundingClientRect());
            if (mobileStageSubtitleClearance.get() !== bottom) mobileStageSubtitleClearance.set(bottom);
        };
        const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(measure); };
        const observer = new ResizeObserver(schedule);
        observer.observe(stage); observer.observe(controls);
        window.addEventListener('resize', schedule);
        window.visualViewport?.addEventListener('resize', schedule);
        measure();
        return () => {
            observer.disconnect();
            if (frame !== undefined) cancelAnimationFrame(frame);
            window.removeEventListener('resize', schedule);
            window.visualViewport?.removeEventListener('resize', schedule);
            mobileStageSubtitleClearance.set(0);
        };
    }, [stageRef, visible]);
}
