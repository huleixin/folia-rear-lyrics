// @vitest-environment jsdom
import { act, createElement as h, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mobileStageSubtitleClearance, resolveHostSubtitleBottom, resolveMobileStageSubtitleClearance } from '../../../src/utils/mobileStageSubtitleClearance';
import { useMobileStageSubtitleClearance } from '../../../src/components/app/overlays/mobile-stage/useMobileStageSubtitleClearance';
import { PlayerBottomBarLayoutContext } from '../../../src/components/floating-player/PlayerBottomBarLayoutContext';
import { usePlayerSubtitleBottomPx } from '../../../src/hooks/usePlayerBottomBarBottomPx';

// test/unit/hooks/mobileStageSubtitleClearance.test.ts
// Geometry/lifecycle checks only; jsdom is not evidence of actual WebView rendering.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
let callbacks: ResizeObserverCallback[];
const disconnect = vi.fn();
beforeEach(() => {
    mobileStageSubtitleClearance.set(0); callbacks = []; disconnect.mockClear();
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
        observe() {} disconnect = disconnect;
    });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); mobileStageSubtitleClearance.set(0); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([360, 393, 430])('places the subtitle above the actual control bounds at %ipx, including multiline text', width => {
    const stage = new DOMRect(0, 0, width, 860);
    const controls = new DOMRect(16, 700, width - 32, 140);
    const bottom = resolveMobileStageSubtitleClearance(stage, controls);
    expect(bottom).toBe(184);
    for (const textHeight of [22, 44, 66]) {
        const subtitleBottom = stage.bottom - bottom;
        expect(subtitleBottom).toBeLessThan(controls.top);
        expect(subtitleBottom - textHeight).toBeGreaterThan(0);
    }
    expect(resolveHostSubtitleBottom(112, bottom, true)).toBe(bottom);
    expect(resolveHostSubtitleBottom(250, bottom, true)).toBe(250);
    expect(resolveHostSubtitleBottom(112, bottom, false)).toBe(112);
});

it('ignores zero-sized or detached controls', () => {
    const stage = new DOMRect(0, 0, 393, 860);
    expect(resolveMobileStageSubtitleClearance(stage, new DOMRect())).toBe(0);
    expect(resolveMobileStageSubtitleClearance(stage, new DOMRect(0, 900, 393, 140))).toBe(0);
});

it('measures only the front controls and clears the signal when hidden or unmounted', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
        return this.className === 'mps-player' ? new DOMRect(16, 700, 361, 140) : new DOMRect(0, 0, 393, 860);
    });
    function Stage({ visible }: { visible: boolean }) {
        const ref = useRef<HTMLDivElement>(null);
        useMobileStageSubtitleClearance(ref, visible);
        return h('div', { ref }, h('section', { className: 'mps-player' }));
    }
    await act(async () => root.render(h(Stage, { visible: true })));
    expect(mobileStageSubtitleClearance.get()).toBe(184);
    expect(callbacks.length).toBe(1);
    await act(async () => root.render(h(Stage, { visible: false })));
    expect(mobileStageSubtitleClearance.get()).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(1);
    await act(async () => root.render(h(Stage, { visible: true })));
    expect(mobileStageSubtitleClearance.get()).toBe(184);
    await act(async () => root.render(null));
    expect(mobileStageSubtitleClearance.get()).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
});

it('keeps the real subtitle hook unchanged outside the front player host, even with a published front clearance', async () => {
    mobileStageSubtitleClearance.set(220);
    const values: number[] = [];
    function SubtitleProbe() { values.push(usePlayerSubtitleBottomPx(false).get()); return null; }
    await act(async () => root.render(h(PlayerBottomBarLayoutContext.Provider, { value: false }, h(SubtitleProbe))));
    expect(values.at(-1)).toBe(112);
    await act(async () => root.render(h(PlayerBottomBarLayoutContext.Provider, { value: true }, h(SubtitleProbe))));
    expect(values.at(-1)).toBe(220);
});
