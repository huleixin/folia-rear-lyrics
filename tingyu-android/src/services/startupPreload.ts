import { createElement, lazy, type ComponentType } from 'react';
import { navigationMark } from './navigationTiming';
import { canUseComposeChrome } from './nativeChrome';
import { canUseNativePages } from './nativePages';
import { canUseNativePanels } from './nativePanels';
import { prewarmNativePlayerArtwork } from './nativeCoverThumbnail';
import { usePlaybackStore, selectDisplayCoverUrl } from '../stores/usePlaybackStore';

// src/services/startupPreload.ts
// Preloads interactive surfaces during startup and unwraps their default exports
// so the first click renders synchronously without React.lazy suspension.

type ModuleWithDefault<P> = { default: ComponentType<P> };
type PreloadTask = () => Promise<unknown>;

const tasks = new Set<PreloadTask>();
let warmupPromise: Promise<void> | undefined;

export function registerStartupPreload(task: PreloadTask): () => void {
    tasks.add(task);
    return () => {
        tasks.delete(task);
    };
}

export function createPreloadableComponent<P extends object>(load: () => Promise<ModuleWithDefault<P>>) {
    let resolved: ModuleWithDefault<P> | undefined;
    let pending: Promise<ModuleWithDefault<P>> | undefined;
    const preload = () => {
        if (!pending) {
            pending = load().then(
                module => {
                    resolved = module;
                    return module;
                },
                error => {
                    pending = undefined;
                    throw error;
                },
            );
        }
        return pending;
    };
    const LazyComponent = lazy(preload);
    function Component(props: P) {
        return createElement(resolved?.default ?? LazyComponent, props);
    }
    registerStartupPreload(preload);
    return { preload, Component, isLoaded: () => Boolean(resolved) };
}

// Run all registered interactive surface preloads plus native capability & cover warmups.
export function preloadStartupInteractiveSurfaces(timeoutMs = 420): Promise<void> {
    if (!warmupPromise) {
        const started = performance.timeOrigin + performance.now();
        navigationMark('startup-interactive-preload-start');
        const coverUrl = selectDisplayCoverUrl(usePlaybackStore.getState());
        if (coverUrl) {
            void prewarmNativePlayerArtwork(coverUrl);
        }
        const all = Promise.allSettled([
            canUseComposeChrome(),
            canUseNativePages(),
            canUseNativePanels(),
            ...Array.from(tasks, task => {
                try {
                    return Promise.resolve(task());
                } catch (error) {
                    return Promise.reject(error);
                }
            }),
        ]).then(() => {
            navigationMark('startup-interactive-preload-end', started);
        });
        warmupPromise = all;
    }
    if (timeoutMs <= 0) {
        return warmupPromise;
    }
    return Promise.race([
        warmupPromise,
        new Promise<void>(resolve => {
            window.setTimeout(resolve, timeoutMs);
        }),
    ]);
}
