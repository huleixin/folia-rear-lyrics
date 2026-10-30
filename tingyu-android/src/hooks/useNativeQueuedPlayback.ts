import { useEffect, useRef, type RefObject } from 'react';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useLxSourceStore } from '../stores/useLxSourceStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { hasBeforePlayHook } from '../services/hostExtensionHooks';
import { resolveNativeQueueWindow } from '../services/nativeQueueWindow';
import { primeNativeLyricsForSongs } from '../services/nativeLyricPriming';
import { setNativeAudioQueue } from '../services/nativeAudioElement';
import { configureNativeQueueSupervisor, installNativeQueueSupervisor, nextNativeQueueGeneration } from '../services/nativeQueueSupervisor';
import { syncNativePlaylist, syncNativePlaylistMode, syncResolverCredentials } from '../services/nativePlaylistSync';
import { syncLxScriptToNative } from '../services/lxNativeScriptSync';
import type { LocalSong, SongResult } from '../types';
import type { PlaybackNavigationOptions } from '../types/appPlayback';
import type { NativeAudioState } from '../types/nativeAudio';
import type { NativeQueueVerdict } from '../services/nativeQueueWindow';

// src/hooks/useNativeQueuedPlayback.ts
// Keeps a bounded window of resolved tracks in front of Media3, and adopts the tracks Media3
// auto-advanced into.
//
// Division of labour (this split is what the background fixes depend on):
// - **native** owns the boundary: it advances, it notices the window running dry, it holds the
//   session open when the window drains, and it re-anchors a late window instead of rejecting it;
// - **this effect** is the foreground reconciler: on a track change it adopts the new item and
//   refills the window;
// - **nativeQueueSupervisor** is the same refill without React, answering Media3 directly when
//   the WebView is throttled. Both use `resolveNativeQueueWindow`, so they cannot disagree.
const REPLENISH_RETRY_MS = 30_000;
const REPLENISH_RETRY_LIMIT = 3;

export function useNativeQueuedPlayback(
    audio: RefObject<HTMLAudioElement | null>,
    enabled: boolean,
    localSongs: LocalSong[],
    play: (song: SongResult, queue: SongResult[], fm: boolean, options: PlaybackNavigationOptions) => Promise<void>,
) {
    const song = usePlaybackStore(s => s.currentSong);
    const queue = usePlaybackStore(s => s.playQueue);
    const source = usePlaybackStore(s => s.audioSrc);
    const context = usePlaybackStore(s => s.activePlaybackContext);
    const fm = usePlaybackStore(s => s.isFmMode);
    const quality = useAudioSettingsStore(s => s.audioQuality);
    const loop = useAudioSettingsStore(s => s.loopMode);
    const shuffle = useAudioSettingsStore(s => s.shuffleEnabled);
    const lx = useLxSourceStore(s => s.activeId);
    const latest = useRef({ play, queue, fm });
    latest.current = { play, queue, fm };

    // The supervisor must outlive every render: install once, then keep its inputs fresh.
    useEffect(() => { installNativeQueueSupervisor(); }, []);
    useEffect(() => {
        configureNativeQueueSupervisor({ getElement: () => audio.current, localSongs });
    }, [audio, localSongs, enabled]);

    // 阶段 A：把逻辑歌单交给原生。这是"后台 JS 不跑时下一首是谁"的唯一来源，
    // 所以必须在前台每次渲染都保持最新；同步签名未变时不会重复下发。
    useEffect(() => {
        if (!enabled || context !== 'main') return;
        void syncNativePlaylist({ song, queue, loop, shuffle, quality });
        void syncResolverCredentials();
        // 阶段 B（洛雪）：脚本本身也要交给原生，否则后台没人能跑它。
        void syncLxScriptToNative();
    }, [enabled, context, song, queue, loop, shuffle, quality]);

    // 只改模式也要单独同步：换代次会作废在飞的原生解析，避免"已切单曲循环还去取下一首"。
    useEffect(() => {
        if (!enabled || context !== 'main') return;
        void syncNativePlaylistMode(loop, shuffle);
    }, [enabled, context, loop, shuffle]);

    useEffect(() => {
        if (!enabled) return;
        const transition = (event: Event) => {
            const state = (event as CustomEvent<NativeAudioState>).detail;
            const current = latest.current;
            const track = current.queue.find(candidate => getPlaybackSongKey(candidate) === state.songKey);
            if (!track || !state.uri) return;
            void current.play(track, current.queue, current.fm, {
                shouldNavigateToPlayer: false,
                nativeHandoff: { uri: state.uri, position: state.position, playing: !state.paused },
            });
        };
        window.addEventListener('tingyu-native-queue-track', transition);
        return () => window.removeEventListener('tingyu-native-queue-track', transition);
    }, [enabled]);

    useEffect(() => {
        const element = audio.current;
        if (!enabled || !element || !song || !source || context !== 'main') return;
        const abort = new AbortController();
        const key = getPlaybackSongKey(song);
        const valid = () => !abort.signal.aborted
            && usePlaybackStore.getState().currentSong != null
            && getPlaybackSongKey(usePlaybackStore.getState().currentSong!) === key;
        const send = async (
            tracks: Parameters<typeof setNativeAudioQueue>[1],
            verdict: NativeQueueVerdict,
        ) => {
            if (valid()) {
                await setNativeAudioQueue(element, tracks.slice(), {
                    anchor: key,
                    continues: verdict !== 'finished',
                    verdict,
                    generation: nextNativeQueueGeneration(),
                });
            }
        };
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let retries = 0;
        // Reads live store state so a retry heals against the queue as it is now, not as it was
        // when the effect ran. The window resolver is shared with the native supervisor.
        const resolve = async () => {
            const live = usePlaybackStore.getState();
            const liveSong = live.currentSong;
            // Nothing established: the native player must keep waiting, not end the playlist.
            if (!liveSong) return { tracks: [], continues: true, verdict: 'unknown' as const, songs: [] };
            return resolveNativeQueueWindow({
                songKey: key,
                queue: live.playQueue,
                localSongs,
                quality,
                loop,
                shuffleActive: shuffle,
                signal: abort.signal,
                isCurrent: valid,
                // First usable URI goes over immediately; the rest follow in one final window.
                onProgress: tracks => send(tracks, 'continues'),
            });
        };
        void (async () => {
            // Extension hooks must retain their ability to cancel a track before it sounds, and
            // repeat-one is owned by Media3 itself.
            if (loop === 'one' || hasBeforePlayHook()) {
                // Native repeat-one owns the boundary: an explicit "nothing follows this window".
                await send([], 'finished');
                return;
            }
            const window = await resolve();
            await send(window.tracks, window.verdict);
            void primeNativeLyricsForSongs(window.songs, quality);
            let sent = window.tracks;
            // A transient failure that leaves the window empty heals here instead of waiting for
            // a track change that may never come; the native supervisor asks again as well.
            while (sent.length === 0 && !abort.signal.aborted && valid() && retries < REPLENISH_RETRY_LIMIT) {
                await new Promise<void>(resolve => { retryTimer = setTimeout(resolve, REPLENISH_RETRY_MS); });
                if (!valid()) return;
                retries++;
                const retried = await resolve();
                await send(retried.tracks, retried.verdict);
                sent = retried.tracks;
            }
        })().catch(error => {
            if (valid()) console.warn('[NativeQueue] Preload failed; native supervisor will retry', error);
        });
        return () => { abort.abort(); if (retryTimer !== null) clearTimeout(retryTimer); };
    }, [enabled, audio, song, queue, source, context, quality, loop, shuffle, lx, localSongs]);
}
