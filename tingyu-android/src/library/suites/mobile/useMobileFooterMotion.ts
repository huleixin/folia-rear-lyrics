import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useReducedMotionFor } from '../../../hooks/useReducedMotionFor';
import { useMotionSettingsStore } from '../../../stores/useMotionSettingsStore';
import { createMobileFooterMotion } from './mobileFooterMotion';

// src/library/suites/mobile/useMobileFooterMotion.ts
export function useMobileFooterMotion(footerRef: RefObject<HTMLElement | null>, navRef: RefObject<HTMLElement | null>, detail: boolean) {
    const reduced = useReducedMotionFor('uiMicroMotion');
    // This approved transition also follows the system accessibility preference, without changing global settings.
    const systemReduced = useMotionSettingsStore(state => state.systemPrefersReducedMotion);
    const calm = reduced || systemReduced;
    const latest = useRef({ detail, calm });
    latest.current = { detail, calm };
    const runtime = useRef<ReturnType<typeof createMobileFooterMotion> | null>(null);
    useLayoutEffect(() => {
        const footer = footerRef.current, nav = navRef.current;
        const mini = footer?.querySelector<HTMLElement>(':scope > .ml-mini');
        if (!footer || !nav || !mini) return;
        const wide = window.matchMedia('(min-width:840px)');
        let motion: ReturnType<typeof createMobileFooterMotion> | null = null;
        const configure = () => {
            motion?.destroy(); motion = null; runtime.current = null;
            if (!wide.matches) { motion = createMobileFooterMotion(footer, mini, nav); runtime.current = motion; motion.update(latest.current.detail, latest.current.calm); }
        };
        configure();
        wide.addEventListener('change', configure);
        const resize = new ResizeObserver(() => motion?.resize());
        resize.observe(nav);
        return () => { resize.disconnect(); wide.removeEventListener('change', configure); motion?.destroy(); runtime.current = null; };
    }, [footerRef, navRef]);
    useLayoutEffect(() => { runtime.current?.update(detail, calm); }, [detail, calm]);
}
