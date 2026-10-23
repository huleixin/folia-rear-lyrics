import type { LyricData, SongResult } from '@/types';
import { PlayerState } from '@/types';
import {
    usePlaybackStore,
    selectDisplayLyrics,
    selectDisplayPlayerState,
    selectDisplaySong,
} from '@/stores/usePlaybackStore';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import { useVisualizerSettingsStore } from '@/stores/useVisualizerSettingsStore';
import { installBeforePlayHook, installLyricsTransformHook, installPlaybackFailedListener, type PlaybackFailedNotice } from '@/services/hostExtensionHooks';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';
import { clampMediaVolume } from '@/utils/appPlaybackHelpers';
import type { FoliumBeforePlayEvent, FoliumLyricsTransformEvent, FoliumPlaybackState, FoliumSong } from './contract';
import { fromFoliumLines, resolveFoliumSongRef, toFoliumLines, toFoliumPlaybackFailureReason, toFoliumSong } from './dto';
import { dispatchFoliumHookAsync, dispatchFoliumHookSync, emitFoliumEvent, hasFoliumEventHandlers } from './events';
import { findFoliumQueueCurrentIndex } from './hostQueue';

// src/mods/folium/hostEvents.ts
// Main-window wiring between host state and the Folium event bus:
//   - installs the two hooks the host exposes (src/services/hostExtensionHooks):
//     `lyrics.transform` at the lyrics setter and `playback.beforePlay` at the
//     start of playSong;
//   - turns store changes into notifications (song, transport state, lyrics,
//     view, visualizer mode). Theme and seek notifications come from the host
//     bridge hook in App, which is where the theme lives.
//   - Folium 1.5: the queue outline, volume / mute and the repeat mode.
//   - Folium 1.5: turns the host's playback failure notice into `playback.failed`.
// Everything is a no-op until some mod listens.

const transformLyrics = (lyrics: LyricData): LyricData => {
    if (!hasFoliumEventHandlers('lyrics.transform') || !Array.isArray(lyrics.lines)) return lyrics;
    const originalDtos = toFoliumLines(lyrics.lines);
    const event: FoliumLyricsTransformEvent = {
        song: toFoliumSong(usePlaybackStore.getState().currentSong),
        lines: originalDtos,
    };
    dispatchFoliumHookSync('lyrics.transform', event);
    if (event.lines === originalDtos || !Array.isArray(event.lines)) return lyrics;
    return { ...lyrics, lines: fromFoliumLines(lyrics.lines, originalDtos, event.lines) };
};

/*
 * beforePlay: every handler sees the same event; the first cancel ends the
 * chain. A replacement must carry a host `ref`; an unknown ref is ignored
 * (the original song plays) rather than failing playback.
 */
const beforePlay = async (song: SongResult) => {
    const dto = toFoliumSong(song) as FoliumSong;
    let cancelled = false;
    let replacement: FoliumSong | null = null;
    const event: FoliumBeforePlayEvent = {
        song: dto,
        get cancelled() {
            return cancelled;
        },
        cancel: () => {
            cancelled = true;
        },
        replaceWith: (next: FoliumSong) => {
            replacement = next;
        },
    };
    await dispatchFoliumHookAsync('playback.beforePlay', event, () => cancelled);
    const replaced = resolveFoliumSongRef((replacement as FoliumSong | null)?.ref);
    return { cancel: cancelled, song: replaced ?? song };
};

// playback.failed: the host reports through hostExtensionHooks so its playback layer never imports
// this module. Checked for listeners first: toFoliumSong takes a slot in the shared ref pool.
const emitPlaybackFailed = (notice: PlaybackFailedNotice) => {
    if (!hasFoliumEventHandlers('playback.failed')) return;
    emitFoliumEvent('playback.failed', {
        song: toFoliumSong(notice.song),
        reason: toFoliumPlaybackFailureReason(notice.reason),
        phase: notice.phase,
        willAutoSkip: notice.willAutoSkip,
    });
};

