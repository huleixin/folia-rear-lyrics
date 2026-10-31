import { sampleFrameTimingWindow } from './frameTimingDemand';
import { getLibraryTraceLines } from '../nativeBridge/api/libraryTrace.js';
import { getQrLoginTraceLines } from '../nativeBridge/api/qrLoginTrace.js';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { readCrashDiagnostics, readDiagnosticsHeartbeats, readNativePlaybackFailureTrace } from './crashDiagnostics';
import { readPlaybackContinuitySnapshot } from './mediaDiagnostics';
import { readFrameTimingSnapshot, runCpuProbe } from './frameTimingDiagnostics';
import { readLastAiThemeAttempt, readAiThemeAttempts, readFailedAiThemeAttempts } from './aiThemeDiagnostics';
import { isAiConfigured, readAiSettings } from '../services/aiSettings';
import { isNeutralAudioEffects } from './audioEffects';
import { getCollectionOrderDiagnosticLines } from './collectionOrderDiagnostics';
import { getOnlineMutationDiagnosticLines } from './onlineMutationDiagnostics';
import { getOnlinePlaybackDiagnosticLines } from './onlinePlaybackDiagnostics';
import { getLyricsDiagnosticLines } from './lyricsDiagnostics';
import { getPlaybackSongKey } from './appPlaybackGuards';
import { getLocalLibraryDiagnosticLines } from './localLibraryDiagnostics';
import {
    loadVideoLayerFileBlob,
    readVideoLayerStoreFailure,
    usesFileHandlePersistence,
} from '../services/videoLayerFile';
import { useVideoLayerSettingsStore } from '../stores/useVideoLayerSettingsStore';
import { collectWebGL2Diagnostics, formatWebGL2DiagnosticsLine } from './webglDiagnostics';
import { BUILTIN_VISUALIZER_BACKGROUND_MODES } from '../types/visualizerModes';
import {
    VISUALIZER_BACKGROUND_REGISTRY,
    hasVisualizerBackgroundMode,
} from '../components/visualizer/backgrounds/registry';

// src/utils/buildDiagnosticReport.ts
// 设置 → 帮助 → 复制诊断数据。给用户原样贴进 issue 用，所以字段固定为英文并包在代码块里。
// 只包含可以公开的内容：版本、运行环境、请求形态与条数，不含 cookie、token、账号。

const readLocalStorageFlag = (key: string): string => {
    try {
        const value = localStorage.getItem(key);
        if (value == null) return 'absent';
        return value.length > 0 ? `len=${value.length}` : 'empty';
    } catch {
        return 'unavailable';
    }
};

/** 原始值，不带长度或隐私含义——用于那些本身就是设置数值的键。 */
const readLocalStorageValue = (key: string): string => {
    try {
        const value = localStorage.getItem(key);
        return value == null || value === '' ? '(default)' : value;
    } catch {
        return 'unavailable';
    }
};

const formatPlaybackHeartbeat = (raw: string | null): string => {
    if (!raw) return '(none)';
    try {
        const value = JSON.parse(raw) as Record<string, unknown>;
        const at = typeof value.at === 'number' ? new Date(value.at).toISOString() : 'unknown';
        return `at=${at}`
            + ` visualizer=${value.visualizer ?? 'unknown'}`
            + ` background=${value.background ?? 'unknown'}`
            + ` playing=${value.playing === true}`
            + ` visibility=${value.visibility ?? 'unknown'}`
            + ` foreground=${value.foreground === true}`
            + ` screenOn=${value.screenOn === true}`;
    } catch {
        return raw;
    }
};

const formatServiceHeartbeat = (raw: string | null): string => {
    if (!raw) return '(none)';
    try {
        const value = JSON.parse(raw) as Record<string, unknown>;
        const at = typeof value.at === 'number' ? new Date(value.at).toISOString() : 'unknown';
        return `at=${at}`
            + ` playing=${value.playing === true}`
            + ` wakeLock=${value.wakeLock ?? 'unknown'}`
            + ` wifiLock=${value.wifiLock ?? 'unknown'}`
            + ` foreground=${value.foreground === true}`;
    } catch {
        return raw;
    }
};

/**
 * 背景选项列表只有一个来源：背景 registry。这里同时导出「声明的内置列表」和「运行时实际列表」，
 * 用来区分旧版本没有 nomand、mod 把条目删掉、以及注册表加载失败三种情况。
 */
const readVisualizerBackgroundLines = (): string[] => {
    const declared: string[] = [...BUILTIN_VISUALIZER_BACKGROUND_MODES];
    const live = VISUALIZER_BACKGROUND_REGISTRY.map(entry => String(entry.mode));
    const missing = declared.filter(mode => !live.includes(mode));
    const extra = live.filter(mode => !declared.includes(mode));
    return [
        `  declared builtins: ${declared.join(', ') || '(none)'}`,
        `  live registry: ${live.join(', ') || '(empty)'}`,
        `  nomand present: ${hasVisualizerBackgroundMode('nomand') ? 'yes' : 'no'}`,
        `  missing builtins: ${missing.length ? missing.join(', ') : '(none)'}`,
        `  extra/mod modes: ${extra.length ? extra.join(', ') : '(none)'}`,
        `  stored mode: ${readLocalStorageValue('visualizer_background_mode')}`,
    ];
};

const formatSeconds = (value: number | null): string => (
    value === null || !Number.isFinite(value) ? 'n/a' : `${value.toFixed(2)}s`
);

const formatMilliseconds = (value: number | null): string => (
    value === null || !Number.isFinite(value) ? 'n/a' : `${Math.round(value)}ms`
);

/**
 * 播放连续性现场：缓冲中断、网络停滞、主线程卡顿、输出链路和音频效果一起导出，避免把
 * 网易云的偶发卡顿误判成取链问题，也避免把用户开着的噪声音效当成平台故障。
 */
