import { useLayoutEffect, type RefObject } from 'react';
import { isMainStageActive, subscribeMainStageActivity } from '../utils/stageActivity';

// src/hooks/useMobileGlass.ts
// Shared phone material: compositor blur only; no displacement map, measurement loop or bridge.
export function useMobileGlass(ref: RefObject<HTMLElement | null>, enabled = true) {
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node || !enabled) return;
        const update = () => {
            node.dataset.softGlass = !document.hidden && isMainStageActive() ? 'active' : 'sleeping';
        };
        update(); const unsubscribe = subscribeMainStageActivity(update);
        return () => { unsubscribe(); delete node.dataset.softGlass; };
    }, [ref, enabled]);
}