const toFoliumPlaybackState = (state: PlayerState): FoliumPlaybackState => {
    if (state === PlayerState.PLAYING) return 'playing';
    if (state === PlayerState.PAUSED) return 'paused';
    return 'stopped';
};

type PlaybackStoreState = ReturnType<typeof usePlaybackStore.getState>;

const displayedSongKey = (song: SongResult | null) => (song ? getPlaybackSongKey(song) : null);

/* What playback.queueChanged reports moved: the queue array, FM / Stage, or the displayed song's key. */
const queueOutlineChanged = (state: PlaybackStoreState, previous: PlaybackStoreState) => {
    if (
        state.playQueue !== previous.playQueue
        || state.isFmMode !== previous.isFmMode
        || state.activePlaybackContext !== previous.activePlaybackContext
    ) {
        return true;
    }
    const song = selectDisplaySong(state);
    const before = selectDisplaySong(previous);
    return song !== before && displayedSongKey(song) !== displayedSongKey(before);
};

/*
 * playback.queueChanged: one event per task, a microtask after the first
 * change, read from the state as it settled (playSong writes the queue, the
 * song and FM mode one after another). Never deduplicated by payload: a
 * shuffle keeps both the length and the current index.
 */
let queueChangePending = false;
const emitQueueChanged = () => {
    queueChangePending = false;
    if (!hasFoliumEventHandlers('playback.queueChanged')) return;
    const state = usePlaybackStore.getState();
    emitFoliumEvent('playback.queueChanged', {
        length: state.playQueue.length,
        currentIndex: findFoliumQueueCurrentIndex(state),
    });
};

let installed = false;

/** Installs hooks and store notifications (main window only; idempotent). */
export const installFoliumHostEvents = () => {
    if (installed) return;
    installed = true;
    installLyricsTransformHook(transformLyrics);
    installBeforePlayHook(beforePlay, () => hasFoliumEventHandlers('playback.beforePlay'));
    installPlaybackFailedListener(emitPlaybackFailed);

    usePlaybackStore.subscribe((state, previous) => {
        const song = selectDisplaySong(state);
        if (song !== selectDisplaySong(previous)) {
            emitFoliumEvent('playback.songChanged', { song: toFoliumSong(song) });
        }
        const playerState = selectDisplayPlayerState(state);
        if (playerState !== selectDisplayPlayerState(previous)) {
            emitFoliumEvent('playback.stateChanged', { state: toFoliumPlaybackState(playerState) });
        }
        const lyrics = selectDisplayLyrics(state);
        if (lyrics !== selectDisplayLyrics(previous)) {
            emitFoliumEvent('lyrics.loaded', { song: toFoliumSong(song), lines: toFoliumLines(lyrics?.lines) });
        }
        if (!queueChangePending && hasFoliumEventHandlers('playback.queueChanged') && queueOutlineChanged(state, previous)) {
            queueChangePending = true;
            queueMicrotask(emitQueueChanged);
        }
    });
    useAudioSettingsStore.subscribe((state, previous) => {
        if (state.volume !== previous.volume || state.isMuted !== previous.isMuted) {
            emitFoliumEvent('playback.volumeChanged', { volume: clampMediaVolume(state.volume), muted: state.isMuted });
        }
        if (state.loopMode !== previous.loopMode) {
            emitFoliumEvent('playback.loopModeChanged', { mode: state.loopMode });
        }
    });
    useAppViewStore.subscribe((state, previous) => {
        if (state.view !== previous.view) {
            emitFoliumEvent('app.viewChanged', { view: String(state.view) });
        }
    });
    useVisualizerSettingsStore.subscribe((state, previous) => {
        if (state.visualizerMode !== previous.visualizerMode) {
            emitFoliumEvent('visualizer.modeChanged', { mode: state.visualizerMode });
        }
    });
};
