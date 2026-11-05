import { create } from 'zustand';
import {
    applyAndroidPhoneFit,
    readStoredAndroidPhoneFitOrientation,
    readStoredAndroidPhoneFit,
    syncAndroidPhoneFitNative,
    writeStoredAndroidPhoneFitOrientation,
    writeStoredAndroidPhoneFit,
    type AndroidPhoneFitOrientation,
} from '../services/androidPhoneLayout';
import {
    applyKeepScreenOn,
    readStoredKeepScreenOn,
    readStoredMinimalLyricsKeepOn,
    writeStoredKeepScreenOn,
    writeStoredMinimalLyricsKeepOn,
} from '../services/androidKeepScreenOn';

type AndroidLayoutSettingsState = {
    phoneFitEnabled: boolean;
    phoneFitOrientation: AndroidPhoneFitOrientation;
    immersiveModeEnabled: boolean;
    keepScreenOnEnabled: boolean;
    /** 极简歌词页常亮：与全局常亮相互独立，默认关。 */
    minimalLyricsKeepOnEnabled: boolean;
    setPhoneFitEnabled: (enabled: boolean) => void;
    setPhoneFitOrientation: (orientation: AndroidPhoneFitOrientation) => void;
    setImmersiveModeEnabled: (enabled: boolean) => void;
    setKeepScreenOnEnabled: (enabled: boolean) => void;
    setMinimalLyricsKeepOnEnabled: (enabled: boolean) => void;
};

const IMMERSIVE_STORAGE_KEY = 'folia_android_immersive_mode';

const readStoredImmersiveMode = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return localStorage.getItem(IMMERSIVE_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

const writeStoredImmersiveMode = (enabled: boolean): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(IMMERSIVE_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
        // A storage failure must not make the switch unusable for the current session.
    }
};

export const useAndroidLayoutSettingsStore = create<AndroidLayoutSettingsState>((set, get) => ({
    phoneFitEnabled: readStoredAndroidPhoneFit(),
    phoneFitOrientation: readStoredAndroidPhoneFitOrientation(),
    immersiveModeEnabled: readStoredImmersiveMode(),
    keepScreenOnEnabled: readStoredKeepScreenOn(),
    minimalLyricsKeepOnEnabled: readStoredMinimalLyricsKeepOn(),
    setPhoneFitEnabled: (enabled) => {
        writeStoredAndroidPhoneFit(enabled);
        applyAndroidPhoneFit(enabled, get().phoneFitOrientation);
        syncAndroidPhoneFitNative(enabled, get().phoneFitOrientation);
        set({ phoneFitEnabled: enabled });
    },
    setPhoneFitOrientation: (orientation) => {
        writeStoredAndroidPhoneFitOrientation(orientation);
        applyAndroidPhoneFit(get().phoneFitEnabled, orientation);
        syncAndroidPhoneFitNative(get().phoneFitEnabled, orientation);
        set({ phoneFitOrientation: orientation });
    },
    setImmersiveModeEnabled: (enabled) => {
        writeStoredImmersiveMode(enabled);
        set({ immersiveModeEnabled: enabled });
    },
    setKeepScreenOnEnabled: (enabled) => {
        writeStoredKeepScreenOn(enabled);
        applyKeepScreenOn(enabled);
        set({ keepScreenOnEnabled: enabled });
    },
    setMinimalLyricsKeepOnEnabled: (enabled) => {
        // 只落库 + 更新状态：是否真的常亮由宿主按「当前是否停在极简歌词页」决定，
        // 这里不直接碰窗口标志（避免把全局常亮的那份意图抹掉）。
        writeStoredMinimalLyricsKeepOn(enabled);
        set({ minimalLyricsKeepOnEnabled: enabled });
    },
}));