const readPlaybackContinuityLines = (): string[] => {
    const continuity = readPlaybackContinuitySnapshot();
    const audioSettings = useAudioSettingsStore.getState();
    const playback = usePlaybackStore.getState();
    const equalizer = audioSettings.audioEqualizerSettings;
    const effects = equalizer.effects;
    const lastEventAt = continuity.lastEventAt
        ? new Date(continuity.lastEventAt).toISOString()
        : '(not recorded)';
    const stream = continuity.stream;
    const decodeKbps = (() => {
        const bytes = continuity.decodedBytes;
        const media = continuity.decodedMediaSec;
        const baseBytes = continuity.decodeBaseBytes;
        const baseMedia = continuity.decodeBaseMediaSec;
        if (bytes === null || media === null || baseBytes === null || baseMedia === null) return null;
        const deltaBytes = bytes - baseBytes;
        const deltaMedia = media - baseMedia;
        if (deltaBytes <= 0 || deltaMedia <= 1) return null;
        return (deltaBytes * 8) / deltaMedia / 1000;
    })();
    return [
        `  source: ${continuity.source}`,
        // 「歌卡」这类反馈先看这一行：拿到的是 mp3 还是 flac、多少码率、是不是试听片段。
        `  stream: ${stream
            ? `${stream.provider} level=${stream.resolvedLevel}`
                + `${stream.requestedLevel ? `(requested ${stream.requestedLevel})` : ''}`
                + ` br=${stream.bitrateKbps === null ? 'n/a' : `${Math.round(stream.bitrateKbps)}kbps`}`
                + ` format=${stream.format} host=${stream.host}`
                + `${stream.sizeMb === null ? ''
                    : ` size=${(stream.sizeMb < 1 ? stream.sizeMb.toFixed(2) : stream.sizeMb.toFixed(1))}MB`}`
                + `${stream.trial ? ' TRIAL-CLIP' : ''}`
            : '(not recorded)'}`,
        `  deck: ${continuity.deck} readyState=${continuity.readyState} networkState=${continuity.networkState}`,
        `  buffer: ahead=${formatSeconds(continuity.bufferedAheadSec)} ranges=${continuity.bufferedRanges}`,
        `  interruptions: waiting=${continuity.waitingCount} total=${formatMilliseconds(continuity.waitingTotalMs)}`
            + ` max=${formatMilliseconds(continuity.waitingMaxMs)} last=${formatMilliseconds(continuity.lastWaitingMs)}`,
        `  network stalls: stalled=${continuity.stalledCount} errors=${continuity.errorCount}`,
        // 播放中如果位置/速率被改过（我们或系统），会在这里留下计数；配合解码进度就能分清
        // 「网络不够」「解码跟不上」「我们动了播放位置」这三种完全不同的卡。
        `  element events: seeking=${continuity.seekingCount} seeked=${continuity.seekedCount}`
            + ` ratechange=${continuity.rateChangeCount} rate=${continuity.playbackRate ?? 'n/a'}`,
        `  decode: bytes=${continuity.decodedBytes === null ? 'n/a' : `${(continuity.decodedBytes / 1048576).toFixed(1)}MB`}`
            + ` media=${formatSeconds(continuity.decodedMediaSec)}`
            + ` avg=${decodeKbps === null ? 'n/a' : `≈${Math.round(decodeKbps)}kbps`}`,
        `  main-thread stalls: count=${continuity.clockLagCount}`
            + ` total=${formatMilliseconds(continuity.clockLagTotalMs)}`
            + ` max=${formatMilliseconds(continuity.clockLagMaxMs)}`
            + ` last=${formatMilliseconds(continuity.lastClockLagMs)}`,
        `  audio clock: samples=${continuity.clockSamples}`
            + ` lag=${continuity.clockLagCount}`
            + ` progress=${continuity.lastClockProgressRatio === null
                ? 'n/a'
                : `${(continuity.lastClockProgressRatio * 100).toFixed(0)}%`}`
            + ` (media/wall; <75% counts as a stall)`,
        `  last audio event: ${continuity.lastEvent} at=${lastEventAt}`,
        `  audio context: state=${continuity.audioContextState}`
            + ` sampleRate=${continuity.audioContextSampleRate ?? 'n/a'}`
            + ` baseLatency=${formatSeconds(continuity.audioContextBaseLatencySec)}`
            + ` outputLatency=${formatSeconds(continuity.audioContextOutputLatencySec)}`
            + ` latencyHint=${continuity.audioContextLatencyHint}`
            + ` renderCapacity=${continuity.audioContextRenderCapacity === null
                ? 'n/a'
                : continuity.audioContextRenderCapacity.toFixed(3)}`
            + ` stateChanges=${continuity.audioContextStateChangeCount}`
            + ` lastStateChange=${continuity.audioContextLastStateChangeAt
                ? new Date(continuity.audioContextLastStateChangeAt).toISOString()
                : 'n/a'}`,
        `  output settings: quality=${audioSettings.audioQuality} replayGain=${playback.replayGainMode}`
            + ` fade=${audioSettings.playbackFadeEnabled ? 'on' : 'off'}`,
        `  effects: enabled=${equalizer.enabled ? 'yes' : 'no'}`
            + ` path=${equalizer.enabled && !isNeutralAudioEffects(effects) ? 'processed' : 'bypassed'}`
            + ` highpass=${effects.highpass} lowpass=${effects.lowpass}`
            + ` drive=${effects.drive} crush=${effects.crush} wow=${effects.wow}`
            + ` noise=${effects.noise} width=${effects.width} space=${effects.space} punch=${effects.punch}`,
    ];
};

/**
 * 帧耗时与卡顿归属。用户报「卡顿」时先看这一段：
 * 单帧阻塞 100ms 以上（loafHeavy）即使整体统计看着平滑，也算我们这边的卡 —— 现场那次
 * 150ms 阻塞（脚本 198ms、样式布局 0ms、出处在 LatticeLyrics 的 rAF 回调）就是这么被抓到的。
 */
export type StutterAttributionInput = {
    renderHealth: 'smooth' | 'mild' | 'heavy' | 'unknown';
    loafHeavy: boolean;
    scriptHeavy: boolean;
    audioStalled: boolean;
};

/** 卡顿归因（纯函数，便于回归）。 */
export const resolveStutterAttribution = (input: StutterAttributionInput): string => {
    const renderHeavy = input.renderHealth === 'heavy';
    if (input.renderHealth === 'unknown' && !input.loafHeavy) return 'insufficient-samples';
    if ((renderHeavy || input.loafHeavy) && input.scriptHeavy) return 'app-script';
    if (renderHeavy && input.audioStalled) return 'device-throughput';
    if (renderHeavy || input.loafHeavy) return 'ui-thread-render';
    if (input.audioStalled) return 'audio-pipeline';
    return 'clean';
};

/**
 * 帧间隔分位数说明界面掉不掉帧，longtask 说明是不是我们自己的脚本占住主线程，
 * 核数 / 内存 / 处理器探针说明设备本身够不够用。三条凑在一起才能分清
 * 「我们的渲染开销」和「用户处理器性能不足」。
 */
