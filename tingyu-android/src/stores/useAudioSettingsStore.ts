// src/stores/useAudioSettingsStore.ts
// Audio output and the media cache: stream quality, output device, the equalizer, how queued
// songs are added, and the cache ceiling.
//
// volume / isMuted / loopMode live here too. They are playback state rather than settings, but
// they are audio-output state, and this is their nearest owner until the Phase B transport store
// exists — at which point they may move once more.

import { create } from 'zustand';
import type { AudioQualityPreference } from '../types/onlineMusic';
import { type QueueAddBehavior } from '../types';
import { getAudioEqualizerCustomSlotIndex, isAudioEqualizerCustomSlotId, readStoredAudioEqualizerSettings, resolveAudioEqualizerSettings, writeStoredAudioEqualizerSettings, type AudioEqualizerModeId, type AudioEqualizerSettings } from '../utils/audioEqualizer';
import { AUDIO_SOUND_PRESETS } from '../utils/audioPresets';
import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';
import { setStatusMessage } from './useStatusMessageStore';
import i18n from '../i18n/config';
import { shufflePlayback } from '../services/shufflePlayback';

export const CACHE_SIZE_KEY = 'folia_cache_size';

export const ENABLE_MEDIA_CACHE_KEY = 'folia_enable_media_cache';

/** What the toggle used to write to, before it was corrected to the prefixed key above. */
export const LEGACY_ENABLE_MEDIA_CACHE_KEY = 'enable_media_cache';

export const MEDIA_CACHE_LIMIT_GB_KEY = 'folia_media_cache_limit_gb';

/** Lab switch: start the restored last session playing instead of waiting for a press. */
export const AUTO_PLAY_ON_LAUNCH_KEY = 'folia_auto_play_on_launch';

export const ENABLE_TRANSCODE_FALLBACK_KEY = 'folia_enable_transcode_fallback';

/** Whether finished plays of online NetEase tracks are reported to the signed-in account. */
export const NETEASE_SCROBBLE_KEY = 'folia_netease_scrobble';

/** Whether pause fades out and resume fades in (services/playbackFade). On unless switched off. */
export const PLAYBACK_FADE_KEY = 'folia_playback_fade_enabled';

/**
 * Whether a song that cannot be played for an account restriction or an unknown reason counts down to
 * a skip, like a taken-down one (services/playbackRecovery/playbackFailurePolicy). Off unless asked for.
 */
export const AUTO_SKIP_UNPLAYABLE_KEY = 'folia_auto_skip_unplayable';

/** Gigabytes of cached audio to keep. Zero is the listener asking for no ceiling at all. */
export const DEFAULT_MEDIA_CACHE_LIMIT_GB = 5;

export type AudioQuality = AudioQualityPreference;

export const resolveStoredAudioQuality = (saved: string | null): AudioQuality => (
    saved === 'standard' || saved === 'lossless' || saved === 'hires' ? saved : 'high'
);

/**
 * Reads the media cache toggle, honouring the key its own setter used to write to.
 *
 * The setter wrote a bare 'enable_media_cache' while startup read the folia-prefixed key, so the
 * setting silently reverted to off on every restart. Anyone who switched it on has their real
 * preference sitting under the legacy key, and simply correcting the setter would throw that
 * away once more - so read it as a fallback and promote it to the canonical key.
 */
export const readStoredEnableMediaCache = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }

    const canonical = localStorage.getItem(ENABLE_MEDIA_CACHE_KEY);
    if (canonical !== null) {
        return canonical === 'true';
    }

    const legacy = localStorage.getItem(LEGACY_ENABLE_MEDIA_CACHE_KEY);
    if (legacy === null) {
        return false;
    }

    localStorage.setItem(ENABLE_MEDIA_CACHE_KEY, legacy);
    return legacy === 'true';
};

export const readStoredMediaCacheLimitGb = (): number => {
    if (typeof window === 'undefined') {
        return DEFAULT_MEDIA_CACHE_LIMIT_GB;
    }

    const saved = localStorage.getItem(MEDIA_CACHE_LIMIT_GB_KEY);
    const parsed = saved === null ? NaN : Number(saved);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MEDIA_CACHE_LIMIT_GB;
};

const readStoredAudioQuality = (): AudioQuality => {
    if (typeof window === 'undefined') {
        return 'high';
    }

    const saved = localStorage.getItem('default_audio_quality');
    const quality = resolveStoredAudioQuality(saved);
    if (saved === 'exhigh') {
        localStorage.setItem('default_audio_quality', 'high');
    }
    return quality;
};

const readStoredQueueAddBehavior = (): QueueAddBehavior => {
    if (typeof window === 'undefined') {
        return 'append';
    }

    const saved = localStorage.getItem('queue_add_behavior');
    return saved === 'next' ? 'next' : 'append';
};

