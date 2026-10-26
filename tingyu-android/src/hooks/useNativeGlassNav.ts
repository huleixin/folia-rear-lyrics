import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { GLASS_LAB, glassNative, readGlassMode, subscribeGlassMode, type GlassFrame } from '../services/glassExperiment';
import { isMainStageActive, subscribeMainStageActivity } from '../utils/stageActivity';

// src/hooks/useNativeGlassNav.ts
// No idle polling. Track the existing short footer transition only while its pose changes.
export function useNativeGlassNav(ref: RefObject<HTMLElement | null>, active: boolean, stateKey: string, onNavigate: (index: number) => void) {
    const mode = useSyncExternalStore(subscribeGlassMode, readGlassMode);
    const [nativeReady, setNativeReady] = useState(false);
    useLayoutEffect(() => {
        const nav = ref.current;
        if (!GLASS_LAB || !nav || mode === 'web' || !active) return;
        const session = crypto.randomUUID();
        let disposed = false, ready = false, frame = 0, deadline = 0, busy = false, pending: GlassFrame | null = null, last = '';
        let remove: (() => Promise<void>) | undefined;
        const publish = async (value: GlassFrame) => {
            pending = value;
            if (busy) return;
            busy = true;
            try {
                while (pending && !disposed) {
                    const next = pending; pending = null;
                    const status = await glassNative.update(next);
                    if (!disposed && status.active === mode) {
                        nav.dataset.nativeGlass = mode;
                        if (!ready) { ready = true; setNativeReady(true); }
                    }
                }
            } catch (error) {
                delete nav.dataset.nativeGlass;
                setNativeReady(false);
                console.warn('[GlassLab] Keeping web navigation after native failure', error);
                void glassNative.hide({ session }).catch(() => undefined);
            } finally { busy = false; if (disposed) void glassNative.hide({ session }).catch(() => undefined); }
        };
        const measure = () => {
            frame = 0;
            if (disposed) return;
            const rect = nav.getBoundingClientRect(), style = getComputedStyle(nav);
            const buttons = [...nav.querySelectorAll('button')];
            const footer = nav.closest('footer');
            const enabled = isMainStageActive() && !footer?.closest('[inert]') && style.visibility !== 'hidden'
                && nav.getAttribute('aria-hidden') !== 'true' && rect.width > 0 && rect.height > 0;
            const value: GlassFrame = { session, enabled, mode, left: rect.left, top: rect.top, width: rect.width, height: rect.height,
                viewportWidth: innerWidth, alpha: Number(style.opacity), selected: buttons.findIndex(b => b.getAttribute('aria-current') === 'page'),
                labels: buttons.map(button => button.textContent?.trim() ?? '') };
            const key = JSON.stringify(value);
            if (key !== last) { last = key; void publish(value); }
            if (performance.now() < deadline) frame = requestAnimationFrame(measure);
        };
        const schedule = () => {
            deadline = performance.now() + 400;
            if (!frame) frame = requestAnimationFrame(measure);
        };
        void glassNative.addListener('navigate', ({ index }) => { if (!disposed) onNavigate(index); })
            .then(listener => { if (disposed) void listener.remove(); else remove = () => listener.remove(); })
            .catch(error => console.warn('[GlassLab] Native navigation listener unavailable', error));
        const resize = new ResizeObserver(schedule); resize.observe(nav);
        const mutations = new MutationObserver(schedule);
        mutations.observe(nav, { attributes: true, attributeFilter: ['aria-hidden', 'inert'] });
        if (nav.parentElement) mutations.observe(nav.parentElement, { attributes: true, attributeFilter: ['inert'] });
        const unsubscribe = subscribeMainStageActivity(schedule);
        window.addEventListener('resize', schedule); window.visualViewport?.addEventListener('resize', schedule);
        schedule();
        return () => {
            disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); unsubscribe();
            window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule);
            delete nav.dataset.nativeGlass; void remove?.(); void glassNative.hide({ session }).catch(() => undefined);
            setNativeReady(false);
        };
    }, [mode, ref, active, stateKey, onNavigate]);
    return nativeReady;
}