const readFrameTimingLines = (): string[] => {
    const frames = readFrameTimingSnapshot();
    const continuity = readPlaybackContinuitySnapshot();
    const stats = frames.stats;
    const playback = usePlaybackStore.getState();
    // 探针自己会阻塞主线程，放在读取快照之后：跳过窗口已经在采样侧设好，不会污染上面的数字。
    const cpu = runCpuProbe();
    const percent = (value: number | null) => (value === null ? 'n/a' : `${value.toFixed(1)}ms`);
    const fps = (value: number | null) => (value === null ? 'n/a' : value.toFixed(1));
    const ratio = (count: number) => (
        stats.count > 0 ? `${((count / stats.count) * 100).toFixed(2)}%` : 'n/a'
    );
    const audioStalled = continuity.waitingCount > 0
        || continuity.stalledCount > 0
        || continuity.errorCount > 0;
    const bufferLow = continuity.bufferedAheadSec !== null && continuity.bufferedAheadSec < 5;
    const loaf = frames.longAnimationFrames;
    // 单帧阻塞 100ms 以上用户一定看得见，即使整体帧统计被大量平滑帧稀释成 smooth，也要按它定性。
    const loafHeavy = loaf.worstBlockingMs >= 100;
    // 我们的脚本占住主线程，和 GPU/合成器跟不上（设备渲染能力）是两种不同的卡顿。
    // 有 LoAF 数据时用「脚本 vs 样式/布局」的实际占比判断，比只看长任务条数可靠得多；
    // 没有 LoAF 的旧内核退回长任务启发式。
    const scriptHeavy = loaf.count > 0
        ? loaf.scriptMs >= loaf.styleLayoutMs && loaf.scriptMs >= 30
        : (frames.longTasks.count >= 3 || frames.longTasks.maxMs >= 200);
    const renderHeavy = frames.renderHealth === 'heavy';
    const attribution = resolveStutterAttribution({
        renderHealth: frames.renderHealth,
        loafHeavy,
        scriptHeavy,
        audioStalled,
    });

    return [
        `  sampler: installed=${frames.installed ? 'yes' : 'no'} visible=${(frames.visibleMs / 1000).toFixed(1)}s`
            + ` hidden=${(frames.hiddenMs / 1000).toFixed(1)}s frames=${frames.frameCount}`
            + ` recent-window=${stats.count}`,
        `  device: cores=${frames.cores ?? 'n/a'}`
            + ` memory=${frames.memoryGb === null ? 'n/a' : `${frames.memoryGb}GB`} class=${frames.deviceClass}`,
        `  display: refresh=${frames.refreshHz === null ? 'n/a' : `${frames.refreshHz}Hz`}`
            + ` viewport=${typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio}`}`,
        `  fps: recent-second=${fps(frames.recentSecondFps)} worst-second=${fps(frames.worstSecondFps)}`,
        `  frame time: p50=${percent(stats.p50Ms)} p90=${percent(stats.p90Ms)} p95=${percent(stats.p95Ms)}`
            + ` p99=${percent(stats.p99Ms)} max=${percent(stats.maxMs)}`,
        // 「日常播放不卡、一移动就掉帧」：移动中的帧单独一行，直接和上面的整体分位数对比。
        `  motion frames (scroll/touch): count=${frames.motion.count}`
            + ` p50=${percent(frames.motion.stats.p50Ms)}`
            + ` p95=${percent(frames.motion.stats.p95Ms)}`
            + ` max=${percent(frames.motion.stats.maxMs)}`
            + ` slow>32ms=${frames.motion.slowCount}`
            + ` jank>50ms=${frames.motion.jankCount}`
            + ` freeze>100ms=${frames.motion.freezeCount}`,
        `  dropped frames: slow>32ms=${stats.slowCount} (${ratio(stats.slowCount)})`
            + ` jank>50ms=${stats.jankCount} (${ratio(stats.jankCount)}) freeze>100ms=${stats.freezeCount}`,
        `  session totals: slow=${frames.sessionSlowCount} jank=${frames.sessionJankCount}`
            + ` freeze=${frames.sessionFreezeCount} longest-freeze=${formatMilliseconds(frames.longestFreezeMs)}`,
        `  long tasks (>50ms): count=${frames.longTasks.count}`
            + ` total=${formatMilliseconds(frames.longTasks.totalMs)} max=${formatMilliseconds(frames.longTasks.maxMs)}`
            + ` attribution: self=${frames.longTasks.selfCount} other=${frames.longTasks.otherCount}`
            + ` unknown=${frames.longTasks.unknownCount}`,
        // 这一行才说得清「到底是被谁占住的」：脚本 / 样式与布局 / 最重的那个文件与函数。
        `  long animation frames (>50ms): count=${loaf.count}`
            + ` max-blocking=${formatMilliseconds(loaf.maxBlockingMs)}`
            + ` scripts=${formatMilliseconds(loaf.scriptMs)}`
            + ` style+layout=${formatMilliseconds(loaf.styleLayoutMs)}`
            + ` worst=${formatMilliseconds(loaf.worstBlockingMs)}`
            + ` (script ${formatMilliseconds(loaf.worstScriptMs)}`
            + ` + style/layout ${formatMilliseconds(loaf.worstStyleLayoutMs)}`
            + ` @${loaf.worstInvoker || 'unknown'}`
            + `${loaf.worstAtMs !== null && frames.installedAtMs !== null
                ? ` worst@+${((loaf.worstAtMs - frames.installedAtMs) / 1000).toFixed(1)}s`
                : ''})`,
        ...loaf.samples
            .slice()
            .sort((a, b) => b.blockingMs - a.blockingMs)
            .slice(0, 5)
            .map(sample => (
                `  long frame: +${frames.installedAtMs === null
                    ? 'n/a'
                    : `${Math.max(0, (sample.atMs - frames.installedAtMs) / 1000).toFixed(1)}s`}`
                + ` blocking=${formatMilliseconds(sample.blockingMs)}`
                + ` script=${formatMilliseconds(sample.scriptMs)}`
                + ` style+layout=${formatMilliseconds(sample.styleLayoutMs)}`
                + ` @${sample.invoker}`
            )),
        `  cpu probe: ${(cpu.ops / 1e6).toFixed(1)}M ops in ${cpu.durationMs.toFixed(0)}ms`
            + ` index=${cpu.index} (${(cpu.opsPerSecond / 1e6).toFixed(1)}M ops/s, 跨设备相对值)`,
        `  playback while sampling: state=${String(playback.playerState)}`
            + ` audio=${audioStalled ? 'stalled' : 'clean'} buffer-ahead=${formatSeconds(continuity.bufferedAheadSec)}`
            + `${bufferLow ? ' (low)' : ''}`,
        `  render health: ${frames.renderHealth}`,
        // 归属结论连同两个决定性输入一起写出来，避免只看到结论没法复核。
        `  attribution: ${attribution} (cpu=${cpu.index}, audio=${audioStalled ? 'stalled' : 'clean'})`,
    ];
};

const readNativePlaybackDiagnostics = async (): Promise<{
    cover?: string;
    status?: string;
    detail?: string;
    at?: number;
    applied?: boolean;
    power?: string;
} | null> => {
    if (typeof window === 'undefined') return null;
    const plugin = (window as any).Capacitor?.Plugins?.FoliaNative;
    if (typeof plugin?.getPlaybackDiagnostics !== 'function') return null;
    try {
        return await plugin.getPlaybackDiagnostics();
    } catch {
        return null;
    }
};

/**
 * 背屏诊断：所有权状态机、相机持有/退出确认、LSP 租约命中与最近 40 条锁屏轨迹。
 * 原生侧只记录事件名、包名与显示电源状态，不含歌名、Cookie 或音源 URL。
 */
const readRearScreenLines = async (): Promise<string[]> => {
    if (typeof window === 'undefined') return ['  (no window)'];
    const capacitor = (window as unknown as {
        Capacitor?: {
            isNativePlatform?: () => boolean;
            Plugins?: { FoliaNative?: { getRearLyricsStatus?: () => Promise<{ diagnostics?: string; message?: string; enabled?: boolean; cameraSuspended?: boolean; faultLog?: string; faultCount?: number; lastWake?: string }> } };
        };
    }).Capacitor;
    if (!capacitor?.isNativePlatform?.()) return ['  (not an android runtime)'];
    const plugin = capacitor.Plugins?.FoliaNative;
    if (typeof plugin?.getRearLyricsStatus !== 'function') return ['  (rear diagnostics unavailable)'];
    try {
        const status = await plugin.getRearLyricsStatus();
        const body = String(status?.diagnostics ?? '').trim();
        const lines = body
            ? body.split('\n').map(line => `  ${line}`)
            : [`  (no rear diagnostics) enabled=${status?.enabled ?? 'unknown'} cameraSuspended=${status?.cameraSuspended ?? 'unknown'}`];
        // 「背屏故障诊断」：锁屏前后 0/5/60 秒的状态快照。判读一次「背屏不亮」需要同时看到
        // 面板真实状态（off / doze / on）、窗口三重身份（存在 / 附着 / 可见）与租约失效原因，
        // 这三类信息只在快照里共存。
        const faultCount = Number(status?.faultCount ?? 0);
        const faultLog = String(status?.faultLog ?? '').trim();
        lines.push(`  fault samples: ${faultCount}`);
        if (status?.lastWake) lines.push(`  last wake: ${String(status.lastWake)}`);
        if (!faultLog) {
            lines.push('  fault log: (empty — 锁屏一次或点「背屏故障诊断」后再导出)');
        } else {
            faultLog.split('\n').slice(-24).forEach(line => lines.push(`  ${line}`));
        }
        return lines;
    } catch (error) {
        return [`  (read failed: ${error instanceof Error ? error.message : String(error)})`];
    }
};

/**
 * 手机厂商屏幕顶部（挖孔 / 刘海）的现场。
 *
 * 「顶部还有黑边」时最需要知道的就是系统到底报了什么：cutout mode 是否已经切成
 * shortEdges、有没有识别到挖孔、安全区矩形是多少。全是设备侧只读信息，不含隐私。
 */
const readDisplayCutoutLines = async (): Promise<string[]> => {
    if (typeof window === 'undefined') return ['  (no window)'];
    const plugin = (window as unknown as {
        Capacitor?: { getPlatform?: () => string; Plugins?: { FoliaNative?: { getDisplayCutout?: () => Promise<unknown> } } };
    }).Capacitor;
    if (plugin?.getPlatform?.() !== 'android') {
        return ['  (not an android runtime)'];
    }
    const native = plugin?.Plugins?.FoliaNative;
    if (typeof native?.getDisplayCutout !== 'function') {
        return ['  (native cutout diagnostics unavailable)'];
    }
    try {
        const snapshot = await native.getDisplayCutout() as {
            available?: boolean;
            sdk?: number;
            layoutInDisplayCutoutMode?: number;
            hasCutout?: boolean;
            safeInsets?: { left?: number; top?: number; right?: number; bottom?: number };
            boundingRects?: Array<{ left?: number; top?: number; right?: number; bottom?: number }>;
            screenHeightPx?: number;
            decorHeightPx?: number;
            contentHeightPx?: number;
            webViewHeightPx?: number;
            webViewPaddingTopPx?: number;
            contentPaddingTopPx?: number;
            decorPaddingTopPx?: number;
            visibleFrame?: { left?: number; top?: number; right?: number; bottom?: number };
        } | null;
        if (!snapshot || snapshot.available === false) {
            return ['  (no decor view)'];
        }
        const insets = snapshot.safeInsets;
        const rects = Array.isArray(snapshot.boundingRects) ? snapshot.boundingRects : [];
        return [
            `  sdk: ${snapshot.sdk ?? 'unknown'}`,
            `  layoutInDisplayCutoutMode: ${describeCutoutMode(snapshot.layoutInDisplayCutoutMode)}`,
            `  hasCutout: ${snapshot.hasCutout ? 'yes' : 'no'}`,
            insets
                ? `  safe inset: left=${insets.left ?? 0} top=${insets.top ?? 0} right=${insets.right ?? 0} bottom=${insets.bottom ?? 0}`
                : '  safe inset: (none)',
            rects.length
                ? `  bounding rects: ${rects.map(rect => `[${rect.left ?? 0},${rect.top ?? 0},${rect.right ?? 0},${rect.bottom ?? 0}]`).join(' ')}`
                : '  bounding rects: (none)',
            `  height: screen=${snapshot.screenHeightPx ?? 'n/a'}`
                + ` decor=${snapshot.decorHeightPx ?? 'n/a'}`
                + ` content=${snapshot.contentHeightPx ?? 'n/a'}`,
            `  web view: height=${snapshot.webViewHeightPx ?? 'n/a'}`
                + ` paddingTop=${snapshot.webViewPaddingTopPx ?? 'n/a'}`,
            `  padding: decorTop=${snapshot.decorPaddingTopPx ?? 'n/a'}`
                + ` contentTop=${snapshot.contentPaddingTopPx ?? 'n/a'}`,
            snapshot.visibleFrame
                ? `  visible frame: [${snapshot.visibleFrame.left ?? 0},${snapshot.visibleFrame.top ?? 0},`
                    + `${snapshot.visibleFrame.right ?? 0},${snapshot.visibleFrame.bottom ?? 0}]`
                : '  visible frame: (unknown)',
        ];
    } catch (error) {
        return [`  cutout diagnostics unavailable: ${error instanceof Error ? error.message : String(error)}`];
    }
};

/** Android 的 layoutInDisplayCutoutMode 常量值对应关系，读起来比裸数字直观。 */
const describeCutoutMode = (mode: number | undefined): string => {
    if (mode == null) return 'unknown';
    if (mode === 0) return '0 (default)';
    if (mode === 1) return '1 (shortEdges)';
    if (mode === 2) return '2 (never)';
    if (mode === 3) return '3 (always)';
    return String(mode);
};

/**
 * 底部控制条的实际几何。
 *
 * 「控制条跑到画面中间」有两种完全不同的成因，光看设置值分不出来：
 * 1. 持久化的基线偏移量被调大了（值就在 `player_bottom_bar_offset`）；
 * 2. 那层 `absolute` 的包含块不是整屏（包含块被压扁后，`bottom: 32px` 也会落在画面中间）。
 * 所以这里把控制条矩形、它所在的绝对定位层、以及该层的包含块一并导出。
 */
const readBottomBarGeometry = (): string[] => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return ['  (no dom)'];
    }
    try {
        const bar = document.querySelector('[data-ponder="player-bar"]') as HTMLElement | null;
        if (!bar) return ['  bar: not mounted'];

        const rect = bar.getBoundingClientRect();

        const findAncestor = (
            start: HTMLElement | null,
            match: (element: HTMLElement) => boolean,
        ): HTMLElement | null => {
            let node: HTMLElement | null = start?.parentElement ?? null;
            while (node && node !== document.body) {
                if (match(node)) return node;
                node = node.parentElement;
            }
            return null;
        };

        // 实际定位层：最近的 absolute 祖先，它的 bottom 就是这条控制条的定位值。
        const layer = findAncestor(bar, element => getComputedStyle(element).position === 'absolute');
        const layerStyle = layer ? getComputedStyle(layer) : null;

        // 包含块：定位层之下的最近定位祖先，它的高度决定 bottom 是从哪里算起。
        const containingBlock = findAncestor(layer, element => getComputedStyle(element).position !== 'static');
        const blockRect = containingBlock?.getBoundingClientRect() ?? null;

        return [
            `  viewport: ${window.innerWidth}x${window.innerHeight}`,
            `  bar rect: top=${Math.round(rect.top)} bottom=${Math.round(rect.bottom)}`
                + ` height=${Math.round(rect.height)} gapToViewportBottom=${Math.round(window.innerHeight - rect.bottom)}`,
            `  layer: position=${layerStyle?.position ?? 'n/a'} bottom=${layerStyle?.bottom ?? 'n/a'}`,
            `  containing block: ${containingBlock?.tagName ?? 'none'}`
                + ` height=${blockRect ? Math.round(blockRect.height) : 'n/a'}`
                + ` top=${blockRect ? Math.round(blockRect.top) : 'n/a'}`
                + ` position=${containingBlock ? getComputedStyle(containingBlock).position : 'n/a'}`,
        ];
    } catch (error) {
        return [`  geometry unavailable: ${error instanceof Error ? error.message : String(error)}`];
    }
};

/**
 * AI 主题生成现场：provider、模型、触发方式、请求状态、原始错误与耗时。
 *
 * 「偶尔报错」最难查的是它不可复现，所以这里把最近几次调用（含成功的）都留一份，
 * 失败时还能看到失败前一次是否成功、耗时是否异常。只导出错误原文，不导出提示词或 Key。
 */
const readAiThemeGenerationLines = (): string[] => {
    const settings = readAiSettings();
    const attempts = readAiThemeAttempts();
    const last = readLastAiThemeAttempt();
    // 未走到请求就被跳过的那几条（封面取色源 / 没有歌词 / 正在生成中）单独列，
    // 免得和真正的模型失败混在一起 —— 「按了按钮什么都没发生」以前在报告里是空白。
    const skips = attempts.filter(entry => entry.stage === 'skipped');
    const failed = readFailedAiThemeAttempts().filter(entry => entry.stage !== 'skipped');
    const hostOf = (rawUrl: string): string => {
        if (!rawUrl) return '(default)';
        try {
            return new URL(rawUrl).hostname || '(default)';
        } catch {
            return '(invalid url)';
        }
    };
    const lines: string[] = [
        `  provider: ${settings.provider}`
            + ` configured=${isAiConfigured(settings) ? 'yes' : 'no'}`
            + ` model=${settings.provider === 'openai' ? (settings.openaiApiModel.trim() || '(default)') : 'gemini-3-flash-preview'}`,
        `  endpoint host: ${settings.provider === 'openai' ? hostOf(settings.openaiApiUrl.trim()) : 'generativelanguage.googleapis.com'}`,
        `  attempts: total=${attempts.length} failed=${failed.length} skipped=${skips.length}`,
        `  last: ${last ? formatAiThemeAttempt(last) : '(no AI theme generation recorded)'}`,
    ];
    if (skips.length) {
        lines.push('  skipped before the request:');
        skips.slice(-5).forEach((entry, index) => {
            lines.push(`    [${index + 1}] ${formatAiThemeAttempt(entry)}`);
        });
    }
    if (failed.length) {
        lines.push('  failed attempts:');
        failed.slice(-5).forEach((entry, index) => {
            lines.push(`    [${index + 1}] ${formatAiThemeAttempt(entry)}`);
        });
    }
    return lines;
};

const formatAiThemeAttempt = (entry: {
    at: number;
    provider: string;
    model: string;
    trigger: string;
    stage: string;
    ok: boolean;
    status?: number;
    error?: string;
    durationMs: number;
}): string => (
    `at=${new Date(entry.at).toISOString()}`
    + ` provider=${entry.provider}`
    + ` model=${entry.model}`
    + ` trigger=${entry.trigger}`
    + ` ok=${entry.ok ? 'yes' : 'no'}`
    + ` stage=${entry.stage}`
    + (entry.status ? ` status=${entry.status}` : '')
    + ` duration=${entry.durationMs}ms`
    + (entry.error ? ` error=${entry.error}` : '')
);

const formatByteSize = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) return '0B';
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(2)}GB`;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
    return `${Math.round(value)}B`;
};

