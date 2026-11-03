import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppOverlaysModel } from '../components/app/overlays/buildAppOverlaysModel';
import { PlayerState } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { resolvePlaybackMode } from '../utils/playbackMode';
import { useAppViewStore } from '../stores/useAppViewStore';
import { usePlayerViewModeStore } from '../stores/usePlayerViewModeStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useAudioToolsStore, QUALITY_LABELS } from '../stores/useAudioToolsStore';
import { openSettings } from '../stores/useSettingsModalStore';
import i18n from '../i18n/config';
import { resolveQualityBadges } from '../components/app/overlays/minimal-stage/minimalQuality';
import { buildMinimalPalette } from '../components/app/overlays/minimal-stage/minimalPalette';
import { useCoverColors } from '../components/app/overlays/minimal-stage/useCoverPalette';
import { canUseComposeChrome, chromeNative } from '../services/nativeChrome';
import { readNativeQueue, runNativeQueueAction } from '../services/nativeMinimalQueue';
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

/** `rgb(12 34 56)` → `#0C2238`；桥上一个字段一种写法，原生只管解析。 */
const toHex = (css: string): string => {
    const channels = /rgba?\(([^)]+)\)/.exec(css)?.[1]?.split(/[\s,/]+/).filter(Boolean) ?? [];
    const [r, g, b] = channels.slice(0, 3).map(value => Math.round(Number(value)));
    if (![r, g, b].every(Number.isFinite)) return '#000000';
    return `#${[r, g, b].map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * 有没有一块 WebView 弹层正占着屏幕。
 *
 * 音质音效 / 音效 / 歌词 / 播放设置这些面板仍然由 WebView 画，而极简页是整窗原生图层：
 * 不让位的话，JS 状态已经打开、页面却被原生盖住，看起来就是"点了没反应"。
 * 判据和外壳路由用的是同一条（`data-folia-keyboard-window`），再加上面板 store。
 */
const webOverlayOpen = (): boolean => {
    if (typeof document === 'undefined') return false;
    if (useAppViewStore.getState().isPanelOpen) return true;
    if (document.querySelector('[data-folia-keyboard-window="true"]')) return true;
    return false;
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

    // 配色不重算：这里调用的是 WebView 页面用的**同一个** `buildMinimalPalette`，
    // 原生只负责画。移植一份到 Kotlin 迟早会在某个封面上差一个色相 —— 上一版就是。
    const coverColors = useCoverColors(chrome?.song?.coverUrl ?? null);
    const light = !!controls?.isDaylight;
    const palette = useMemo(() => {
        if (!coverColors) return null;
        const built = buildMinimalPalette(coverColors, light ? 'light' : 'dark');
        return [
            built.base,
            built.fieldPrimary,
            built.fieldSecondary,
            built.bloom,
            built.accent,
            built.lyricAccent,
        ].map(toHex) as [string, string, string, string, string, string];
    }, [coverColors, light]);
    const paletteRef = useRef(palette);
    paletteRef.current = palette;

    // 队列推送：只在抽屉打开后、且版本变了才发。396 条曲目一秒一包是不可接受的。
    const queueOpen = useRef(false);
    const queueDirty = useRef(false);
    const queueVersionSent = useRef(-1);
    const pushQueue = useCallback(() => {
        const currentKey = latest.current.chrome?.song?.track
            ? getPlaybackSongKey(latest.current.chrome.song.track)
            : '';
        const snapshot = readNativeQueue(currentKey);
        if (!snapshot) return;
        if (!queueDirty.current && snapshot.v === queueVersionSent.current) return;
        queueVersionSent.current = snapshot.v;
        queueDirty.current = false;
        void chromeNative.minimalQueue(snapshot).catch(() => undefined);
    }, []);
    // 抽屉开着的时候，每秒把快照对一次版本号：第一次动作丢了也能自愈，且不产生多余流量。
    useEffect(() => {
        const timer = window.setInterval(() => {
            if (queueOpen.current) pushQueue();
        }, PUBLISH_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [pushQueue]);

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
        const badges = resolveQualityBadges(song?.track?.catalogAudioSpecs, currentControls.audioSrc);
        const quality = badges
            .map(badge => (badge.id === 'spec' ? i18n.t(`catalogAudioSpecs.${badge.value}`) : badge.value))
            .join(' · ');
        const likeContext = currentControls.slotContext;
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
            quality,
            qualityGold: badges.some(badge => badge.tone === 'gold'),
            qualityMode: QUALITY_LABELS[useAudioSettingsStore.getState().audioQuality],
            effectsOn: useAudioSettingsStore.getState().audioEqualizerSettings.enabled,
            // 和 palette 用同一个 light：页面主题只有一个来源。
            light,
            liked: !!likeContext?.isLiked,
            likeDisabled: !likeContext || !!likeContext.likeDisabled,
            detour: usePlayerViewModeStore.getState().detour || webOverlayOpen(),
            palette: paletteRef.current,
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
                    // 原生抽屉自己画，不再打开 WebView 面板；只把数据推过去。
                    queueOpen.current = true;
                    queueDirty.current = true;
                    pushQueue();
                },
                collapse: () => currentChrome?.onBack(),
                like: () => latest.current.controls?.slotContext?.onLike?.(),
                // 五项全部复用 `MobileStageMenu` 里的**同一个** store 方法，不新建面板。
                openAudioQuality: () => useAudioToolsStore.getState().show(),
                openAudioEffects: () => useAudioSettingsStore.getState().openAudioEqualizer(),
                openLyricsPanel: () => {
                    const view = useAppViewStore.getState();
                    view.setPanelTab('onlineLyrics');
                    view.setIsPanelOpen(true);
                },
                openPlaybackSettings: () => openSettings('options', 'playback'),
                // 队列：原生抽屉打开时把快照推过去；行内动作原样交给原版处理器。
                openQueueSnapshot: () => {
                    queueDirty.current = true;
                    pushQueue();
                },
                closeQueueSnapshot: () => {
                    queueOpen.current = false;
                },
                queueAction: (action, index) => {
                    if (runNativeQueueAction(action, index)) queueDirty.current = true;
                    pushQueue();
                },
                // 顺访舞台：交给 store 的既有语义（detour），退出由舞台自己 closeStage。
                openStage: () => usePlayerViewModeStore.getState().openStage(),
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
        current.controls?.slotContext?.isLiked ? 'l' : '',
        usePlayerViewModeStore.getState().detour ? 'd' : '',
        current.controls?.audioSrc ? 'a' : '',
        useAudioSettingsStore.getState().audioQuality,
        useAudioSettingsStore.getState().audioEqualizerSettings.enabled ? 'e' : '',
    ].join('|');
    useEffect(() => {
        if (!enabled || !identity) return;
        publishRef.current();
    }, [identity, enabled]);

    return { owns };
}
