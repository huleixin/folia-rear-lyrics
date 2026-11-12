import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Line, Theme } from '../../../types';
import { loadLucideIcons } from '../../../services/lucideIconResolver';
import { useVisualizerSettingsStore } from '../../../stores/useVisualizerSettingsStore';
import { stageModeQuality } from '../../../utils/stageQualitySettings';
import { resolveThemeFontStack, resolveThemeFontWeight } from '../../../utils/fontStacks';
import { getLineRenderEndTime } from '../../../utils/lyrics/renderHints';
import type { VisualizerSharedProps } from '../definition';
import { useVisualizerPixiHost } from '../pixiRuntimeHost';
import { useVisualizerRuntime } from '../runtime';
import { useVisualizerSongCommit } from '../songHandover';
import { resolveSubtitleFontSizes } from '../subtitleFontSizes';
import VisualizerShell from '../VisualizerShell';
import VisualizerSubtitleOverlay from '../VisualizerSubtitleOverlay';
import type { MachiRuntime, MachiSongContext } from './createMachiRuntime';
import { DEFAULT_MACHI_TUNING, type MachiSceneId, type MachiTuning } from './types';

// src/components/visualizer/machi/VisualizerMachi.tsx
// 町景的 React 外壳：挂共享 shell 与底部字幕层，把按需加载的 three.js 运行时建一次（useVisualizerPixiHost 托管，
// 它与渲染器无关），换歌、换主题、换设置（场景、时间、天气）、暂停、静态模式都就地推给运行时。
// WebGL 上下文丢了就换一个 epoch 重建；透明模式（播放页透明）切换时也重建（画布带不带 alpha 只能在建上下文时定）。
// 每帧的时间只在运行时的循环里读 currentTime，不进 React state。

const EMPTY_LINES: Line[] = [];

/** 主题没有图标时招牌上用的兜底图标。 */
export const MACHI_FALLBACK_ICONS = ['Store', 'Umbrella', 'CloudRain', 'Moon'];

/** 招牌同步画图标：建运行时与换歌 / 换主题前先把主题图标和兜底图标加载好。 */
const loadMachiIcons = (theme: Theme) => loadLucideIcons([...(theme.lyricsIcons ?? []), ...MACHI_FALLBACK_ICONS]);

interface VisualizerMachiProps extends VisualizerSharedProps {
    machiTuning?: MachiTuning;
}