/**
 * 视频层的本地视频在安卓上靠 IndexedDB 里的整份 Blob 持久化（桌面端存的是文件句柄）。
 *
 * 用户报「重启后视频没了」时，这几行能直接把范围分开：数据根本没写进去、写进去了但没被读回来、
 * 还是读回来了却没播出来 —— 这三种的修法完全不同，不该靠猜。
 */
const readVideoLayerLines = async (): Promise<string[]> => {
    const state = useVideoLayerSettingsStore.getState();
    const lines: string[] = [
        `  enabled: ${state.videoLayerEnabled} url: ${state.videoLayerUrl ? 'set' : '(none)'}`,
        `  runtime: status=${state.localFileStatus}`
            + ` name=${state.localFileStatus === 'none' ? '(none)' : (state.localFileName ?? '(unnamed)')}`,
        // 存的是句柄还是整份：安卓上曾经误走句柄那条路，报告里一眼能看出用的是哪种。
        `  pick path: ${usesFileHandlePersistence() ? 'file-handle' : 'indexeddb-blob'}`,
    ];

    try {
        const blob = await loadVideoLayerFileBlob();
        lines.push(
            `  stored: blob=${blob ? 'yes' : 'no'}`
            + (blob ? ` blob-size=${formatByteSize(blob.size ?? 0)} blob-name=${blob.name || '(unnamed)'}` : ''),
        );
    } catch (error) {
        lines.push(`  stored: read-error ${error instanceof Error ? error.message : 'unknown'}`);
    }

    // 写入失败时报告里只有一句 blob=no，看不出为什么 —— 上一次的异常在这里。
    const storeFailure = readVideoLayerStoreFailure();
    if (storeFailure) lines.push(`  last store failure: ${storeFailure}`);

    try {
        const storage = (navigator as Navigator & { storage?: StorageManager }).storage;
        const estimate = await storage?.estimate?.();
        if (estimate) {
            const persisted = typeof storage?.persisted === 'function' ? await storage.persisted() : false;
            lines.push(
                `  origin storage: persisted=${persisted ? 'yes' : 'no'}`
                + ` usage=${formatByteSize(estimate.usage ?? 0)} quota=${formatByteSize(estimate.quota ?? 0)}`,
            );
        } else {
            lines.push('  origin storage: (unavailable)');
        }
    } catch (error) {
        lines.push(`  origin storage: error ${error instanceof Error ? error.message : 'unknown'}`);
    }

    return lines;
};

