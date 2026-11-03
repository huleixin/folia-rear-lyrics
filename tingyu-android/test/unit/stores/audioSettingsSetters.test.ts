// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stores read localStorage at import time; see foliumUiRegistries.test.ts.
const storage = vi.hoisted(() => {
    const items = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => items.get(key) ?? null,
            setItem: (key: string, value: string) => { items.set(key, String(value)); },
            removeItem: (key: string) => { items.delete(key); },
            clear: () => items.clear(),
            key: (index: number) => Array.from(items.keys())[index] ?? null,
            get length() { return items.size; },
        },
    });
    return items;
});

import i18n from '@/i18n/config';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { useStatusMessageStore } from '@/stores/useStatusMessageStore';
import { resolvePlaybackMode } from '@/utils/playbackMode';

// test/unit/stores/audioSettingsSetters.test.ts
// The set-to-a-value forms of mute and repeat mode (Folium's playback.setMuted /
// setLoopMode call them) and the toggles that now delegate to them: one place
// persists and toasts, the value already in effect writes nothing and toasts
// nothing, and the toggles behave exactly as before.

const initialAudio = useAudioSettingsStore.getState();

beforeEach(() => {
    useAudioSettingsStore.setState(initialAudio, true);
    useStatusMessageStore.setState({ message: null });
    storage.clear();
});

describe('handleSetMuted', () => {
    it('sets and persists the mute switch, leaving the volume alone', () => {
        useAudioSettingsStore.setState({ volume: 0.5, isMuted: false });
        useAudioSettingsStore.getState().handleSetMuted(true);
        expect(useAudioSettingsStore.getState()).toMatchObject({ isMuted: true, volume: 0.5 });
        expect(storage.get('player_is_muted')).toBe('true');
    });

    it('writes nothing for the value already in effect', () => {
        useAudioSettingsStore.setState({ isMuted: true });
        useAudioSettingsStore.getState().handleSetMuted(true);
        expect(storage.has('player_is_muted')).toBe(false);
    });

    it('backs the toggle, which still flips and persists', () => {
        useAudioSettingsStore.setState({ isMuted: false });
        useAudioSettingsStore.getState().handleToggleMute();
        expect(useAudioSettingsStore.getState().isMuted).toBe(true);
        expect(storage.get('player_is_muted')).toBe('true');
        useAudioSettingsStore.getState().handleToggleMute();
        expect(useAudioSettingsStore.getState().isMuted).toBe(false);
        expect(storage.get('player_is_muted')).toBe('false');
    });
});

describe('handleSetLoopMode', () => {
    it('sets and persists the new mode, without drawing a toast', () => {
        useAudioSettingsStore.setState({ loopMode: 'off' });
        useAudioSettingsStore.getState().handleSetLoopMode('one');
        expect(useAudioSettingsStore.getState()).toMatchObject({ loopMode: 'one', shuffleEnabled: false });
        expect(storage.get('player_loop_mode')).toBe('one');
        // The mode is drawn by the button that was pressed (the stage prints its name, the minimal
        // page shows it beside the transport); the global pill used to land on top of a lyric line.
        expect(useStatusMessageStore.getState().message).toBeNull();
    });

    it('writes nothing for the mode already in effect', () => {
        useAudioSettingsStore.setState({ loopMode: 'all', shuffleEnabled: false });
        useAudioSettingsStore.getState().handleSetLoopMode('all');
        expect(storage.has('player_loop_mode')).toBe(false);
        expect(useStatusMessageStore.getState().message).toBeNull();
    });

    it('clears shuffle, because "repeat one" and "shuffle" cannot both be true', () => {
        useAudioSettingsStore.setState({ loopMode: 'all', shuffleEnabled: true });
        useAudioSettingsStore.getState().handleSetLoopMode('one');
        expect(useAudioSettingsStore.getState()).toMatchObject({ loopMode: 'one', shuffleEnabled: false });
    });
});

describe('the single playback-mode button', () => {
    const mode = () => resolvePlaybackMode(
        useAudioSettingsStore.getState().shuffleEnabled,
        useAudioSettingsStore.getState().loopMode,
    );

    it('steps 顺序 → 列表循环 → 单曲循环 → 随机 → 顺序, with no toast at any step', () => {
        useAudioSettingsStore.setState({ loopMode: 'off', shuffleEnabled: false });
        const seen: string[] = [mode()];
        for (let press = 0; press < 4; press += 1) {
            useAudioSettingsStore.getState().handleTogglePlaybackMode();
            seen.push(mode());
            expect(useStatusMessageStore.getState().message).toBeNull();
        }
        expect(seen).toEqual(['order', 'all', 'one', 'shuffle', 'order']);
    });

    it('never leaves shuffle and single-repeat enabled together', () => {
        useAudioSettingsStore.setState({ loopMode: 'off', shuffleEnabled: false });
        for (let press = 0; press < 8; press += 1) {
            useAudioSettingsStore.getState().handleTogglePlaybackMode();
            const state = useAudioSettingsStore.getState();
            expect(state.shuffleEnabled && state.loopMode === 'one').toBe(false);
            // Shuffle always carries a looping queue, or the last track of a pass would stop it.
            if (state.shuffleEnabled) {
                expect(state.loopMode).toBe('all');
            }
        }
    });

    it('persists both halves, so the mode survives a restart', () => {
        useAudioSettingsStore.setState({ loopMode: 'off', shuffleEnabled: false });
        useAudioSettingsStore.getState().handleSetPlaybackMode('shuffle');
        expect(storage.get('player_loop_mode')).toBe('all');
        expect(storage.get('player_shuffle_enabled')).toBe('true');
        useAudioSettingsStore.getState().handleSetPlaybackMode('order');
        expect(storage.get('player_loop_mode')).toBe('off');
        expect(storage.get('player_shuffle_enabled')).toBe('false');
    });

    it('keeps the legacy loop toggle on the same four-step cycle', () => {
        useAudioSettingsStore.setState({ loopMode: 'one', shuffleEnabled: false });
        useAudioSettingsStore.getState().handleToggleLoopMode();
        expect(mode()).toBe('shuffle');
    });

    it('treats a mode press that changes nothing as a no-op', () => {
        useAudioSettingsStore.setState({ loopMode: 'all', shuffleEnabled: false });
        useAudioSettingsStore.getState().handleSetPlaybackMode('all');
        expect(storage.has('player_loop_mode')).toBe(false);
    });
});
