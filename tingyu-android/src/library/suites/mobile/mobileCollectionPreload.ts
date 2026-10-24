import { createElement, lazy, type ComponentType } from 'react';
import type { LibraryCollectionSurfaceProps } from '../../core/contracts/suite';

// src/library/suites/mobile/mobileCollectionPreload.ts
type CollectionModule = { default: ComponentType<LibraryCollectionSurfaceProps> };

// Share the import with the entry renderer. A fulfilled import must render synchronously:
// handing an already-fulfilled Promise to React.lazy still suspends on its first render.
export function createMobileCollectionLoader(load: () => Promise<CollectionModule>) {
    let resolved: CollectionModule | undefined;
    let pending: Promise<CollectionModule> | undefined;
    const preload = () => {
        if (!pending) pending = load().then(module => {
            resolved = module;
            return module;
        }, error => {
            pending = undefined; // A failed speculative import must not poison the real navigation.
            throw error;
        });
        return pending;
    };
    const LazyCollection = lazy(preload);
    function Component(props: LibraryCollectionSurfaceProps) {
        return createElement(resolved?.default ?? LazyCollection, props);
    }
    return { preload, Component };
}

export const mobileCollectionLoader = createMobileCollectionLoader(() => import('./MobileCollection'));

// One cancellable idle job after the browsing page has had a frame. Never mount a hidden
// detail page, fetch playlists, or keep timers running while the app is in the background.
export function scheduleMobileCollectionPreload(preload: () => Promise<unknown>) {
    let stopped = false;
    let frame: number | undefined;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
        if (frame !== undefined) cancelAnimationFrame(frame);
        if (idle !== undefined) window.cancelIdleCallback(idle);
        clearTimeout(timer);
        frame = idle = undefined;
        timer = undefined;
    };
    const run = () => {
        clear();
        if (stopped || document.hidden) return;
        stopped = true;
        document.removeEventListener('visibilitychange', visibility);
        void preload().catch(() => { /* Retry on touch or actual navigation. */ });
    };
    const schedule = () => {
        if (stopped || document.hidden || frame !== undefined) return;
        frame = requestAnimationFrame(() => {
            frame = undefined;
            if (typeof window.requestIdleCallback === 'function') {
                idle = window.requestIdleCallback(run, { timeout: 1500 });
            } else timer = setTimeout(run, 120);
        });
    };
    const visibility = () => { clear(); if (!document.hidden) schedule(); };
    document.addEventListener('visibilitychange', visibility);
    schedule();
    return () => {
        stopped = true;
        clear();
        document.removeEventListener('visibilitychange', visibility);
    };
}
