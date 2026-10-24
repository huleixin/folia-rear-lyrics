// @vitest-environment jsdom
import { createElement as h, Suspense, type ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryCollectionSurfaceProps } from '../../../src/library/core/contracts/suite';
import { createMobileCollectionLoader, scheduleMobileCollectionPreload } from '../../../src/library/suites/mobile/mobileCollectionPreload';

// test/unit/library/mobileCollectionPreload.test.ts
const props = { collection: { name: '真实歌单' } } as LibraryCollectionSurfaceProps;
const module = { default: (value: LibraryCollectionSurfaceProps) => h('p', null, value.collection.name) };
const markup = (Component: ComponentType<LibraryCollectionSurfaceProps>) => renderToString(h(Suspense, { fallback: h('b', null, 'waiting') }, h(Component, props)));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('first collection entry module', () => {
    it('shares one import between speculative loading and actual cold navigation', async () => {
        let resolve!: (value: typeof module) => void;
        const load = vi.fn(() => new Promise<typeof module>(done => { resolve = done; }));
        const loader = createMobileCollectionLoader(load);
        const first = loader.preload();
        expect(loader.preload()).toBe(first);
        expect(markup(loader.Component)).toContain('waiting');
        expect(load).toHaveBeenCalledTimes(1);
        resolve(module); await first;
        expect(markup(loader.Component)).toContain('真实歌单');
        expect(markup(loader.Component)).not.toContain('waiting');
        expect(load).toHaveBeenCalledTimes(1);
    });
    it('renders a preloaded surface synchronously on its very first render, without Suspense fallback', async () => {
        const load = vi.fn(async () => module);
        const loader = createMobileCollectionLoader(load);
        await loader.preload();
        expect(markup(loader.Component)).toBe('<!--$--><p>真实歌单</p><!--/$-->');
        expect(load).toHaveBeenCalledTimes(1);
    });
    it('allows real navigation to retry after a failed speculative load', async () => {
        const load = vi.fn<() => Promise<typeof module>>().mockRejectedValueOnce(Error('offline')).mockResolvedValue(module);
        const loader = createMobileCollectionLoader(load);
        await expect(loader.preload()).rejects.toThrow('offline');
        await loader.preload();
        expect(markup(loader.Component)).not.toContain('waiting');
        expect(load).toHaveBeenCalledTimes(2);
    });
});

describe('idle scheduling lifecycle', () => {
    let hidden = false;
    const preload = vi.fn(async () => module);
    beforeEach(() => {
        hidden = false; preload.mockClear(); vi.useFakeTimers();
        vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16));
        vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    });
    it('waits for a frame and idle time, then runs once', async () => {
        const idle = vi.fn((callback: IdleRequestCallback) => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 20 }), 5));
        vi.stubGlobal('requestIdleCallback', idle); vi.stubGlobal('cancelIdleCallback', clearTimeout);
        const cancel = scheduleMobileCollectionPreload(preload);
        expect(preload).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(16); expect(idle).toHaveBeenCalledTimes(1);
        expect(preload).not.toHaveBeenCalled();
        await vi.runAllTimersAsync(); expect(preload).toHaveBeenCalledTimes(1);
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.runAllTimersAsync(); expect(preload).toHaveBeenCalledTimes(1);
        cancel();
    });
    it.each([0, 20])('cancels pending work on unmount after %ims, including fallback timers', async time => {
        vi.stubGlobal('requestIdleCallback', undefined);
        const cancel = scheduleMobileCollectionPreload(preload);
        await vi.advanceTimersByTimeAsync(time); cancel();
        await vi.runAllTimersAsync(); expect(preload).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('does not wake a background app; resumes once when visible', async () => {
        vi.stubGlobal('requestIdleCallback', undefined);
        hidden = true;
        const cancel = scheduleMobileCollectionPreload(preload);
        await vi.runAllTimersAsync(); expect(preload).not.toHaveBeenCalled();
        hidden = false; document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(20);
        hidden = true; document.dispatchEvent(new Event('visibilitychange'));
        await vi.runAllTimersAsync(); expect(preload).not.toHaveBeenCalled();
        hidden = false; document.dispatchEvent(new Event('visibilitychange'));
        await vi.runAllTimersAsync(); expect(preload).toHaveBeenCalledTimes(1);
        cancel();
    });
    it('handles a failed prefetch without an unhandled rejection or retry loop', async () => {
        vi.stubGlobal('requestIdleCallback', undefined);
        const load = vi.fn(async () => { throw Error('offline'); });
        const cancel = scheduleMobileCollectionPreload(load);
        await vi.runAllTimersAsync(); expect(load).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0); cancel();
    });
});