const VisualizerMachi: React.FC<VisualizerMachiProps> = (props) => {
    const {
        machiTuning = DEFAULT_MACHI_TUNING,
        currentTime,
        currentLineIndex,
        lines,
        theme,
        audioPower,
        audioBands,
        showText = true,
        lyricsFontScale = 1,
        staticMode = false,
        paused = false,
        isPreviewMode = false,
        seed = 'machi',
        songTitle,
        songArtist,
        songAlbum,
        isPlayerChromeHidden = false,
        hideTranslationSubtitle = false,
        subtitleContentMode, showSubtitleTranslation,
        subtitleTheme,
        subtitleFontScale,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        subtitleUpcomingLyricsBlur,
        onMachiTuningChange,
    } = props;
    // 透明模式：町景不画天空，只留街景本身。样式小图也把背景标成透明，那只是「不画共用背景」，小图照样画天空。
    const transparent = !isPreviewMode && (props.background?.transparent ?? false);
    const { t } = useTranslation();
    const hostRef = useRef<HTMLDivElement>(null);
    const [runtimeFailed, setRuntimeFailed] = useState(false);
    // 歌词画布的全局分辨率与抗锯齿挡位：画质里跟随全局的两项用它。视频导出钉住了 1× 时，町景自己选的分辨率、抗锯齿和自动降级
    // 也不算（下面 shownTuning，pinMachiQualityForExport）。
    const [contextEpoch, setContextEpoch] = useState(0);
    const [shownScene, setShownScene] = useState<MachiSceneId | null>(null);
    const [drawn, setDrawn] = useState(false);
    const settings = useVisualizerSettingsStore(state => state.stageRenderSettings);
    const renderQuality = useMemo(() => stageModeQuality(settings, 'machi'), [settings]);
    const shownTuning = machiTuning;
    const latestRef = useRef({ theme, paused, showText, staticMode, machiTuning, shownTuning, renderQuality, onMachiTuningChange });
    latestRef.current = { theme, paused, showText, staticMode, machiTuning, shownTuning, renderQuality, onMachiTuningChange };

    // 真正在画的歌：切歌时滞后于 props，免得对着还没到的歌词换牌面（songHandover.ts）。
    const committedSong = useVisualizerSongCommit({ seed, lines, currentTime, readyGraceMs: 3000 });
    const committedLines = committedSong.isInstrumental ? EMPTY_LINES : committedSong.lines;

    const { activeLine, recentCompletedLine, nextLines } = useVisualizerRuntime({
        currentTime,
        currentLineIndex,
        lines,
        getLineEndTime: getLineRenderEndTime,
    });

    const songContext = useMemo<MachiSongContext>(() => ({
        seed: committedSong.seed ?? 'machi',
        lines: committedLines,
        isInstrumental: committedSong.isInstrumental,
        title: songTitle ?? '',
        artist: songArtist ?? '',
        album: songAlbum ?? '',
    }), [committedLines, committedSong.isInstrumental, committedSong.seed, songAlbum, songArtist, songTitle]);

    const runtimeRef = useVisualizerPixiHost<MachiRuntime, MachiSongContext>({
        hostRef,
        label: 'Machi',
        // 只有真正需要新 WebGL 上下文的输入；歌、主题、暂停、静态模式都就地推给运行时。
        rebuildKey: [currentTime, audioPower, audioBands, isPreviewMode, transparent, contextEpoch],
        song: songContext,
        create: async (host, song, signal) => {
            setDrawn(false);
            const [{ MachiRuntime: Runtime }] = await Promise.all([
                import('./createMachiRuntime'),
                loadMachiIcons(latestRef.current.theme),
            ]);
            const latest = latestRef.current;
            const runtime = await Runtime.create({
                host,
                song,
                theme: latest.theme,
                tuning: latest.shownTuning,
                renderQuality: latest.renderQuality,
                currentTime,
                audioPower,
                audioBands,
                paused: latest.paused,
                staticMode: latest.staticMode,
                showText: latest.showText,
                previewMode: isPreviewMode,
                transparent,
                // 自定义视角下拖动停稳了：新视角存进 tuning 里这个场景的那一份（宿主经 onMachiTuningChange 存）。
                onViewChange: (view, scene) => {
                    const latest = latestRef.current;
                    latest.onMachiTuningChange?.({ camera: 'custom', views: { ...latest.machiTuning.views, [scene]: view } } satisfies Partial<MachiTuning>);
                },
                onSceneShown: setShownScene,
                fallbackIcons: MACHI_FALLBACK_ICONS,
                onContextLost: () => setRuntimeFailed(true),
                onSceneError: () => setRuntimeFailed(true),
                signal,
            });
            const current = latestRef.current;
            runtime.setTheme(current.theme);
            runtime.setTuning(current.shownTuning);
            runtime.setRenderQuality(current.renderQuality);
            runtime.setShowText(current.showText);
            runtime.setStaticMode(current.staticMode);
            runtime.setPaused(current.paused);
            if (!signal.aborted) setDrawn(true);
            return runtime;
        },
        swap: async (runtime, song) => {
            await loadMachiIcons(latestRef.current.theme);
            runtime.swapSong(song);
        },
        destroy: runtime => runtime.destroy(),
        onFailedChange: setRuntimeFailed,
    });

    useEffect(() => {
        let cancelled = false;
        void loadMachiIcons(theme).then(() => {
            if (!cancelled) runtimeRef.current?.setTheme(theme);
        });
        return () => { cancelled = true; };
    }, [theme, runtimeRef]);

    useEffect(() => {
        runtimeRef.current?.setTuning(shownTuning);
    }, [shownTuning, runtimeRef]);

    useEffect(() => {
        runtimeRef.current?.setRenderQuality(renderQuality);
    }, [renderQuality, runtimeRef]);

    useEffect(() => {
        runtimeRef.current?.setShowText(showText);
    }, [showText, runtimeRef]);

    useEffect(() => {
        runtimeRef.current?.setStaticMode(staticMode);
    }, [staticMode, runtimeRef]);

    useEffect(() => {
        runtimeRef.current?.setPaused(paused);
    }, [paused, runtimeRef]);

    // 暂停时循环停着，拖动进度要手动补一帧。
    useEffect(() => currentTime.on('change', () => {
        if (paused || staticMode) runtimeRef.current?.renderOnce();
    }), [currentTime, paused, staticMode, runtimeRef]);

    const fallbackFontFamily = resolveThemeFontStack(theme);
    const fallbackFontWeight = resolveThemeFontWeight(theme, 700);
    const subtitleFontSizes = resolveSubtitleFontSizes(lyricsFontScale);

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={props}
            renderBackground={false}
        >
            <div className="absolute inset-0 z-10 overflow-hidden">
                {/* 拖拽旋转、缩放要收到指针，所以这一层不是 pointer-events-none；预览里不接拖拽。 */}
                <div
                    ref={hostRef}
                    className={`absolute inset-0 z-10 ${!isPreviewMode && machiTuning.camera === 'custom' ? '' : 'pointer-events-none'}`}
                    aria-hidden="true" data-machi-ready={drawn} data-machi-scene={shownScene ?? 'loading'}
                />
                {runtimeFailed && (
                    <div
                        className="absolute inset-0 z-20 flex items-center justify-center px-10 text-center"
                        style={{
                            color: theme.primaryColor,
                            fontFamily: fallbackFontFamily,
                            fontWeight: fallbackFontWeight,
                            fontSize: `clamp(2rem, ${5.4 * lyricsFontScale}vw, 5.6rem)`,
                        }}
                    >
                        <div><div>{showText && !committedSong.isInstrumental ? (activeLine?.fullText || t('ui.waitingForMusic')) : null}</div><p className="mt-4 text-sm">{t('stageQuality.compatibilityFallback')}</p><button className="mt-3 rounded-xl border px-4 py-2 text-sm" onClick={() => setContextEpoch(epoch => epoch + 1)}>{t('stageQuality.retry')}</button></div>
                    </div>
                )}
            </div>

            <VisualizerSubtitleOverlay
                showText={showText}
                activeLine={activeLine}
                recentCompletedLine={recentCompletedLine}
                nextLines={nextLines}
                theme={theme}
                subtitleTheme={subtitleTheme}
                translationFontSize={subtitleFontSizes.translationFontSize}
                upcomingFontSize={subtitleFontSizes.upcomingFontSize}
                subtitleFontScale={subtitleFontScale}
                subtitleOverlayOpacity={subtitleOverlayOpacity}
                subtitleOverlayBackground={subtitleOverlayBackground}
                subtitleUpcomingLyricsBlur={subtitleUpcomingLyricsBlur}
                isPlayerChromeHidden={isPlayerChromeHidden}
                hideTranslationSubtitle={hideTranslationSubtitle}
                subtitleContentMode={subtitleContentMode}
                showSubtitleTranslation={showSubtitleTranslation}
            />
        </VisualizerShell>
    );
};

export default VisualizerMachi;
