import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppOverlaysModel } from '../components/app/overlays/buildAppOverlaysModel';
import { PlayerState } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { resolvePlaybackMode } from '../utils/playbackMode';
import { useAppViewStore } from '../stores/useAppViewStore';
import { canUseComposeChrome } from '../services/nativeChrome';
import {
    addMinimalPlayerActionListener,
    beginMinimalPlayerSession,
    dispatchMinimalAction,
    publishMinimalPlayerFrame,
    releaseMinimalPlayerSurface,
    type MinimalPlayerFrame,
} from '../services/nativeMinimalPlayer';

// src/hooks/useNativeMinimalPlayer.ts
// Hands the minimal player surface to Compose, but only after native proves it can render it.
//
// The hand-off is a published frame that the host acknowledges. Until the first acknowledgement the
// WebView minimal page stays mounted — so a missing host, a stale bridge, or a broken native build
// degrades to exactly today's behaviour instead of an empty screen. Three consecutive failed
// publishes hand the surface back the same way.
//
// This hook owns no playback state. Every field it sends is read from the model the classic stage
// already consumes: `controls.currentTime` (the one MotionValue the progress bar uses), the same
// song object, the same `onToggleLoop`, the same `trackNavigation`.

type Controls = NonNullable<AppOverlaysModel['floatingControls']>;
type StageChrome = NonNullable<AppOverlaysModel['mobileStage']>;

/** A frame per second keeps native's fallback clock honest without touching the frame rate. */
const PUBLISH_INTERVAL_MS = 1000;
const MAX_CONSECUTIVE_FAILURES = 3;

export type NativeMinimalPlayer = {
    /** True once native has acknowledged a frame: the WebView minimal page may unmount. */
    owns: boolean;
};

/** `order` is the player's name for "no mode at all"; native calls the same state `off`. */
const toNativeMode = (mode: ReturnType<typeof resolvePlaybackMode>): MinimalPlayerFrame['mode'] =>
    mode === 'order' ? 'off' : mode;

