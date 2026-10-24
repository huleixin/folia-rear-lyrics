// @vitest-environment jsdom
import React, { act, createElement as h, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePlayerChromeHidden } from '@/hooks/useAndroidMobilePlayerStage';
import { useImmersiveChromeReveal } from '@/hooks/useImmersiveChromeReveal';
import { usePlayerChromeAutoHide } from '@/hooks/usePlayerChromeAutoHide';
import { useImmersiveChromeStore } from '@/stores/useImmersiveChromeStore';

// test/unit/hooks/mobilePlayerChrome.test.ts
// Timer/state integration only; no claims about real Android system bars or screenshot fidelity.
vi.mock('@/library/app/librarySuiteChoice', () => ({ useActiveLibrarySuiteId: () => 'mobile' }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const bars = vi.fn(), setPreference = vi.fn();
const storage = new Map<string, string>();
beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); storage.clear();
    storage.set('player_chrome_visibility_mode', 'auto-hide');
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    useImmersiveChromeStore.setState({ immersiveChromeHidden: false });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function Probe({ enabled, player = true }: { enabled: boolean; player?: boolean }) {
    const [classicHidden, setClassicHidden] = useState(false);
    const immersiveHidden = useImmersiveChromeStore(state => state.immersiveChromeHidden);
    usePlayerChromeAutoHide({ autoHidePlayerChrome: true, initialPlayerChromeHidden: false,
        suspended: player, setIsPlayerChromeHidden: setClassicHidden, setAutoHidePlayerChromePreference: setPreference });
    useImmersiveChromeReveal({ immersiveEnabled: enabled, isPlayerView: player, autoHidePlayerChrome: false,
        startHidden: false, onSystemBarsVisible: bars });
    const hidden = resolvePlayerChromeHidden(player, classicHidden, enabled && player && immersiveHidden);
    return h('output', { 'data-hidden': String(hidden) });
}
const hidden = () => host.querySelector('output')!.getAttribute('data-hidden');

describe('one owner for Android mobile player visibility', () => {
    it('keeps mobile controls visible with the switch off despite the saved classic auto-hide setting', () => {
        act(() => root.render(h(Probe, { enabled: false })));
        act(() => vi.advanceTimersByTime(9000));
        expect(hidden()).toBe('false'); expect(vi.getTimerCount()).toBe(0);
        expect(bars).toHaveBeenLastCalledWith(true); expect(setPreference).not.toHaveBeenCalled();
        expect(storage.get('player_chrome_visibility_mode')).toBe('auto-hide');
    });
    it('hides after three seconds, reveals on touch and uses the same clock for system bars', () => {
        act(() => root.render(h(Probe, { enabled: true })));
        expect(hidden()).toBe('false'); expect(vi.getTimerCount()).toBe(1);
        act(() => vi.advanceTimersByTime(2999)); expect(hidden()).toBe('false');
        act(() => vi.advanceTimersByTime(1)); expect(hidden()).toBe('true');
        expect(bars).toHaveBeenLastCalledWith(false);
        act(() => window.dispatchEvent(new Event('pointerdown'))); expect(hidden()).toBe('false');
        expect(bars).toHaveBeenLastCalledWith(true);
        act(() => vi.advanceTimersByTime(3000)); expect(hidden()).toBe('true');
    });
    it('reveals immediately when disabled and an expired idle timer cannot hide it again', () => {
        act(() => root.render(h(Probe, { enabled: true })));
        act(() => vi.advanceTimersByTime(3000)); expect(hidden()).toBe('true');
        act(() => root.render(h(Probe, { enabled: false }))); expect(hidden()).toBe('false');
        act(() => window.dispatchEvent(new Event('pointerdown')));
        act(() => vi.advanceTimersByTime(6000)); expect(hidden()).toBe('false');
        expect(vi.getTimerCount()).toBe(0); expect(bars).toHaveBeenLastCalledWith(true);
    });
    it('cleans up the immersive timer when leaving the player and restores the classic owner', () => {
        act(() => root.render(h(Probe, { enabled: true }))); act(() => vi.advanceTimersByTime(1000));
        act(() => root.render(h(Probe, { enabled: true, player: false })));
        expect(bars).toHaveBeenLastCalledWith(true);
        act(() => vi.advanceTimersByTime(3000)); expect(hidden()).toBe('true');
        expect(setPreference).not.toHaveBeenCalled();
        act(() => root.render(h(Probe, { enabled: true }))); expect(hidden()).toBe('false');
        act(() => root.render(null)); expect(vi.getTimerCount()).toBe(0);
    });
    it.each([
        [true, true, false, false], [true, false, true, true],
        [false, true, false, true], [false, false, true, true], [false, false, false, false],
    ])('visibility policy mobile=%s classic=%s immersive=%s', (mobile, classic, immersive, expected) => {
        expect(resolvePlayerChromeHidden(mobile, classic, immersive)).toBe(expected);
    });
});