/**
 * 「为什么第 N 首结束后不播了」和「为什么第 N 首之后灵动岛没词了」的共同现场。
 *
 * 两个问题都来自同一处：后台时原生队列与 WebView 谁也不再同步。因此这里把三方放在一起报：
 * 原生队列（剩余/等待/判定/补队列结果）、MediaSession 上的歌词状态、以及 JS 认为在播的歌
 * 是否就是原生在播的那一首。缺任何一项，报告就只能证明「停了」，不能证明「为什么停」。
 */
type NativeTrailEvent = {
    at: number;
    since?: number;
    repeat?: number;
    type: string;
    data?: Record<string, unknown>;
};

type NativeTrailBundle = {
    critical: NativeTrailEvent[];
    routine: NativeTrailEvent[];
    lifecycle: Record<string, unknown> | null;
    epoch: number;
    error: string;
};

/**
 * 原生常开播放轨迹（PlaybackDiagnostics，正式版也写入，落 SharedPreferences）。
 *
 * 这份记录是**唯一**能在正式版上留下「停播那一刻发生了什么」的东西：不依赖测试构建、
 * 不依赖 logcat、不含 URL 与歌词正文，且进程被杀后仍在，重开应用即可导出。
 *
 * 双通道是刻意的：以前只有一条环形缓冲，定时重试的 queue-wait 每几秒一条，
 * 会把真正解释停播的那条挤出窗口。critical（状态变化/错误/生命周期/歌词发布）
 * 只能被另一条 critical 挤掉，routine（队列询问/等待）单独成环并合并重复项。
 */
const readNativeTrailBundle = async (): Promise<NativeTrailBundle> => {
    const empty: NativeTrailBundle = { critical: [], routine: [], lifecycle: null, epoch: 0, error: '' };
    if (typeof window === 'undefined') return { ...empty, error: 'unavailable in this environment' };
    const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, any> } }).Capacitor?.Plugins ?? {};
    const playback = plugins.TingyuPlayback;
    if (typeof playback?.playbackDiagnostics !== 'function') return { ...empty, error: 'plugin missing' };
    try {
        const result = await playback.playbackDiagnostics();
        const read = (value: unknown): NativeTrailEvent[] => (
            Array.isArray(value)
                ? value.map((raw: any) => ({
                    at: Number(raw?.at ?? 0),
                    since: Number(raw?.since ?? 0) || undefined,
                    repeat: Number(raw?.repeat ?? 0) || undefined,
                    type: String(raw?.type ?? 'unknown'),
                    data: raw?.data && typeof raw.data === 'object' ? raw.data : undefined,
                }))
                : []
        );
        return {
            critical: read(result?.critical),
            routine: read(result?.routine),
            lifecycle: result?.lifecycle && typeof result.lifecycle === 'object' ? result.lifecycle : null,
            epoch: Number(result?.epoch ?? 0),
            error: '',
        };
    } catch (error) {
        return { ...empty, error: error instanceof Error ? error.message : 'unknown' };
    }
};

const clock = (at: number): string => (at > 0 ? new Date(at).toISOString().slice(11, 19) : '--:--:--');

const formatTrailEvent = (event: NativeTrailEvent): string => {
    const data = event.data ?? {};
    const fields = Object.keys(data)
        .filter(key => key !== 'song')
        .map(key => `${key}=${String(data[key])}`)
        .join(' ');
    const repeat = event.repeat && event.repeat > 1
        ? ` x${event.repeat} since ${clock(event.since ?? 0)}`
        : '';
    return `  ${clock(event.at)} ${event.type}`
        + (data.song === undefined ? '' : ` song=${String(data.song)}`)
        + (fields ? ` ${fields}` : '')
        + repeat;
};

const readNativePlaybackTrailLines = (bundle: NativeTrailBundle): string[] => {
    if (bundle.error) return [`  error ${bundle.error}`];
    const lines: string[] = [];
    lines.push(`  process epoch: ${bundle.epoch} (a new epoch means the process restarted)`);
    if (bundle.critical.length === 0 && bundle.routine.length === 0) {
        lines.push('  (empty)');
        return lines;
    }
    lines.push(`  critical (${bundle.critical.length}, last 60):`);
    if (bundle.critical.length === 0) lines.push('    (none)');
    else for (const event of bundle.critical.slice(-60)) lines.push(`  ${formatTrailEvent(event)}`);
    lines.push(`  routine (${bundle.routine.length}, last 12, coalesced):`);
    if (bundle.routine.length === 0) lines.push('    (none)');
    else for (const event of bundle.routine.slice(-12)) lines.push(`  ${formatTrailEvent(event)}`);
    return lines;
};

/**
 * 后台 JS 到底还活着吗 —— 四个互相独立的信号。
 *
 * `jsSilentMs` 单独一个数什么都证明不了：被系统冻结的 renderer、被系统销毁的 renderer、
 * 被销毁的 Activity、以及一个活着但无话可说的 WebView，在这一个数上完全相同。
 * 所以这里只并列四个信号，不下结论；判断要由人结合下面几行一起做。
 */
const readJsLivenessLines = (bundle: NativeTrailBundle): string[] => {
    const life = bundle.lifecycle;
    if (!life) return ['  (unavailable)', bundle.error ? `  error ${bundle.error}` : '  (no lifecycle state)'].filter(Boolean);
    const value = (key: string): string => (life[key] === undefined || life[key] === null ? 'n/a' : String(life[key]));
    const ms = (key: string): string => (Number(life[key] ?? -1) < 0 ? 'n/a' : `${Number(life[key])}ms`);
    return [
        `  activity: state=${value('activityState')} alive=${value('activityAlive')} forMs=${ms('activityStateForMs')}`,
        `  renderer: gone=${value('rendererGone')} count=${value('rendererGoneCount')} crashed=${value('rendererCrashed')} forMs=${ms('rendererGoneForMs')}`,
        `  bridge:   attached=${value('bridgeAttached')} detachedForMs=${ms('bridgeDetachedForMs')}`,
        `  commands: total=${value('jsCommands')} lastAt=${value('lastJsCommandAt') === '0' ? 'never' : clock(Number(life.lastJsCommandAt ?? 0))}`
        + ` silentMs=${value('jsSilentMs')} droppedAsks=${value('droppedAsks')} lastDropped=${value('lastDroppedAskType') || 'none'}`,
        '  note: silentMs alone does NOT mean "JS is dead". A frozen renderer, a destroyed',
        '        renderer and a destroyed Activity all produce the same number. The four lines',
        '        above have to agree before any conclusion is drawn.',
    ];
};

/**
 * C1/C2 的采样行：一次切歌、锁屏连播中、回到前台，各落一条 `session-sample`。
 *
 * 三行并排就能回答「卡片 00:00」属于哪一种：
 *   - durationMs 本身很小 + durationSource=playlist → 我们发布错了（单位/来源问题）；
 *   - durationMs=0 + durationSource=none           → 谁都不知道，Media3 还没解析出来；
 *   - durationMs 正确但 state/speed 不对            → 发布没问题，是系统端没刷新。
 */
