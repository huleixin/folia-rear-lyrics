import { useEffect } from 'react';

// src/hooks/useMobileScrollbars.ts
// Covers legacy search/settings/dialog scroll areas without changing their layout components.
export function useMobileScrollbars(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;
        const root = document.documentElement;
        root.dataset.foliaMobileScrollbars = 'true';
        const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
        const scroll = (event: Event) => {
            const node = event.target;
            if (!(node instanceof HTMLElement) || node.closest('.mobile-library')) return;
            clearTimeout(timers.get(node));
            if (!node.hasAttribute('data-folia-scrolling')) node.dataset.foliaScrolling = 'true';
            timers.set(node, setTimeout(() => {
                delete node.dataset.foliaScrolling;
                timers.delete(node);
            }, 1000));
        };
        document.addEventListener('scroll', scroll, { capture: true, passive: true });
        return () => {
            document.removeEventListener('scroll', scroll, true);
            delete root.dataset.foliaMobileScrollbars;
            timers.forEach((timer, node) => { clearTimeout(timer); delete node.dataset.foliaScrolling; });
        };
    }, [enabled]);
}
