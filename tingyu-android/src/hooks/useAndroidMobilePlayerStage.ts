import { Capacitor } from '@capacitor/core';
import { usePlayerViewModeStore, isStageSurface } from '../stores/usePlayerViewModeStore';
import { useSettingsModalStore } from '../stores/useSettingsModalStore';
import { useAppViewStore } from '../stores/useAppViewStore';
import { useActiveLibrarySuiteId } from '../library/app/librarySuiteChoice';

// src/hooks/useAndroidMobilePlayerStage.ts
export function useAndroidMobilePlayerStage(): boolean {
    const view = useAppViewStore(state => state.view);
    const suite = useActiveLibrarySuiteId();
    return Capacitor.getPlatform() === 'android' && suite === 'mobile' && view === 'player';
}

/** Mobile controls have one owner; classic modes remain intact for other players. */
export function resolvePlayerChromeHidden(mobile: boolean, classicHidden: boolean, immersiveHidden: boolean): boolean {
    return mobile ? immersiveHidden : classicHidden || immersiveHidden;
}

/** Window policies belong to the visible stage, not its retained renderer. */
export function useVisibleLyricStage(): boolean {
    const view = useAppViewStore(s => s.view);
    const panel = useAppViewStore(s => s.isPanelOpen);
    const settings = useSettingsModalStore(s => s.settingsModalState.isOpen);
    const stage = usePlayerViewModeStore(s => isStageSurface(s.mode, s.detour) && s.stageTransition !== 'to-minimal');
    return view === 'player' && stage && !settings && !panel;
}