const readSessionSampleLines = (bundle: NativeTrailBundle): string[] => {
    const samples = bundle.routine.filter(event => event.type === 'session-sample');
    const last = [...samples].reverse().find(event => (event.data?.trigger as string) === 'transition') ?? null;
    const latest = samples.length > 0 ? samples[samples.length - 1] : null;
    const format = (label: string, event: NativeTrailEvent | null): string => {
        if (!event) return `  ${label}: (never recorded)`;
        const data = event.data ?? {};
        return `  ${label}: ${clock(event.at)} trigger=${String(data.trigger ?? '-')} song=${String(data.song ?? '-')}`
            + ` positionMs=${String(data.positionMs ?? '-')} durationMs=${String(data.durationMs ?? '-')}`
            + ` durationSource=${String(data.durationSource ?? '-')}`
            + ` playing=${String(data.playing ?? '-')} state=${String(data.state ?? '-')} speed=${String(data.speed ?? '-')}`
            + ` takeover=${String(data.takeover ?? '-')}`
            + ` lyric=${String(data.lyricState ?? '-')} cached=${String(data.lyricCached ?? '-')}`
            + ` lyricAgeMs=${String(data.lyricPublishAgeMs ?? '-')}`;
    };
    const lyricLookup = [...bundle.critical].reverse().find(event => event.type === 'lyric-lookup') ?? null;
    const lookupLine = lyricLookup
        ? `  last lyric-lookup: ${clock(lyricLookup.at)} song=${String(lyricLookup.data?.song ?? '-')}`
            + ` cache=${String(lyricLookup.data?.state ?? '-')} cached=${String(lyricLookup.data?.cached ?? '-')}`
            + ` lastPublishAgeMs=${String(lyricLookup.data?.lastPublishAgeMs ?? '-')}`
            + ` takeover=${String(lyricLookup.data?.takeover ?? '-')} ahead=${String(lyricLookup.data?.ahead ?? '-')}`
        : '  last lyric-lookup: (never recorded)';
    return [
        format('sample at transition', last),
        format('sample latest      ', latest),
        lookupLine,
        '  note: durationSource=media3 means Media3 resolved the real container duration;',
        '        playlist means the value came from the queue before Media3 knew better.',
    ];
};

/**
 * 灵动岛歌词的三层证据，必须分开看：
 *
 *   layer 1 built     —— 我们构造出的 MediaMetadata 里到底有没有 lyricInfo（written=timeline/absent/stub）
 *   layer 2 published —— MediaSession 现在实际持有的 lyricInfo（用 MediaController 读回）
 *   layer 3 consumed  —— 系统 UI / 灵动岛模块是否渲染。这一层在本进程**不可观测**，
 *                        不做 Hook 就永远只能给出边界，不能给出结论。
 */
const readLyricSessionLines = (bundle: NativeTrailBundle): string[] => {
    const last = (type: string): NativeTrailEvent | null => {
        for (let i = bundle.critical.length - 1; i >= 0; i -= 1) {
            if (bundle.critical[i].type === type) return bundle.critical[i];
        }
        return null;
    };
    const describe = (label: string, event: NativeTrailEvent | null): string => {
        if (!event) return `  ${label}: (never recorded)`;
        const data = event.data ?? {};
        return `  ${label}: ${clock(event.at)} written=${String(data.written ?? 'n/a')}`
            + ` state=${String(data.state ?? '-')} song=${String(data.song ?? '-')}`
            + ` sessionSong=${String(data.sessionSong ?? '-')} songMatches=${String(data.songMatches ?? '-')}`
            + ` len=${String(data.len ?? '-')}`;
    };
    const request = last('lyric-request');
    // 原生补词链（C3）：所有取词都由播放服务自己做，所以这里每一步都必须能在设备上看得到。
    const native = (type: string): NativeTrailEvent | null => {
        for (let i = bundle.critical.length - 1; i >= 0; i -= 1) {
            if (bundle.critical[i].type === type) return bundle.critical[i];
        }
        for (let i = bundle.routine.length - 1; i >= 0; i -= 1) {
            if (bundle.routine[i].type === type) return bundle.routine[i];
        }
        return null;
    };
    const chain = (label: string, type: string, fields: string[]): string => {
        const event = native(type);
        if (!event) return `  ${label}: (never recorded)`;
        const data = event.data ?? {};
        const extra = fields.map(field => `${field}=${String(data[field] ?? '-')}`).join(' ');
        return `  ${label}: ${clock(event.at)} song=${String(data.song ?? '-')} ${extra}`;
    };
    return [
        describe('layer1 built    ', last('lyric-metadata')),
        describe('layer2 published', last('lyric-session')),
        '  layer3 consumed : NOT OBSERVABLE from this process (no hook into the system lyric UI).',
        '                    If layer2 says written=timeline + songMatches=yes for the song that is',
        '                    actually playing and the island is still empty, the remaining link is',
        '                    the consumer - that is a boundary, not a claim.',
        request
            ? `  last lyric-request: ${clock(request.at)} song=${String(request.data?.song ?? '-')}`
            : '  last lyric-request: (none)',
        '',
        '  native fetch chain (independent of Activity and of the WebView):',
        chain('request     ', 'lyrics-request', ['source', 'generation', 'activityStopped', 'durationMs']),
        chain('cache-hit   ', 'lyrics-cache-hit', ['source', 'state']),
        chain('fetch       ', 'lyrics-fetch', ['status', 'http', 'candidates', 'score', 'durationDeltaMs', 'elapsedMs']),
        chain('built       ', 'lyrics-built', ['chars', 'translation', 'reason']),
        chain('published   ', 'lyrics-published', ['wrote', 'matched', 'applied']),
        chain('failure     ', 'lyrics-failure', ['status', 'reason', 'http', 'elapsedMs']),
        chain('apply       ', 'lyrics-apply', ['matched', 'state', 'wrote']),
        '  note: lyrics-request with no matching lyrics-built/published/failure means the native',
        '        fetch is still in flight; lyrics-failure reason=network/rate-limited is retryable,',
        '        reason=none means the public lyric source really has no synced lyric for this track.',
    ];
};

/**
 * 原生封面链：地址 → 下载 → 解码 → 发布，四层分开。
 *
 * 混成一个「封面加载失败」就无法判断是队列里没有地址、图片 404、解码失败，还是根本没发布。
 */
const readNativeArtworkLines = (bundle: NativeTrailBundle): string[] => {
    const last = (type: string): NativeTrailEvent | null => {
        for (let i = bundle.critical.length - 1; i >= 0; i -= 1) {
            if (bundle.critical[i].type === type) return bundle.critical[i];
        }
        for (let i = bundle.routine.length - 1; i >= 0; i -= 1) {
            if (bundle.routine[i].type === type) return bundle.routine[i];
        }
        return null;
    };
    const line = (label: string, type: string, fields: string[]): string => {
        const event = last(type);
        if (!event) return `  ${label}: (never recorded)`;
        const data = event.data ?? {};
        const extra = fields.map(field => `${field}=${String(data[field] ?? '-')}`).join(' ');
        return `  ${label}: ${clock(event.at)} song=${String(data.song ?? '-')} ${extra}`;
    };
    return [
        line('uri        ', 'artwork-uri', ['state', 'matched']),
        line('fetch      ', 'artwork-fetch', ['status', 'http', 'bytes', 'elapsedMs']),
        line('cache-hit  ', 'artwork-cache-hit', ['source', 'state']),
        line('decoded    ', 'artwork-decoded', ['width', 'height']),
        line('published  ', 'artwork-published', ['matched', 'applied', 'reason', 'foreground']),
        line('apply      ', 'artwork-apply', ['matched', 'w', 'h']),
        line('failure    ', 'artwork-failure', ['status', 'http', 'elapsedMs']),
        line('kept       ', 'artwork-kept', ['reason']),
        '  note: artwork-uri state=missing means the queue item carried no cover address at all;',
        '        a fetch failure with status=HTTP_ERROR is a dead URL, NETWORK is retryable.',
        '        Whether the system lock screen actually shows the bitmap is not observable here.',
    ];
};