const readStoredAudioOutputDeviceId = (): string => {
    if (typeof window === 'undefined') {
        return '';
    }

    return localStorage.getItem('audio_output_device_id') ?? '';
};

const readStoredLoopMode = (): 'off' | 'all' | 'one' => {
    if (typeof window === 'undefined') {
        return 'off';
    }

    const saved = localStorage.getItem('player_loop_mode');
    return saved === 'all' || saved === 'one' ? saved : 'off';
};

const readStoredVolume = () => {
    if (typeof window === 'undefined') {
        return 1;
    }

    const saved = localStorage.getItem('player_volume');
    const parsed = saved !== null ? parseFloat(saved) : 1;
    return Number.isFinite(parsed) ? parsed : 1;
};

export type AudioSettingsState = {
    audioQuality: AudioQuality;
    enableMediaCache: boolean;
    /** Gigabytes of cached audio to keep before the oldest is dropped. Zero means no ceiling. */
    mediaCacheLimitGb: number;
    queueAddBehavior: QueueAddBehavior;
    /** Whether entering the app starts the restored session by itself. Off unless asked for. */
    autoPlayOnLaunch: boolean;
    /** Electron-only recovery for local and Navidrome formats Chromium cannot decode. */
    enableTranscodeFallback: boolean;
    /** Report finished plays of online NetEase tracks to the signed-in account. Off by default. */
    neteaseScrobbleEnabled: boolean;
    /** Short fade when pausing and resuming instead of cutting the sound. On by default. */
    playbackFadeEnabled: boolean;
    /** Count down to a skip when a song is restricted or fails for an unknown reason. Off by default. */
    autoSkipUnplayable: boolean;
    audioOutputDeviceId: string;
    audioEqualizerSettings: AudioEqualizerSettings;
    isAudioEqualizerOpen: boolean;
    volume: number;
    isMuted: boolean;
    loopMode: 'off' | 'all' | 'one';
    shuffleEnabled: boolean;
    handleSetShuffleEnabled: (enabled: boolean) => void;
    handleTogglePlaybackMode: () => void;
    setAudioQuality: (quality: AudioQuality) => void;
    handleToggleMediaCache: (enable: boolean) => void;
    handleSetMediaCacheLimitGb: (gigabytes: number) => void;
    handleSetQueueAddBehavior: (behavior: QueueAddBehavior) => void;
    handleToggleAutoPlayOnLaunch: (enable: boolean) => void;
    handleToggleTranscodeFallback: (enable: boolean) => void;
    handleToggleNeteaseScrobble: (enable: boolean) => void;
    handleTogglePlaybackFade: (enable: boolean) => void;
    handleToggleAutoSkipUnplayable: (enable: boolean) => void;
    handleSetAudioOutputDeviceId: (deviceId: string) => void;
    handleSetAudioEqualizerSettings: (settings: AudioEqualizerSettings) => void;
    handleApplyAudioSoundPreset: (modeId: AudioEqualizerModeId) => void;
    openAudioEqualizer: () => void;
    closeAudioEqualizer: () => void;
    handleSetVolume: (val: number) => void;
    /** Sets the mute switch; the same value is a no-op. */
    handleSetMuted: (muted: boolean) => void;
    handleToggleMute: () => void;
    /** Sets the repeat mode and toasts it like the repeat button; the mode already in effect is a no-op. */
    handleSetLoopMode: (mode: 'off' | 'all' | 'one') => void;
    handleToggleLoopMode: () => void;
};

