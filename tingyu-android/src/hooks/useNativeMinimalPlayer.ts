import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppOverlaysModel } from '../components/app/overlays/buildAppOverlaysModel';
import { PlayerState } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { resolvePlaybackMode } from '../utils/playbackMode';
import { useAppViewStore } from '../stores/useAppViewStore';
import { usePlayerViewModeStore } from '../stores/usePlayerViewModeStore';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { useAudioToolsStore, QUALITY_LABELS } from '../stores/useAudioToolsStore';
import { openSettings, useSettingsModalStore } from '../stores/useSettingsModalStore';
import i18n from '../i18n/config';
import { flushNativeShellRoute } from '../services/nativeShellCommit';
import { resolveQualityBadges } from '../components/app/overlays/minimal-stage/minimalQuality';
import { buildMinimalPalette } from '../components/app/overlays/minimal-stage/minimalPalette';
import { useCoverColors } from '../components/app/overlays/minimal-stage/useCoverPalette';
import { canUseComposeChrome, chromeNative } from '../services/nativeChrome';
import { minimalSourceBadgeEnabled } from '../services/minimalSourceDiagnostics';
import {
    addMinimalPlayerActionListener,
    beginMinimalPlayerSession,
    dispatchMinimalAction,
    publishMinimalPlayerFrame,
    releaseMinimalPlayerSurface,
    resolveMinimalRejection,
    setComposeMinimalOwnership,
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

/**
 * 所有权日志。真机上要回答「这一屏是谁画的、为什么换的手」，
 * 全链路只有这几个事件点，每条都带时间戳和原因 —— 不靠外观猜。
 * logcat 过滤 `minimal-ownership`；原生侧配对的是 `TingyuMinimal`。
 */
const ownershipLog = (event: string, detail: string): void => {
    const at = typeof performance !== 'undefined' && performance.timeOrigin
        ? new Date(performance.timeOrigin + performance.now()).toISOString().slice(11, 23)
        : new Date().toISOString().slice(11, 23);
    console.info(`[minimal-ownership] ${at} ${event} ${detail}`);
};

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
 * 队列/歌词等 WebView 面板仍由 WebView 画，而极简页是整窗原生图层：不让位的话，JS 状态
 * 已经打开、页面却被原生盖住，看起来就是"点了没反应"。判据和外壳路由用的是同一条
 * （`data-folia-keyboard-window`），再加上面板 store。
 *
 * 设置弹窗不算（第 12 轮）：它由原生文档接管；而且关掉后它的退场动画还会把
 * keyboard-window 标记挂在 DOM 上一两百毫秒 —— 不排除的话，刚返回播放器的头几帧会被
 * 误判成"弹层让位"，WebView 极简页重新挂载，用户就看到一帧旧页面（闪回的最后一个来源）。
 */
const webOverlayOpen = (): boolean => {
    if (typeof document === 'undefined') return false;
    if (useAppViewStore.getState().isPanelOpen) return true;
    if (settingsOpen()) return false;
    const overlays = document.querySelectorAll('[data-folia-keyboard-window="true"]');
    for (const node of overlays) {
        if (node instanceof Element && node.closest('[data-folia-settings-overlay]')) continue;
        return true;
    }
    return false;
};

/** `order` is the player's name for "no mode at all"; native calls the same state `off`. */
const toNativeMode = (mode: ReturnType<typeof resolvePlaybackMode>): MinimalPlayerFrame['mode'] =>
    mode === 'order' ? 'off' : mode;

/** 设置弹窗是否开着。它也是一块 WebView 键盘窗，但设置页由原生文档绘制，不需要极简页让位。 */
const settingsOpen = (): boolean => useSettingsModalStore.getState().settingsModalState.isOpen;

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
    /** 与 `owns` 同步的镜像：publish 回调里要读上一次的值，state 会读到过期快照。 */
    const ownsRef = useRef(false);
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

    // 队列推送/动作已迁到 `nativeMinimalQueue.ts` 的模块级对账与监听者（第 9 轮）：
    // 抽屉是宿主级的，首页/舞台打开时这个钩子不在场，队列不能依赖它。

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
            // 渲染来源诊断角标：开关在控制台 `__tingyuMinimalSource()`。真机验收后随模块一起删。
            diag: minimalSourceBadgeEnabled(),
            palette: paletteRef.current,
        };
    }, []);

    useEffect(() => {
        if (!enabled) {
            if (ownsRef.current) ownershipLog('release', 'enabled=false（WebView 面板打开或已离开极简页）→ 原生停画，交回 WebView');
            ownsRef.current = false;
            setComposeMinimalOwnership(false);
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
        ownershipLog('session', `新会话 ${session.slice(0, 8)}（尝试握手 Compose）`);

        const publish = async () => {
            if (disposed || !sessionRef.current) return;
            const frame = buildFrame(sessionRef.current);
            if (!frame) {
                // 控制还没就绪（进场竞速）时发不了帧；不计数，不算失败。
                return;
            }
            // Nothing is on screen while the app is backgrounded; keep the last frame instead of
            // spending a bridge call per second on a page nobody can see.
            if (typeof document !== 'undefined' && document.hidden && !frame.playing) return;
            const accepted = await publishMinimalPlayerFrame(frame);
            if (disposed) return;
            if (accepted) {
                if (!ownsRef.current) {
                    ownsRef.current = true;
                    setComposeMinimalOwnership(true);
                    ownershipLog('own', `Compose 接管（桥帧被接受，track=${frame.trackKey.slice(0, 40)}）`);
                }
                failures = 0;
                publishedTrackKey.current = frame.trackKey;
                setOwns(true);
            } else {
                // 拒绝不是一种原因：顺访舞台与设置页保持所有权，WebView 弹层立即交回，真异常计回退预算。
                const outcome = resolveMinimalRejection(
                    usePlayerViewModeStore.getState().detour,
                    settingsOpen(),
                    webOverlayOpen(),
                );
                if (outcome === 'hold') {
                    // 顺访完整歌词舞台：原生本来就不画极简页（舞台是 WebView），拒绝是预期。
                    // 播放设置（第 12 轮）：设置页由原生文档绘制，也不需要 WebView 极简页回来垫底。
                    // 所有权保持 —— 否则关掉设置时 WebView 极简页要重新挂载，用户会先看到一帧旧
                    // WebView 页（还可能是上次停留的歌词页）。
                    failures = 0;
                } else if (outcome === 'handback') {
                    // WebView 弹层（音效对话框 / 面板 / 键盘窗）要显示：立即交回，不等三次失败。
                    // 弹层关掉后下一帧被接受，Compose 自动接管（会有 own 日志）。
                    if (ownsRef.current) {
                        ownsRef.current = false;
                        setComposeMinimalOwnership(false);
                        ownershipLog('handback', 'WebView 弹层打开 → 立即交回 WebView 画极简页当背景');
                        setOwns(false);
                    }
                    failures = 0;
                } else {
                    failures += 1;
                    ownershipLog('reject', `桥帧被拒 ${failures}/${MAX_CONSECUTIVE_FAILURES}（无弹层、无顺访，属异常）`);
                    if (failures >= MAX_CONSECUTIVE_FAILURES) {
                        if (ownsRef.current) {
                            ownsRef.current = false;
                            setComposeMinimalOwnership(false);
                            ownershipLog('fallback', '连续拒绝 → 回退 WebView 极简页（桥每秒仍在重试，恢复时会有 own 日志）');
                        }
                        setOwns(false);
                    }
                }
            }
        };
        publishRef.current = () => { void publish(); };

        const onAction = (action: string, value: number) => {
            if(action==='pageChanged'){
                usePlayerViewModeStore.getState().setPage(value===1?'lyrics':'cover');return;
            }
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
                // 顺访舞台：交给 store 的既有语义（detour），退出由舞台自己 closeStage。
                openStage: () => usePlayerViewModeStore.getState().openStage(),
            });
            // A seek or a transport tap changes the position the next frame describes. On the
            // browser-audio channel this frame is native's only clock, so send it now instead of
            // letting the page show the pre-tap position for up to a second.
            publishRef.current();
        };

        void canUseComposeChrome().then(async supported => {
            if (disposed || !supported) {
                if (!disposed) ownershipLog('unavailable', 'Compose 桥不可用（宿主未开 / probe 失败）→ 一直停在 WebView 极简页');
                return;
            }
            listener = await addMinimalPlayerActionListener(session, onAction);
            if (disposed) {
                void listener?.remove();
                listener = undefined;
                return;
            }
            void publish();
            timer = window.setInterval(() => { void publish(); }, PUBLISH_INTERVAL_MS);
        }).catch(() => { ownershipLog('unavailable', 'probe 抛错 → 停在 WebView 极简页'); });

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
            if (ownsRef.current) ownershipLog('release', '卸载极简页 → 交回 WebView');
            ownsRef.current = false;
            setComposeMinimalOwnership(false);
            setOwns(false);
        };
    }, [enabled, buildFrame]);

    // 设置弹窗开关会改变路由与所有权：关掉时立刻重发一帧，让 Compose 马上接管，
    // 不等最多 1s 的周期帧 —— 那一秒里 WebView 极简页会露出来（闪回旧页面的真凶）。
    useEffect(() => {
        let lastOpen = settingsOpen();
        return useSettingsModalStore.subscribe(() => {
            const open = settingsOpen();
            if (open !== lastOpen) {
                lastOpen = open;
                flushNativeShellRoute();
                publishRef.current();
            }
        });
    }, []);

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
