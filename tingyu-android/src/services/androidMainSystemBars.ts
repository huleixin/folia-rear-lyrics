import { Capacitor } from '@capacitor/core';
import { getFoliaNative } from '../platform/foliaNative';

// src/services/androidMainSystemBars.ts
// Keeps Android status/navigation bars in step with the mobile lyric-stage chrome.

const native = getFoliaNative<{ setMainSystemBarsVisible(options: { visible: boolean }): Promise<void> }>();
let lastVisible: boolean | undefined;
export const setAndroidMainSystemBarsVisible = (visible: boolean): void => {
    if (Capacitor.getPlatform() !== 'android' || lastVisible === visible) return;
    lastVisible = visible;
    void native.setMainSystemBarsVisible({ visible }).catch(() => { lastVisible = undefined; });
};