export const useAudioSettingsStore = create<AudioSettingsState>((set, get) => ({
    audioQuality: readStoredAudioQuality(),
    enableMediaCache: readStoredEnableMediaCache(),
    mediaCacheLimitGb: readStoredMediaCacheLimitGb(),
    queueAddBehavior: readStoredQueueAddBehavior(),
    autoPlayOnLaunch: getStoredBoolean(AUTO_PLAY_ON_LAUNCH_KEY, false),
    enableTranscodeFallback: getStoredBoolean(
        ENABLE_TRANSCODE_FALLBACK_KEY,
        typeof window !== 'undefined' && Boolean(window.electron?.requestTranscodeFallback),
    ),
    // Off unless asked for: it writes to the listener's music account, so it is never a default.
    neteaseScrobbleEnabled: getStoredBoolean(NETEASE_SCROBBLE_KEY, false),
    playbackFadeEnabled: getStoredBoolean(PLAYBACK_FADE_KEY, true),
    // Off unless asked for: skipping a song the listener picked is not something to do by default.
    autoSkipUnplayable: getStoredBoolean(AUTO_SKIP_UNPLAYABLE_KEY, false),
    audioOutputDeviceId: readStoredAudioOutputDeviceId(),
    audioEqualizerSettings: readStoredAudioEqualizerSettings(),
    isAudioEqualizerOpen: false,
    volume: readStoredVolume(),
    isMuted: getStoredBoolean('player_is_muted', false),
    loopMode: readStoredLoopMode(),
    shuffleEnabled: (() => {
        const enabled = getStoredBoolean('player_shuffle_enabled', false);
        shufflePlayback.setEnabled(enabled);
        return enabled;
    })(),
    setAudioQuality: (quality) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('default_audio_quality', quality);
        }
        set({ audioQuality: quality });
    },
    handleToggleMediaCache: (enable) => {
        setStoredBoolean(ENABLE_MEDIA_CACHE_KEY, enable);
        set({ enableMediaCache: enable });
    },
    handleSetMediaCacheLimitGb: (gigabytes) => {
        const next = Number.isFinite(gigabytes) && gigabytes >= 0 ? gigabytes : DEFAULT_MEDIA_CACHE_LIMIT_GB;
        if (typeof window !== 'undefined') {
            localStorage.setItem(MEDIA_CACHE_LIMIT_GB_KEY, String(next));
        }
        set({ mediaCacheLimitGb: next });
    },
    handleSetQueueAddBehavior: (behavior) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('queue_add_behavior', behavior);
        }
        set({ queueAddBehavior: behavior });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (behavior === 'next' ? 'queueInsertNext' : 'queueAppend')),
        });
    },
    handleToggleAutoPlayOnLaunch: (enable) => {
        setStoredBoolean(AUTO_PLAY_ON_LAUNCH_KEY, enable);
        set({ autoPlayOnLaunch: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'autoPlayOnLaunchOn' : 'autoPlayOnLaunchOff')),
        });
    },
    handleToggleTranscodeFallback: (enable) => {
        setStoredBoolean(ENABLE_TRANSCODE_FALLBACK_KEY, enable);
        set({ enableTranscodeFallback: enable });
    },
    handleToggleNeteaseScrobble: (enable) => {
        setStoredBoolean(NETEASE_SCROBBLE_KEY, enable);
        set({ neteaseScrobbleEnabled: enable });
    },
    handleTogglePlaybackFade: (enable) => {
        setStoredBoolean(PLAYBACK_FADE_KEY, enable);
        set({ playbackFadeEnabled: enable });
    },
    handleToggleAutoSkipUnplayable: (enable) => {
        setStoredBoolean(AUTO_SKIP_UNPLAYABLE_KEY, enable);
        set({ autoSkipUnplayable: enable });
    },
    handleSetAudioOutputDeviceId: (deviceId) => {
        set({ audioOutputDeviceId: deviceId });
        if (typeof window === 'undefined') {
            return;
        }

        if (deviceId) {
            localStorage.setItem('audio_output_device_id', deviceId);
        } else {
            localStorage.removeItem('audio_output_device_id');
        }
    },
    handleSetAudioEqualizerSettings: (settings) => {
        const resolved = resolveAudioEqualizerSettings(settings);
        writeStoredAudioEqualizerSettings(resolved);
        set({ audioEqualizerSettings: resolved });
    },
    // Applies a built-in sound preset or a saved custom slot, and turns processing on.
    handleApplyAudioSoundPreset: (modeId) => {
        const current = get().audioEqualizerSettings;
        const source = isAudioEqualizerCustomSlotId(modeId)
            ? current.customSlots[getAudioEqualizerCustomSlotIndex(modeId)]
            : AUDIO_SOUND_PRESETS[modeId];
        if (!source) {
            return;
        }

        const resolved = resolveAudioEqualizerSettings({
            ...current,
            enabled: true,
            preset: modeId,
            gains: [...source.gains],
            effects: { ...source.effects },
        });
        writeStoredAudioEqualizerSettings(resolved);
        set({ audioEqualizerSettings: resolved });
    },
    openAudioEqualizer: () => set({ isAudioEqualizerOpen: true }),
    closeAudioEqualizer: () => set({ isAudioEqualizerOpen: false }),
    handleSetVolume: (val) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('player_volume', String(val));
        }
        set({ volume: val });
    },
    // The toggles below delegate to these setters, so persistence and the toast live in one place
    // (Folium's playback.setMuted / setLoopMode call the setters directly).
    handleSetMuted: (muted) => {
        if (muted === get().isMuted) {
            return;
        }
        setStoredBoolean('player_is_muted', muted);
        set({ isMuted: muted });
    },
    handleToggleMute: () => {
        get().handleSetMuted(!get().isMuted);
    },
    handleSetLoopMode: (mode) => {
        if (mode === get().loopMode && !get().shuffleEnabled) {
            return;
        }
        if (typeof window !== 'undefined') {
            localStorage.setItem('player_loop_mode', mode);
        }
        setStoredBoolean('player_shuffle_enabled', false);
        shufflePlayback.setEnabled(false);
        set({ loopMode: mode, shuffleEnabled: false });
        const loopModeKey = mode === 'off' ? 'loopOff' : mode === 'one' ? 'loopOne' : 'loopAll';
        setStatusMessage({
            type: 'success',
            text: i18n.t(`player.${loopModeKey}`),
            nonce: Date.now(),
        });
    },
    handleSetShuffleEnabled: enabled => {
        if (enabled === get().shuffleEnabled) return;
        if (!enabled) { get().handleSetLoopMode('off'); return; }
        setStoredBoolean('player_shuffle_enabled', true);
        if (typeof window !== 'undefined') localStorage.setItem('player_loop_mode', 'all');
        shufflePlayback.setEnabled(true);
        set({ shuffleEnabled: true, loopMode: 'all' });
        setStatusMessage({ type: 'success', text: i18n.t('mobileStage.loop_shuffle'), nonce: Date.now() });
    },
    handleTogglePlaybackMode: () => {
        const state = get();
        if (state.shuffleEnabled) state.handleSetLoopMode('off');
        else if (state.loopMode === 'one') state.handleSetShuffleEnabled(true);
        else state.handleSetLoopMode(state.loopMode === 'off' ? 'all' : 'one');
    },
    handleToggleLoopMode: () => {
        const prev = get().loopMode;
        const next = prev === 'off'
            ? 'all'
            : prev === 'all'
                ? 'one'
                : 'off';
        get().handleSetLoopMode(next);
    },
}));

