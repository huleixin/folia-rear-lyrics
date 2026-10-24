// @vitest-environment jsdom
import React, { act, createElement as h, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerChromeMode } from '@/hooks/usePlayerChromeMode';
import { useAndroidLayoutSettingsStore } from '@/stores/useAndroidLayoutSettingsStore';

// test/unit/hooks/mobilePlayerMode.test.ts
const surface = vi.hoisted(() => ({ mobile: true }));
vi.mock('@/hooks/useAndroidMobilePlayerStage', () => ({ useAndroidMobilePlayerStage: () => surface.mobile }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const storage = new Map<string, string>(), setPreference = vi.fn(), status = vi.fn();
beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); storage.clear(); surface.mobile = true;
    storage.set('player_chrome_visibility_mode', 'always-hidden');
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
    useAndroidLayoutSettingsStore.setState({ immersiveModeEnabled: false });
    host = document.createElement('div'); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
function Probe({ autoHide = false }: { autoHide?: boolean }) {
    const [hidden, setHidden] = useState(false);
    const mode = usePlayerChromeMode({ autoHidePlayerChrome: autoHide, initialPlayerChromeHidden: hidden,
        setIsPlayerChromeHidden: setHidden, setAutoHidePlayerChromePreference: setPreference, onModeChange: status });
    return h('button', { onClick: mode.cyclePlayerChromeVisibilityMode }, mode.playerChromeVisibilityMode);
}
describe('mobile settings, shortcut and remote mode consistency', () => {
    it('cycles the same mobile switch without changing the saved classic mode', () => {
        act(() => root.render(h(Probe))); expect(host.textContent).toBe('always-visible');
        act(() => host.querySelector('button')!.click()); expect(host.textContent).toBe('auto-hide');
        expect(storage.get('folia_android_immersive_mode')).toBe('true');
        expect(status).toHaveBeenLastCalledWith('auto-hide');
        act(() => host.querySelector('button')!.click()); expect(host.textContent).toBe('always-visible');
        expect(storage.get('folia_android_immersive_mode')).toBe('false');
        expect(storage.get('player_chrome_visibility_mode')).toBe('always-hidden');
        expect(setPreference).not.toHaveBeenCalled();
    });
    it('reports the mobile preference even when the classic setting has auto-hide enabled', () => {
        storage.set('player_chrome_visibility_mode', 'auto-hide');
        act(() => root.render(h(Probe, { autoHide: true }))); expect(host.textContent).toBe('always-visible');
        act(() => useAndroidLayoutSettingsStore.getState().setImmersiveModeEnabled(true));
        expect(host.textContent).toBe('auto-hide'); expect(setPreference).not.toHaveBeenCalled();
    });
    it('keeps the existing three-state cycle for other players', () => {
        surface.mobile = false;
        act(() => root.render(h(Probe))); expect(host.textContent).toBe('always-hidden');
        act(() => host.querySelector('button')!.click()); expect(host.textContent).toBe('always-visible');
        act(() => host.querySelector('button')!.click()); expect(host.textContent).toBe('auto-hide');
        expect(setPreference).toHaveBeenLastCalledWith(true);
        expect(useAndroidLayoutSettingsStore.getState().immersiveModeEnabled).toBe(false);
    });
});
