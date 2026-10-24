import { Capacitor } from '@capacitor/core';
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