export function useNativeMinimalPlayer({
    enabled,
    chrome,
    controls,
}: {
    enabled: boolean;
    chrome?: StageChrome | null;
    controls?: Controls | null;
}): NativeMinimalPlayer {
    const [owns, setOwns] = useState(false);
    const latest = useRef({ chrome, controls });
    latest.current = { chrome, controls };
    /** The session this mount owns; a republish must never mint a new one. */
    const sessionRef = useRef('');
    const publishedTrackKey = useRef('');
    const publishRef = useRef<() => void>(() => undefined);

    const buildFrame = useCallback((session: string): MinimalPlayerFrame | null => {
        const currentControls = latest.current.controls;
        const song = latest.current.chrome?.song;
        if (!currentControls) return null;
        const trackKey = song?.track
            ? getPlaybackSongKey(song.track)
            : currentControls.trackNavigation?.currentTrackKey ?? '';
        const position = currentControls.currentTime?.get?.() ?? 0;
        return {
            session,
            trackKey,
            title: song?.title ?? '',
            artist: song?.artist ?? '',
            // Album and artwork are read natively from the synced queue; only the cover URL crosses
            // the bridge because a local file / remote URL is not something native can derive.
            album: '',
            cover: song?.coverUrl ?? '',
            playing: currentControls.playerState === PlayerState.PLAYING,
            position: Number.isFinite(position) ? Math.max(0, position) : 0,
            duration: Number.isFinite(currentControls.duration) ? Math.max(0, currentControls.duration) : 0,
            canPrevious: !!currentControls.trackNavigation?.canPrev,
            canNext: !!currentControls.trackNavigation?.canNext,
            disabled: !!currentControls.controlsDisabled,
            preparing: !!currentControls.preparing,
            // `resolvePlaybackMode` says 'order' for plain sequential play; native's vocabulary for
            // the same state is 'off'. One mapping, in one direction.
            mode: toNativeMode(resolvePlaybackMode(currentControls.shuffleEnabled, currentControls.loopMode)),
        };
    }, []);

    useEffect(() => {
        if (!enabled) {
            setOwns(false);
            publishedTrackKey.current = '';
            sessionRef.current = '';
            publishRef.current = () => undefined;
            return;
        }
        let disposed = false;
        let timer = 0;
        let listener: { remove: () => Promise<void> } | undefined;
        let failures = 0;
        const session = beginMinimalPlayerSession();
        sessionRef.current = session;

        const publish = async () => {
            if (disposed || !sessionRef.current) return;
            const frame = buildFrame(sessionRef.current);
            if (!frame) return;
            // Nothing is on screen while the app is backgrounded; keep the last frame instead of
            // spending a bridge call per second on a page nobody can see.
            if (typeof document !== 'undefined' && document.hidden && !frame.playing) return;
            const accepted = await publishMinimalPlayerFrame(frame);
            if (disposed) return;
            if (accepted) {
                failures = 0;
                publishedTrackKey.current = frame.trackKey;
                setOwns(true);
            } else {
                failures += 1;
                if (failures >= MAX_CONSECUTIVE_FAILURES) setOwns(false);
            }
        };
        publishRef.current = () => { void publish(); };

        const onAction = (action: string, value: number) => {
            const currentControls = latest.current.controls;
            const currentChrome = latest.current.chrome;
            if (!currentControls) return;
            const frame = buildFrame(sessionRef.current);
            dispatchMinimalAction(action, value, {
                displayedTrackKey: frame?.trackKey ?? '',
                publishedTrackKey: publishedTrackKey.current,
                playing: currentControls.playerState === PlayerState.PLAYING,
                togglePlay: currentControls.onTogglePlay,
                previous: () => currentControls.trackNavigation?.onPrev(),
                next: () => currentControls.trackNavigation?.onNext(),
                seek: seconds => currentControls.onSeek(seconds),
                toggleLoop: currentControls.onToggleLoop,
                openQueue: () => {
                    const view = useAppViewStore.getState();
                    view.setPanelTab('queue');
                    view.setIsPanelOpen(true);
                },
                collapse: () => currentChrome?.onBack(),
            });
            // A seek or a transport tap changes the position the next frame describes. On the
            // browser-audio channel this frame is native's only clock, so send it now instead of
            // letting the page show the pre-tap position for up to a second.
            publishRef.current();
        };

        void canUseComposeChrome().then(async supported => {
            if (disposed || !supported) return;
            listener = await addMinimalPlayerActionListener(session, onAction);
            if (disposed) {
                void listener?.remove();
                listener = undefined;
                return;
            }
            void publish();
            timer = window.setInterval(() => { void publish(); }, PUBLISH_INTERVAL_MS);
        }).catch(() => { /* The WebView minimal page stays mounted; nothing else to do. */ });

        const onVisibility = () => { if (typeof document !== 'undefined' && !document.hidden) void publish(); };
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            disposed = true;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
            void listener?.remove();
            // Tell native to stop drawing before `owns` flips: the WebView page is about to come
            // back, and a full-window native layer must not sit on top of it.
            void releaseMinimalPlayerSurface(sessionRef.current);
            sessionRef.current = '';
            publishRef.current = () => undefined;
            setOwns(false);
        };
    }, [enabled, buildFrame]);

    // Publish immediately on the changes a listener would notice: play/pause, track, mode.
    const current = latest.current;
    const identity = [
        current.chrome?.song?.track ? getPlaybackSongKey(current.chrome.song.track) : '',
        current.controls?.playerState ?? '',
        current.controls?.loopMode ?? '',
        current.controls?.shuffleEnabled ? 's' : '',
        current.controls?.trackNavigation?.canPrev ? 'p' : '',
        current.controls?.trackNavigation?.canNext ? 'n' : '',
    ].join('|');
    useEffect(() => {
        if (!enabled || !identity) return;
        publishRef.current();
    }, [identity, enabled]);

    return { owns };
}