const readBackgroundContinuityLines = async (): Promise<string[]> => {
    if (typeof window === 'undefined') return ['  (unavailable in this environment)'];
    const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, any> } }).Capacitor?.Plugins ?? {};
    const lines: string[] = [];
    let nativeSongKey = '';
    try {
        const playback = plugins.TingyuPlayback;
        const diagnostics = typeof playback?.diagnostics === 'function' ? await playback.diagnostics() : null;
        const player = diagnostics?.player;
        if (!player) {
            lines.push('  native queue: (unavailable)');
        } else {
            nativeSongKey = String(player.songKey ?? '');
            lines.push(
                `  native queue: items=${player.queueItems} index=${player.queueIndex} remaining=${player.queueRemaining}`
                + ` continues=${player.queueContinues} waiting=${player.queueWaiting} heldOpen=${player.queueHeldOpen}`
                + ` verdict=${player.queueVerdict ?? 'none'} unknownAnswers=${player.queueUnknownAnswers ?? 0}`
                + ` livenessRearms=${player.queueLivenessRearms ?? 0}`
                + ` retries=${player.queueRetries}/${player.queueBudget ?? 0}`
                + ` accepted=${player.queueAccepted} rejected=${player.queueRejected} stale=${player.queueStale}`,
            );
            lines.push(
                `  native playback: state=${player.status} playWhenReady=${player.playWhenReady}`
                + ` suppression=${player.suppressionReason} offload=${player.offloadPreference}`
                + ` error=${player.message || 'none'}`,
            );
            // 后台 JS 到底还活着吗：跨桥命令的新旧程度是一个信号，但单凭它不能下结论，
            // 完整的四信号并列在下面的 "js liveness" 段。
            lines.push(
                `  js bridge: attached=${player.bridgeAttached === true ? 'yes' : 'no'}`
                + ` commands=${player.jsCommands ?? 0}`
                + ` silentMs=${player.jsSilentMs ?? -1} (not proof on its own; see "js liveness")`
                + ` silentAtLastAskMs=${player.jsSilentAtLastAskMs ?? -1}`,
            );
            // 阶段 A/B：原生逻辑歌单、后台续播与解析器。字段里没有任何 URL 与凭据。
            lines.push(
                `  native ledger: size=${player.ledgerSize ?? 0} mode=${player.ledgerMode ?? '-'}`
                + ` knowsCurrent=${player.ledgerKnowsCurrent === true ? 'yes' : 'no'}`,
            );
            lines.push(
                `  native continuation: last=${player.continuationLastDecision ?? '-'}`
                + ` resolving=${player.continuationResolving === true ? 'yes' : 'no'}`
                + ` takeovers=${player.continuationTakeovers ?? 0}`
                + ` fallbacks=${player.continuationFallbacks ?? 0}`
                + ` failures=${player.continuationFailures ?? 0}`
                + ` blocked=${player.continuationBudgetBlocked ?? 0}/${player.continuationBudgetMax ?? '-'}`,
            );
            lines.push(`  native resolvers: ${player.resolvers ?? '-'}`);
            // 队列保活：一次普通的 JS 歌单同步有没有把"已经准备好的下一首"带走。
            // 真机 1.3.50 停播的决定性证据只有 accepted=0 removed=1 两个数字，
            // 删的是哪一首、是不是已接管项都无从判断 —— 这一段补上那个缺口。
            lines.push(
                `  native queue: items=${player.queueItems ?? 0} index=${player.queueIndex ?? -1}`
                + ` remaining=${player.queueRemaining ?? 0} generation=${player.queueGeneration ?? -1}`
                + ` adoptedAhead=${player.queueNextAdopted === true ? 'yes' : 'no'}`,
            );
            lines.push(
                `  native queue last sync: removed=${player.queueLastRemoved ?? 0}`
                + ` preserved=${player.queueLastPreserved ?? 0}`
                + ` added=${player.queueLastAdded ?? 0}`
                + ` droppedAdopted=${player.queueLastDroppedAdopted ? player.queueLastDroppedAdopted : 'none'}`
                + ` addedFirst=${player.queueLastAddedFirst ? player.queueLastAddedFirst : 'none'}`
                + ` ageMs=${player.queueLastDiffAgeMs ?? -1}`,
            );
            // 音源兼容性：这首歌原本从哪来、原生挑了哪个解析器、洛雪引擎跑到哪一步。
            // 缺了这一段，就无法判断"本轮有没有覆盖用户实际的故障链路"。
            lines.push(
                `  native source: provider=${player.songSourceType ?? '-'}`
                + ` lxSource=${player.songLxSource ?? '-'}`
                + ` resolver=${player.songResolver ?? '-'}`
                + ` nativeReady=${player.songResolvable === true ? 'yes' : 'no'}`,
            );
            if (player.lxInstalled !== undefined) {
                lines.push(
                    `  lx engine: installed=${player.lxInstalled === true ? 'yes' : 'no'}`
                    + ` started=${player.lxStarted === true ? 'yes' : 'no'}`
                    + ` sources=${player.lxSources ?? '-'}`
                    + ` requests=${player.lxRequests ?? 0}`
                    + ` ok=${player.lxOk ?? 0}`
                    + ` failed=${player.lxFailed ?? 0}`
                    + ` lastHost=${player.lxLastHost ?? '-'}`
                    + ` lastMethod=${player.lxLastMethod || '-'}`
                    + ` lastStatus=${player.lxLastStatus ?? '-'}`
                    // 这次故障的关键证据：options 若被丢光，这里会是空，而 lastMethod 会退回 GET。
                    + ` lastOptions=${player.lxLastOptionKeys || '-'}`
                    + ` lastError=${player.lxLastError || 'none'}`,
                );
                // status=-1 只说明"没拿到响应"。谁关的连接要单列，否则只能猜是系统杀后台。
                if (player.lxLastHttpError) {
                    lines.push(
                        `  lx last http failure: ${player.lxLastHttpError}`
                        + ` ageMs=${player.lxLastHttpErrorAgeMs ?? -1}`,
                    );
                }
            }
        }
    } catch (error) {
        lines.push(`  native queue: error ${error instanceof Error ? error.message : 'unknown'}`);
    }
    try {
        const lyrics = plugins.FoliaColorOsLyrics;
        const status = typeof lyrics?.status === 'function' ? await lyrics.status({}) : null;
        lines.push(`  session lyric: state=${status?.state ?? 'unknown'}${status?.detail ? ` ${status.detail}` : ''}`);
    } catch {
        lines.push('  session lyric: (unavailable)');
    }
    // 身份对齐：两者不同就说明 WebView 还停在上一首，歌词与补队列都会跟着用错锚点。
    const current = usePlaybackStore.getState().currentSong;
    if (current) {
        const matches = getPlaybackSongKey(current) === nativeSongKey;
        lines.push(`  identity: webview-song-matches-native=${nativeSongKey === '' ? 'unknown' : String(matches)}`);
    }
    return lines;
};

