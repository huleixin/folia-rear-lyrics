// @vitest-environment jsdom
import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNativeGlassNav } from '../../src/hooks/useNativeGlassNav';

// test/unit/nativeGlassNav.test.ts
const mock = vi.hoisted(() => ({ mode: 'native', listeners: new Set<() => void>(),
    update: vi.fn(), hide: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }));
vi.mock('../../src/services/glassExperiment', () => ({ GLASS_LAB: true,
    readGlassMode: () => mock.mode,
    subscribeGlassMode: (fn: () => void) => { mock.listeners.add(fn); return () => mock.listeners.delete(fn); },
    glassNative: { update: mock.update, hide: mock.hide, addListener: async () => ({ remove: mock.remove }) },
}));
vi.mock('../../src/utils/stageActivity', () => ({ isMainStageActive: () => true, subscribeMainStageActivity: () => () => undefined }));
let root: Root, host: HTMLDivElement, now: number, nextId: number;
let frames: Map<number, FrameRequestCallback>;
const navigate = () => undefined;
function Harness({ active = true }: { active?: boolean }) {
    const ref = useRef<HTMLElement>(null);
    const ready = useNativeGlassNav(ref, active, '', navigate);
    return React.createElement('footer', { 'data-ready': String(ready) },
        React.createElement('nav', { ref, style: { opacity: 1 } }, React.createElement('button', { 'aria-current': 'page' }, '推荐')));
}
async function render(active = true) { await act(async () => { root.render(React.createElement(Harness, { active })); }); }
async function advance(ms: number) {
    await act(async () => {
        now = ms;
        const queued = [...frames.values()]; frames.clear();
        queued.forEach(callback => callback(now));
    });
}
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    mock.mode = 'native'; mock.listeners.clear(); mock.update.mockReset(); mock.hide.mockClear(); mock.remove.mockClear();
    mock.update.mockImplementation(async (value: any) => ({ active: value.enabled ? value.mode : '' }));
    frames = new Map(); nextId = 0; now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(10, 700, 355, 54));
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('local native glass navigation ownership', () => {
    it('keeps the web baseline free of native work', async () => {
        mock.mode = 'web'; await render(); await advance(500);
        expect(mock.update).not.toHaveBeenCalled(); expect(frames.size).toBe(0);
    });
    it('takes ownership after acknowledgement and stops idle frame/bridge work', async () => {
        await render(); await advance(20); await advance(500);
        expect(host.querySelector('nav')?.dataset.nativeGlass).toBe('native');
        expect(host.querySelector('footer')?.dataset.ready).toBe('true');
        expect(mock.update).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
    });
    it('removes the overlay when a modal suppresses navigation', async () => {
        await render(); await advance(20); const session = mock.update.mock.calls[0][0].session;
        await render(false);
        expect(mock.hide).toHaveBeenCalledWith({ session });
        expect(host.querySelector('nav')?.dataset.nativeGlass).toBeUndefined();
        expect(host.querySelector('footer')?.dataset.ready).toBe('false');
    });
    it('retains visible web controls if native initialization fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        mock.update.mockRejectedValueOnce(new Error('not supported'));
        await render(); await advance(20);
        expect(host.querySelector('nav')?.dataset.nativeGlass).toBeUndefined();
        expect(host.querySelector('footer')?.dataset.ready).toBe('false');
    });
    it('scopes a late cleanup to its old session during mode changes', async () => {
        let finish!: (status: unknown) => void;
        mock.update.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        await render(); await advance(20); const old = mock.update.mock.calls[0][0].session;
        await act(async () => { mock.mode = 'xiaomi'; mock.listeners.forEach(fn => fn()); });
        await advance(40); const next = mock.update.mock.calls[1][0].session;
        await act(async () => finish({ active: 'native' }));
        expect(old).not.toBe(next); expect(mock.hide).toHaveBeenLastCalledWith({ session: old });
        expect(host.querySelector('nav')?.dataset.nativeGlass).toBe('xiaomi');
    });
});
