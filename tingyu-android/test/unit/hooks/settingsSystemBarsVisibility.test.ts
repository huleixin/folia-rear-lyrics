// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useSettingsSystemBarsVisibility } from '@/hooks/useSettingsSystemBarsVisibility';
import { useImmersiveChromeReveal } from '@/hooks/useImmersiveChromeReveal';
import { useImmersiveChromeStore } from '@/stores/useImmersiveChromeStore';

// test/unit/hooks/settingsSystemBarsVisibility.test.ts
const bars = vi.hoisted(() => vi.fn());
vi.mock('@/services/androidMainSystemBars', () => ({ setAndroidMainSystemBarsVisible: bars }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('settings system bars over the existing player reveal timer', () => {
    it('holds bars visible while settings are open and restores the latest player request on close', () => {
        const root = createRoot(document.createElement('div'));
        let request!: (visible: boolean) => void;
        const Probe = ({ open }: { open: boolean }) => { request = useSettingsSystemBarsVisibility(open); return null; };
        try {
            act(() => root.render(React.createElement(Probe, { open: false })));
            const stableCallback = request;
            request(false); expect(bars).toHaveBeenLastCalledWith(false);
            act(() => root.render(React.createElement(Probe, { open: true })));
            expect(request).toBe(stableCallback); expect(bars).toHaveBeenLastCalledWith(true);
            request(false); expect(bars).toHaveBeenLastCalledWith(true);
            act(() => root.render(React.createElement(Probe, { open: false })));
            expect(bars).toHaveBeenLastCalledWith(false);
            request(true); expect(bars).toHaveBeenLastCalledWith(true);
        } finally { act(() => root.unmount()); }
    });
    it('does not replace or restart the player idle timer while entering and leaving settings', () => {
        vi.useFakeTimers();
        const root = createRoot(document.createElement('div'));
        const Probe = ({ open }: { open: boolean }) => {
            const onSystemBarsVisible = useSettingsSystemBarsVisibility(open);
            useImmersiveChromeReveal({ immersiveEnabled: true, isPlayerView: true, autoHidePlayerChrome: false, startHidden: false, onSystemBarsVisible });
            return null;
        };
        try {
            act(() => root.render(React.createElement(Probe, { open: false })));
            expect(useImmersiveChromeStore.getState().immersiveChromeHidden).toBe(false);
            act(() => vi.advanceTimersByTime(1000));
            act(() => root.render(React.createElement(Probe, { open: true })));
            act(() => vi.advanceTimersByTime(2000));
            expect(useImmersiveChromeStore.getState().immersiveChromeHidden).toBe(true);
            expect(bars).toHaveBeenLastCalledWith(true);
            act(() => root.render(React.createElement(Probe, { open: false })));
            expect(useImmersiveChromeStore.getState().immersiveChromeHidden).toBe(true);
            expect(bars).toHaveBeenLastCalledWith(false);
            act(() => window.dispatchEvent(new Event('pointerdown')));
            expect(useImmersiveChromeStore.getState().immersiveChromeHidden).toBe(false);
        } finally { act(() => root.unmount()); vi.useRealTimers(); }
    });
});