export const buildDiagnosticReport = async (): Promise<string> => {
    await sampleFrameTimingWindow();
    const appVersion = typeof __APP_VERSION__ === 'undefined' ? 'unknown' : __APP_VERSION__;
    const heartbeats = await readDiagnosticsHeartbeats();
    const nativeTrail = await readNativeTrailBundle();
    const capacitor = (window as unknown as { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean } }).Capacitor;
    const lines: string[] = [
        '### Folia diagnostics',
        '',
        '```text',
        `generated: ${new Date().toISOString()}`,
        `app: ${appVersion}`,
        `platform: ${capacitor?.getPlatform?.() ?? 'web'}${capacitor?.isNativePlatform?.() ? ' (native)' : ''}`,
        `user agent: ${typeof navigator === 'undefined' ? '' : navigator.userAgent}`,
        `viewport: ${typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio}`}`,
        '',
        // 挖孔/刘海适配的现场：cutout mode、是否有挖孔、安全区矩形。
        'display cutout:',
        ...(await readDisplayCutoutLines()),
        '',
        // 背屏现场：所有权状态机、相机让屏、LSP 租约命中与锁屏轨迹。
        // 这是唯一能区分「相机仍在占用」和「我们的任务卡死」的证据，必须随报告导出。
        'rear screen:',
        ...(await readRearScreenLines()),
        '',
        'session storage:',
        `  qq session: ${readLocalStorageFlag('online_provider:qq:cookie')}`,
        `  netease session: ${readLocalStorageFlag('online_provider:netease:cookie')}`,
        `  kugou session: ${readLocalStorageFlag('online_provider:kugou:cookie')}`,
        '',
        // 视频层的本地视频重启后还在不在：写入 / 恢复 / 播放三段分开看。
        'video layer:',
        ...(await readVideoLayerLines()),
        '',
        // 底部控制条被误改到画面中间时，这两个值就是原因，所以一并导出。
        'ui settings:',
        `  bottom bar offset: ${readLocalStorageValue('player_bottom_bar_offset')} (base 32, max scales with viewport height)`,
        `  phone fit: ${readLocalStorageValue('folia_android_phone_fit')}`,
        `  phone fit orientation: ${readLocalStorageValue('folia_android_phone_fit_orientation')}`,
        `  command palette auto hide: ${readLocalStorageValue('auto_hide_command_palette_button')}`,
        `  hide player progress bar: ${readLocalStorageValue('hide_player_progress_bar')}`,
        '',
        'playback continuity:',
        ...readPlaybackContinuityLines(),
        '',
        // 后台连续播放与灵动岛歌词的共同现场：三方状态放在一起才解释得了「为什么停」。
        'background continuity:',
        ...(await readBackgroundContinuityLines()),
        '',
        // 原生侧常开轨迹：停播/掉词那一刻的事件序列（匿名、无 URL、无歌词正文）。
        // 进程被杀后仍然保留在 SharedPreferences 里，重开应用即可导出。
        'native playback trail (persisted across process death):',
        ...readNativePlaybackTrailLines(nativeTrail),
        '',
        // 后台 JS 是否仍在工作：四个互相独立的信号，并列不下结论。
        'js liveness (four independent signals, no verdict):',
        ...readJsLivenessLines(nativeTrail),
        '',
        // 灵动岛歌词：构造 / 发布 / 消费 三层分开，第三层明确标注为不可观测。
        'lyric pipeline (built / published / consumed):',
        ...readLyricSessionLines(nativeTrail),
        '',
        // 原生封面链：只在服务进程内发生，因此每一层都必须是可读的痕迹。
        'native artwork pipeline (uri / fetch / cache / decode / publish):',
        ...readNativeArtworkLines(nativeTrail),
        '',
        // C1/C2：切歌 / 锁屏连播 / 回前台三个时点的会话采样。
        'lock-screen session samples (position / duration / lyric):',
        ...readSessionSampleLines(nativeTrail),
        '',
        'playback heartbeat:',
        `  previous: ${formatPlaybackHeartbeat(heartbeats.playback.previous)}`,
        `  last: ${formatPlaybackHeartbeat(heartbeats.playback.last)}`,
        '',
        'service heartbeat:',
        `  previous: ${formatServiceHeartbeat(heartbeats.service.previous)}`,
        `  last: ${formatServiceHeartbeat(heartbeats.service.last)}`,
        '',
        // 漫游背景 / 部分可视化依赖 WebGL2：把真实能力写进报告，避免只能让用户在浏览器另测。
        'graphics capability:',
        formatWebGL2DiagnosticsLine(collectWebGL2Diagnostics()),
        '',
        'visualizer backgrounds:',
        ...readVisualizerBackgroundLines(),
        '',
        // 卡顿分流：帧耗时 + 长任务 + 处理器探针，用来区分我们的渲染开销和设备性能。
        'frame timing:',
        ...readFrameTimingLines(),
        '',
        'bottom bar geometry:',
        ...readBottomBarGeometry(),
        '',
        'ai theme generation:',
        ...readAiThemeGenerationLines(),
        '',
        'library request trace:',
    ];

    const libraryLines = getLibraryTraceLines();
    lines.push(...(libraryLines.length ? libraryLines.map(line => `  ${line}`) : ['  (none)']));

    const localLibraryLines = getLocalLibraryDiagnosticLines();
    lines.push('', 'local library trace:');
    lines.push(...(localLibraryLines.length ? localLibraryLines : ['  (none)']));

    const collectionOrderLines = getCollectionOrderDiagnosticLines();
    lines.push('', 'collection order trace:');
    lines.push(...(collectionOrderLines.length ? collectionOrderLines : ['  (none)']));

    // 在线写入失败的留痕：这些失败在请求轨迹里可能一条都没有（provider 提前拒绝），
    // 所以必须单独报，否则「收藏失败」在诊断里无迹可寻。
    const mutationLines = getOnlineMutationDiagnosticLines();
    lines.push('', 'online mutation trace:');
    lines.push(...(mutationLines.length ? mutationLines : ['  (none)']));

    // 在线取流 / 媒体播放失败的留痕：用户只会看到「暂时无法播放这首歌」，
    // 而这条路径以前在报告里一条记录都没有（分不清是哪家 provider、什么原因）。
    const playbackLines = getOnlinePlaybackDiagnosticLines();
    lines.push('', 'online playback trace:');
    lines.push(...(playbackLines.length ? playbackLines : ['  (none)']));

    const lyricsLines = getLyricsDiagnosticLines();
    lines.push('', 'lyrics pipeline trace:');
    lines.push(...(lyricsLines.length ? lyricsLines : ['  (none)']));

    const qrLines = getQrLoginTraceLines('qq');
    if (qrLines.length) {
        lines.push('', 'last qq login trace:');
        lines.push(...qrLines.map(line => `  ${line}`));
    }

    const crashEntries = await readCrashDiagnostics().catch(() => []);
    // 本地音频代理在播放器断开（切歌、拖动进度、Activity 销毁）时抛的 SocketException /
    // Connection reset 是预期的收尾，不是崩溃。以前它们会占满崩溃列表的 20 条、把真正的
    // 退出原因挤掉，所以单独归一行摘要，不进崩溃列表。
    const isAudioServerTeardown = (entry: { source?: string }) => entry.source === 'local-audio-server';
    const teardownEntries = crashEntries.filter(isAudioServerTeardown);
    const crashOnlyEntries = crashEntries.filter(entry => !isAudioServerTeardown(entry));
    lines.push('', 'crash diagnostics:');
    if (crashOnlyEntries.length === 0) {
        lines.push('  (none)');
    } else {
        crashOnlyEntries.slice(-20).forEach((entry, index) => {
            lines.push(
                `  [${index + 1}] at=${new Date(entry.at).toISOString()}`
                + ` source=${entry.source}`
                + ` thread=${entry.thread || 'unknown'}`
                + ` type=${entry.type}`,
                `      message=${entry.message || '(empty)'}`,
            );
            if (entry.stack) {
                const stackLines = entry.stack.split(/\r?\n/).slice(0, 8);
                lines.push(...stackLines.map(line => `      ${line}`));
            }
        });
    }
    if (teardownEntries.length > 0) {
        const lastTeardown = teardownEntries[teardownEntries.length - 1];
        lines.push(
            `  local audio server teardown: ${teardownEntries.length}`
            + ` (expected when the player disconnects; last at=${new Date(lastTeardown.at).toISOString()} type=${lastTeardown.type})`,
        );
    }

    const playbackDiagnostics = await readNativePlaybackDiagnostics();
    lines.push('', 'lock screen artwork:');
    if (!playbackDiagnostics) {
        lines.push('  (native diagnostics unavailable)');
    } else {
        lines.push(`  cover: ${playbackDiagnostics.cover || '(none)'}`);
        lines.push(`  status: ${playbackDiagnostics.status || 'unknown'}`);
        lines.push(`  detail: ${playbackDiagnostics.detail || '(empty)'}`);
        lines.push(`  applied: ${playbackDiagnostics.applied ? 'yes' : 'no'}`);
        lines.push(`  at: ${playbackDiagnostics.at ? new Date(playbackDiagnostics.at).toISOString() : '(not recorded)'}`);
        lines.push(`  power: ${playbackDiagnostics.power || '(not recorded)'}`);
    }

    // 常开的原生播放故障轨迹：队列耗尽、错误码、焦点/抑制变更、Service 生命周期等。
    // 条目本身已匿名化（歌曲只留哈希），这里再兜底做一次 URL 抹除。
    const failureTrace = await readNativePlaybackFailureTrace().catch(() => []);
    lines.push('', 'native playback failure trace:');
    if (failureTrace.length === 0) {
        lines.push('  (none)');
    } else {
        // The native ring holds 80 entries; a long background session is exactly when queue and
        // lyric transitions matter, so most of it is exported instead of only the last 30.
        failureTrace.slice(-60).forEach((entry, index) => {
            const data = entry.data
                ? Object.entries(entry.data).map(([key, value]) => `${key}=${String(value)}`).join(' ').slice(0, 300)
                : '';
            lines.push(`  [${index + 1}] at=${new Date(entry.at).toISOString()} type=${entry.type}${data ? ` ${data}` : ''}`);
        });
    }

    lines.push('```');
    return lines.join('\n');
};