/**
 * The AudioSettings half of the former settings snapshot, for the surfaces that
 * legitimately edit this whole domain at once. Ordinary consumers select one field instead.
 */
export const selectAudioSettingsSnapshot = (state: AudioSettingsState) => ({
    audioQuality: state.audioQuality,
    enableMediaCache: state.enableMediaCache,
    mediaCacheLimitGb: state.mediaCacheLimitGb,
    queueAddBehavior: state.queueAddBehavior,
    autoPlayOnLaunch: state.autoPlayOnLaunch,
    enableTranscodeFallback: state.enableTranscodeFallback,
    neteaseScrobbleEnabled: state.neteaseScrobbleEnabled,
    playbackFadeEnabled: state.playbackFadeEnabled,
    autoSkipUnplayable: state.autoSkipUnplayable,
    audioOutputDeviceId: state.audioOutputDeviceId,
    audioEqualizerSettings: state.audioEqualizerSettings,
    isAudioEqualizerOpen: state.isAudioEqualizerOpen,
    volume: state.volume,
    isMuted: state.isMuted,
    loopMode: state.loopMode,
    setAudioQuality: state.setAudioQuality,
    handleToggleMediaCache: state.handleToggleMediaCache,
    handleSetMediaCacheLimitGb: state.handleSetMediaCacheLimitGb,
    handleSetQueueAddBehavior: state.handleSetQueueAddBehavior,
    handleToggleAutoPlayOnLaunch: state.handleToggleAutoPlayOnLaunch,
    handleToggleTranscodeFallback: state.handleToggleTranscodeFallback,
    handleToggleNeteaseScrobble: state.handleToggleNeteaseScrobble,
    handleTogglePlaybackFade: state.handleTogglePlaybackFade,
    handleToggleAutoSkipUnplayable: state.handleToggleAutoSkipUnplayable,
    handleSetAudioOutputDeviceId: state.handleSetAudioOutputDeviceId,
    handleSetAudioEqualizerSettings: state.handleSetAudioEqualizerSettings,
    handleApplyAudioSoundPreset: state.handleApplyAudioSoundPreset,
    openAudioEqualizer: state.openAudioEqualizer,
    closeAudioEqualizer: state.closeAudioEqualizer,
    handleSetVolume: state.handleSetVolume,
    handleToggleMute: state.handleToggleMute,
    handleToggleLoopMode: state.handleToggleLoopMode,
});

// Module-level handles for the assembly layer; actions need no subscription, so importing them
// where they are used keeps App.tsx out of the chain (see setStatusMessage).
export const handleSetVolume = (val: number) => useAudioSettingsStore.getState().handleSetVolume(val);
export const handleToggleMute = () => useAudioSettingsStore.getState().handleToggleMute();
export const setAudioQuality = (quality: AudioQuality) => useAudioSettingsStore.getState().setAudioQuality(quality);
