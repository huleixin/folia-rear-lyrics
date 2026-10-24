import { useCallback } from 'react';
import { usePlayerChromeAutoHide } from './usePlayerChromeAutoHide';
import { useAndroidMobilePlayerStage } from './useAndroidMobilePlayerStage';
import { useAndroidLayoutSettingsStore } from '../stores/useAndroidLayoutSettingsStore';
import type { PlayerChromeVisibilityMode } from '../types/remoteControl';

// src/hooks/usePlayerChromeMode.ts
/** Settings, shortcuts and remote actions share the mobile switch; classic modes remain saved. */
export function usePlayerChromeMode(options: Parameters<typeof usePlayerChromeAutoHide>[0]) {
    const mobile = useAndroidMobilePlayerStage();
    const enabled = useAndroidLayoutSettingsStore(state => state.immersiveModeEnabled);
    const classic = usePlayerChromeAutoHide({ ...options, suspended: mobile });
    const onModeChange = options.onModeChange;
    const cycleClassic = classic.cyclePlayerChromeVisibilityMode;
    const cyclePlayerChromeVisibilityMode = useCallback(() => {
        if (!mobile) { cycleClassic(); return; }
        const store = useAndroidLayoutSettingsStore.getState();
        const next = !store.immersiveModeEnabled;
        store.setImmersiveModeEnabled(next);
        onModeChange?.(next ? 'auto-hide' : 'always-visible');
    }, [mobile, cycleClassic, onModeChange]);
    const playerChromeVisibilityMode: PlayerChromeVisibilityMode = mobile
        ? (enabled ? 'auto-hide' : 'always-visible') : classic.playerChromeVisibilityMode;
    return { playerChromeVisibilityMode, cyclePlayerChromeVisibilityMode };
}
