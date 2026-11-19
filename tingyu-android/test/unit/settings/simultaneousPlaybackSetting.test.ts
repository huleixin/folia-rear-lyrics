import { describe, it, expect, vi, beforeEach } from 'vitest';

const storageMap = new Map<string, string>();
const mockStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => { storageMap.set(key, String(value)); },
    removeItem: (key: string) => { storageMap.delete(key); },
    clear: () => { storageMap.clear(); },
};
Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, configurable: true });
if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
}

const commandMock = vi.fn().mockResolvedValue({ accepted: true });
let mockAndroid = true;

vi.mock('../../../src/platform/tingyuPlayback', () => ({
    getTingyuPlayback: () => ({ command: commandMock }),
}));

vi.mock('../../../src/platform/runtime', () => ({
    isCapacitorAndroid: () => mockAndroid,
    isCapacitorNative: () => mockAndroid,
    isElectronDesktop: () => false,
    isMobileBrowserShell: () => false,
}));

import {
    ALLOW_SIMULTANEOUS_PLAYBACK_KEY,
    useAudioSettingsStore,
} from '../../../src/stores/useAudioSettingsStore';

describe('simultaneous playback setting', () => {
    beforeEach(() => {
        localStorage.clear();
        commandMock.mockClear();
        mockAndroid = true;
        useAudioSettingsStore.setState({ allowSimultaneousPlayback: false });
    });

    it('defaults to false when unset in storage', () => {
        expect(localStorage.getItem(ALLOW_SIMULTANEOUS_PLAYBACK_KEY)).toBeNull();
        expect(useAudioSettingsStore.getState().allowSimultaneousPlayback).toBe(false);
    });

    it('persists toggle state and dispatches real-time audioFocusPolicy command on Android', () => {
        useAudioSettingsStore.getState().handleToggleAllowSimultaneousPlayback(true);
        expect(useAudioSettingsStore.getState().allowSimultaneousPlayback).toBe(true);
        expect(localStorage.getItem(ALLOW_SIMULTANEOUS_PLAYBACK_KEY)).toBe('true');
        expect(commandMock).toHaveBeenCalledWith({
            action: 'audioFocusPolicy',
            allowSimultaneous: true,
        });

        useAudioSettingsStore.getState().handleToggleAllowSimultaneousPlayback(false);
        expect(useAudioSettingsStore.getState().allowSimultaneousPlayback).toBe(false);
        expect(localStorage.getItem(ALLOW_SIMULTANEOUS_PLAYBACK_KEY)).toBe('false');
        expect(commandMock).toHaveBeenLastCalledWith({
            action: 'audioFocusPolicy',
            allowSimultaneous: false,
        });
    });

    it('still persists state without calling Android bridge off Android', () => {
        mockAndroid = false;
        useAudioSettingsStore.getState().handleToggleAllowSimultaneousPlayback(true);
        expect(useAudioSettingsStore.getState().allowSimultaneousPlayback).toBe(true);
        expect(localStorage.getItem(ALLOW_SIMULTANEOUS_PLAYBACK_KEY)).toBe('true');
        expect(commandMock).not.toHaveBeenCalled();
    });
});
