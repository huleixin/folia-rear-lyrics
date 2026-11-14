// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MobileStageMenu from '@/components/app/overlays/mobile-stage/MobileStageMenu';

// test/unit/hooks/mobileStageMenu.test.ts
const callbacks = vi.hoisted(() => ({ animate: null as null | ((target: { opacity: number }) => void),
    openSettings: vi.fn(), closed: vi.fn() }));
vi.mock('framer-motion', () => ({ motion: { div: React.forwardRef((props: any, ref) => {
    callbacks.animate = props.onAnimationComplete;
    const { initial, animate, transition, onAnimationComplete, ...dom } = props;
    return React.createElement('div', { ...dom, ref });
}) } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/shared/useLiquidReduced', () => ({ useLiquidReduced: () => false }));
vi.mock('@/services/modalBackStack', () => ({ registerModalBack: () => () => {} }));
vi.mock('@/components/app/dialogs/settingsModule', () => ({ warmSettingsModule: () => {} }));
vi.mock('@/stores/useSettingsModalStore', () => ({ openSettings: callbacks.openSettings }));
vi.mock('@/stores/useAudioSettingsStore', () => ({ useAudioSettingsStore: (select: any) => select({
    audioQuality: 'standard', audioEqualizerSettings: { enabled: false },
}) }));
vi.mock('@/stores/useAudioToolsStore', () => ({ useAudioToolsStore: {}, QUALITY_LABELS: { standard: 'Standard' } }));
vi.mock('@/stores/useAppViewStore', () => ({ useAppViewStore: {} }));
vi.mock('@/stores/useSleepTimerStore', () => ({ useSleepTimerStore: {} }));
vi.mock('@/services/nativeMinimalQueue', () => ({ openNativeQueueSheet: async () => true }));
vi.mock('@/services/nativeMinimalTools', () => ({ openNativeToolPage: async () => true }));
vi.mock('@/services/nativePlayerSleep', () => ({ openNativeSleepTimer: async () => true }));

let host: HTMLDivElement, root: ReturnType<typeof createRoot>, reopen: () => void;
beforeEach(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers(); callbacks.openSettings.mockReset(); callbacks.closed.mockReset();
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    function Harness() {
        const [closing, setClosing] = useState(false);
        reopen = () => setClosing(false);
        return React.createElement(MobileStageMenu, { closing, onClose: () => setClosing(true), onClosed: callbacks.closed });
    }
    await act(async () => root.render(React.createElement(Harness)));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
const selectSettings = () => act(() => {
    [...host.querySelectorAll('button')].find(button => button.textContent?.includes('mobileStage.playbackSettings'))!.click();
});
it('opens playback settings exactly once when the animation never completes', async () => {
    selectSettings();
    act(() => callbacks.animate!({ opacity: 1 })); // A stale entry completion cannot trigger navigation.
    await act(async () => vi.advanceTimersByTime(160));
    expect(callbacks.openSettings).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(120));
    expect(callbacks.openSettings).toHaveBeenCalledExactlyOnceWith('options', 'playback');
    act(() => callbacks.animate!({ opacity: 0 }));
    expect(callbacks.closed).toHaveBeenCalledTimes(1);
    expect(callbacks.openSettings).toHaveBeenCalledTimes(1);
});
it('uses a normal exit completion without waiting for the fallback timer', async () => {
    selectSettings(); act(() => callbacks.animate!({ opacity: 0 }));
    expect(callbacks.openSettings).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(callbacks.closed).toHaveBeenCalledTimes(1);
    expect(callbacks.openSettings).toHaveBeenCalledTimes(1);
});
it('cancels pending navigation and late exit callbacks when reopened', async () => {
    selectSettings(); const oldCompletion = callbacks.animate!;
    act(reopen);
    await act(async () => vi.advanceTimersByTime(1000));
    act(() => oldCompletion({ opacity: 0 }));
    expect(callbacks.openSettings).not.toHaveBeenCalled();
    expect(callbacks.closed).not.toHaveBeenCalled();
});
