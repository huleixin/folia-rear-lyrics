import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    applyKeepScreenOn,
    installKeepScreenOnPreference,
    KEEP_SCREEN_ON_STORAGE_KEY,
    MINIMAL_LYRICS_KEEP_ON_STORAGE_KEY,
    readStoredKeepScreenOn,
    readStoredMinimalLyricsKeepOn,
    resetKeepScreenOnRuntime,
    writeStoredKeepScreenOn,
    writeStoredMinimalLyricsKeepOn,
} from '@/services/androidKeepScreenOn';
import { useAndroidLayoutSettingsStore } from '@/stores/useAndroidLayoutSettingsStore';

// test/unit/services/androidKeepScreenOn.test.ts
// 「屏幕常亮」：安卓走原生窗口标志（切页不丢），拿不到插件时退回 Screen Wake Lock。

const storage = new Map<string, string>();
const setKeepScreenOn = vi.fn(() => Promise.resolve({ enabled: true }));
const request = vi.fn(async () => ({ release: vi.fn(async () => undefined), addEventListener: vi.fn() }));

beforeEach(() => {
    storage.clear();
    setKeepScreenOn.mockClear();
    request.mockClear();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal('window', { Capacitor: { Plugins: { FoliaNative: { setKeepScreenOn } } } });
    vi.stubGlobal('navigator', { wakeLock: { request } });
});

afterEach(() => {
    resetKeepScreenOnRuntime();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('极简歌词页常亮（独立开关）', () => {
    it('默认关闭，并独立于全局常亮持久化', () => {
        expect(readStoredKeepScreenOn()).toBe(false);
        expect(readStoredMinimalLyricsKeepOn()).toBe(false);

        // 只开极简歌词常亮：全局开关不受影响。
        writeStoredMinimalLyricsKeepOn(true);
        expect(readStoredMinimalLyricsKeepOn()).toBe(true);
        expect(readStoredKeepScreenOn()).toBe(false);
        expect(storage.get(MINIMAL_LYRICS_KEEP_ON_STORAGE_KEY)).toBe('true');

        // 只开全局：极简开关也不被改写。
        writeStoredKeepScreenOn(true);
        expect(readStoredKeepScreenOn()).toBe(true);
        expect(readStoredMinimalLyricsKeepOn()).toBe(true);
    });

    it('store 的开关只落库，不直接改窗口标志（是否常亮由原生宿主按页面状态裁决）', async () => {
        useAndroidLayoutSettingsStore.getState().setMinimalLyricsKeepOnEnabled(true);
        await Promise.resolve();
        expect(useAndroidLayoutSettingsStore.getState().minimalLyricsKeepOnEnabled).toBe(true);
        expect(readStoredMinimalLyricsKeepOn()).toBe(true);
        // 关键：这个开关不能自己调用 FoliaNative.setKeepScreenOn —— 那会覆盖全局常亮的意图。
        expect(setKeepScreenOn).not.toHaveBeenCalled();
    });
});

describe('keep screen on', () => {
    it('prefers the native window flag on Android', async () => {
        applyKeepScreenOn(true);
        await Promise.resolve();

        expect(setKeepScreenOn).toHaveBeenCalledWith({ enabled: true });
        // 原生能兜住就不再申请网页 wake lock
        expect(request).not.toHaveBeenCalled();

        applyKeepScreenOn(false);
        await Promise.resolve();
        expect(setKeepScreenOn).toHaveBeenLastCalledWith({ enabled: false });
    });

    it('falls back to the wake lock API when the plugin is missing', async () => {
        vi.stubGlobal('window', { Capacitor: { Plugins: {} } });

        applyKeepScreenOn(true);
        await Promise.resolve();
        expect(request).toHaveBeenCalledWith('screen');

        applyKeepScreenOn(false);
        await Promise.resolve();
        expect(setKeepScreenOn).not.toHaveBeenCalled();
    });

    it('remembers the switch and re-applies it on startup', async () => {
        writeStoredKeepScreenOn(true);
        expect(readStoredKeepScreenOn()).toBe(true);
        expect(storage.get(KEEP_SCREEN_ON_STORAGE_KEY)).toBe('true');

        installKeepScreenOnPreference();
        await Promise.resolve();
        expect(setKeepScreenOn).toHaveBeenCalledWith({ enabled: true });

        writeStoredKeepScreenOn(false);
        expect(readStoredKeepScreenOn()).toBe(false);
    });

    it('stays a no-op instead of throwing when neither mechanism exists', async () => {
        vi.stubGlobal('window', {});
        vi.stubGlobal('navigator', {});

        expect(() => applyKeepScreenOn(true)).not.toThrow();
        await Promise.resolve();
        expect(setKeepScreenOn).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
    });
});
