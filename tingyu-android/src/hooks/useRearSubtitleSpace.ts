import { useLayoutEffect, useState, type RefObject } from 'react';
import { getRearSafeInset } from '../utils/visualizerSurface';

// src/hooks/useRearSubtitleSpace.ts
// Reserve the actual translation/romanization height, never the auto-hiding playback controls or upcoming hints.
export function useRearSubtitleSpace(host: RefObject<HTMLDivElement | null>, enabled: boolean) {
    const [height, setHeight] = useState(0);
    useLayoutEffect(() => {
        if (!enabled || !getRearSafeInset() || !host.current) {
            setHeight(0);
            return;
        }
        let observed: HTMLElement | null = null;
        const refresh = () => {
            const next = host.current?.querySelector<HTMLElement>('[data-subtitle-track]')?.parentElement ?? null;
            if (next !== observed) {
                if (observed) resize.unobserve(observed);
                observed = next;
                if (next) resize.observe(next);
            }
            const value = next ? Math.ceil(next.offsetHeight) + 8 : 0;
            setHeight((previous) => (previous === value ? previous : value));
        };
        const resize = new ResizeObserver(refresh);
        const mutation = new MutationObserver(refresh);
        mutation.observe(host.current, { childList: true, subtree: true });
        refresh();
        return () => {
            resize.disconnect();
            mutation.disconnect();
        };
    }, [host, enabled]);
    return height;
}
