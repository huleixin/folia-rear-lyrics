// @vitest-environment jsdom
import { act, createElement as h, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NativeStageLayout } from '../../../src/services/nativeChrome';
import { nativeLandscapeSubtitleBottom, resolveHostSubtitleBottom } from '../../../src/utils/mobileStageSubtitleClearance';
import { resolveNativeStageSubtitleBottom, useNativeStageSubtitleBottom } from '../../../src/components/app/overlays/mobile-stage/useNativeStageSubtitleBottom';

// test/unit/hooks/nativeStageSubtitleBottom.test.ts
const bridge = vi.hoisted(() => ({ addListener: vi.fn(), getStageLayout: vi.fn(), remove: vi.fn() }));
vi.mock('../../../src/services/nativeChrome', () => ({ PREHIDE_COMPOSE_CHROME: true, chromeNative: bridge }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const shown: NativeStageLayout = { active: true, width: 852, height: 393, safeBottom: 12,
    shown: true, shownBottom: 126, hiddenBottom: 20, durationMs: 0 };
let root: Root, host: HTMLDivElement;
let receive: (layout: NativeStageLayout) => void;
function Probe() { const ref = useRef<HTMLDivElement>(null); useNativeStageSubtitleBottom(ref); return h('div', { ref }); }
beforeEach(() => {
    bridge.addListener.mockImplementation((_event, listener) => { receive = listener; return Promise.resolve({ remove: bridge.remove }); });
    bridge.getStageLayout.mockResolvedValue(shown); bridge.remove.mockResolvedValue(undefined);
    vi.stubGlobal('innerWidth', 852); vi.stubGlobal('innerHeight', 393);
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('follows the control translation then stops eight dp above the bottom safe area', () => {
    expect(resolveNativeStageSubtitleBottom(shown, 1, 852)).toBe(126);
    expect(resolveNativeStageSubtitleBottom(shown, .5, 852)).toBe(67);
    expect(resolveNativeStageSubtitleBottom(shown, 0, 852)).toBe(20);
    expect(resolveNativeStageSubtitleBottom(shown, 1, 426)).toBe(63);
    expect(resolveHostSubtitleBottom(250, 220, true, 20)).toBe(20);
    expect(resolveHostSubtitleBottom(250, 220, false, 20)).toBe(250);
    expect(resolveNativeStageSubtitleBottom({ ...shown, active: false }, 1, 852)).toBe(-1);
    expect(resolveNativeStageSubtitleBottom({ ...shown, width: 393, height: 852 }, 1, 393)).toBe(-1);
    expect(resolveNativeStageSubtitleBottom({} as NativeStageLayout, 1, 852)).toBe(-1);
});

it('clears on rotation and unmount and removes its listener', async () => {
    await act(async () => root.render(h(Probe)));
    expect(nativeLandscapeSubtitleBottom.get()).toBe(126);
    vi.stubGlobal('innerWidth', 393); vi.stubGlobal('innerHeight', 852);
    window.dispatchEvent(new Event('resize'));
    expect(nativeLandscapeSubtitleBottom.get()).toBe(-1);
    await act(async () => root.render(null));
    expect(bridge.remove).toHaveBeenCalledOnce();
    receive(shown);
    expect(nativeLandscapeSubtitleBottom.get()).toBe(-1);
});

it('does not let a late initial reply overwrite a newer layout event', async () => {
    let reply!: (value: NativeStageLayout) => void;
    bridge.getStageLayout.mockReturnValueOnce(new Promise<NativeStageLayout>(resolve => { reply = resolve; }));
    await act(async () => root.render(h(Probe)));
    receive({ ...shown, shown: false });
    expect(nativeLandscapeSubtitleBottom.get()).toBe(20);
    await act(async () => reply(shown));
    expect(nativeLandscapeSubtitleBottom.get()).toBe(20);
});
