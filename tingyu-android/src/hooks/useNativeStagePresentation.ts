import { useLayoutEffect, useRef, useState } from 'react';
import { PREHIDE_COMPOSE_CHROME } from '../services/nativeChrome';
import { setVisualizerRenderingSuspended } from '../utils/visualizerFrameChannel';

// src/hooks/useNativeStagePresentation.ts
// Paint the retained native destination before retiring the hidden stage's GPU resources.
export function useNativeStagePresentation<T>(visible: boolean, active: boolean, model: T) {
    const [retained, setRetained] = useState(visible);
    const lastModel = useRef(model);
    if (visible || !PREHIDE_COMPOSE_CHROME) lastModel.current = model;
    useLayoutEffect(() => {
        if (!PREHIDE_COMPOSE_CHROME) return;
        if (visible || !active) {
            setRetained(visible); setVisualizerRenderingSuspended(false); return;
        }
        let idle = 0, timer = 0, second = 0;
        const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => {
            const retire = () => setRetained(false);
            if (window.requestIdleCallback) idle = window.requestIdleCallback(retire, { timeout: 160 });
            else timer = window.setTimeout(retire, 32);
        }); });
        return () => {
            cancelAnimationFrame(first); cancelAnimationFrame(second); clearTimeout(timer);
            if (idle) window.cancelIdleCallback(idle);
        };
    }, [visible, active]);
    useLayoutEffect(() => {
        if (PREHIDE_COMPOSE_CHROME && !visible && !retained) setVisualizerRenderingSuspended(false);
    }, [visible, retained]);
    return { mounted: active && (visible || retained), model: lastModel.current };
}
