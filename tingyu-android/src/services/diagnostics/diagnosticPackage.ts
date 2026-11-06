// src/services/diagnostics/diagnosticPackage.ts
//
// 诊断包组装层：把「环境、事件、错误、性能、用户描述」拼成一次原生 ZIP 导出所需的全部分片。
//
// 分工：
//  - 事件流由原生拼（上一个会话 + 本次内存环），因为前端事件已经通过 diagnosticEvent 同步过去了；
//  - 错误文本、性能摘要、metadata、feedback 由这里生成；
//  - ZIP 写入与 FileProvider 分享在 android/.../diagnostics/DiagnosticPackage.java。
//
// 所有内容都在本机生成，没有任何上传路径。

import { buildDiagnosticReport } from '../../utils/buildDiagnosticReport';
import { readCrashDiagnostics, type CrashDiagnosticEntry } from '../../utils/crashDiagnostics';
import { readFrameTimingSnapshot } from '../../utils/frameTimingDiagnostics';
import {
    diagnosticEvent,
    diagnosticEventCount,
    diagnosticSessionId,
    diagnosticSessionStartedAt,
    exportDiagnosticEventsJsonl,
    flushDiagnosticLog,
    nativeDiagnosticsPlugin,
} from './diagnosticLog';

export type FeedbackCategory = 'crash' | 'playback' | 'lyrics' | 'display' | 'rear' | 'other';

export type FeedbackDraft = {
    category: FeedbackCategory;
    description: string;
    includeDiagnostics: boolean;
    /** dataURL（image/jpeg），最多 3 张，UI 侧已经压到长边 ≤1280 */
    screenshots: string[];
};

export type DiagnosticBundleParts = {
    metadata: string;
    errors: string;
    performance: string;
    feedback: string;
    report: string;
    screenshots: string[];
    eventCount: number;
    errorCount: number;
    generatedAt: number;
};

export type DiagnosticEnvironment = {
    buildId?: string;
    model?: string;
    manufacturer?: string;
    release?: string;
    sdk?: number;
    webview?: string;
    epoch?: number;
    bytes?: number;
};

export type DiagnosticExportOutcome =
    | { status: 'shared'; name: string; bytes: number; entries: number }
    | { status: 'fallback'; reason: string }
    | { status: 'cancelled' };

const appVersion = (): string =>
    (typeof __APP_VERSION__ === 'undefined' ? 'unknown' : __APP_VERSION__);

const buildType = (): string => {
    try {
        return import.meta.env.PROD ? 'release' : 'debug';
    } catch {
        return 'unknown';
    }
};

const readUserAgent = (): string =>
    (typeof navigator === 'undefined' ? '' : navigator.userAgent || '');

const parseUserAgent = (ua: string) => {
    const android = /Android\s+([\d.]+)/.exec(ua);
    const chrome = /Chrome\/([\d.]+)/.exec(ua);
    return {
        androidRelease: android ? android[1] : '',
        chromeVersion: chrome ? chrome[1] : '',
    };
};

/** 环境快照：原生可用时以原生为准，浏览器环境退回 UA 解析。 */
export const collectDiagnosticEnvironment = async (): Promise<DiagnosticEnvironment> => {
    const plugin = nativeDiagnosticsPlugin();
    if (!plugin?.diagnosticSession) return {};
    try {
        const result = await plugin.diagnosticSession();
        return {
            buildId: result?.buildId,
            model: result?.model,
            manufacturer: result?.manufacturer,
            release: result?.release,
            sdk: result?.sdk,
            webview: result?.webview,
            epoch: result?.epoch,
            bytes: result?.bytes,
        };
    } catch {
        return {};
    }
};

export const collectDiagnosticMetadata = async (): Promise<Record<string, unknown>> => {
    const environment = await collectDiagnosticEnvironment();
    const ua = readUserAgent();
    const parsed = parseUserAgent(ua);
    const screen = typeof window === 'undefined' ? null : window.screen;
    return {
        schema: 'tingyu-diagnostic/1',
        generatedAt: new Date().toISOString(),
        app: {
            versionName: appVersion(),
            buildType: buildType(),
            buildId: environment.buildId ?? '',
            packageName: 'io.github.huleixin.tingyu',
            runtime: 'capacitor-android',
        },
        device: {
            manufacturer: environment.manufacturer ?? '',
            model: environment.model ?? '',
            androidRelease: environment.release ?? parsed.androidRelease,
            sdk: environment.sdk ?? null,
            webview: environment.webview ?? '',
            chromeVersion: parsed.chromeVersion,
            screen: screen
                ? {
                    width: Math.round(screen.width),
                    height: Math.round(screen.height),
                    dpr: typeof window === 'undefined' ? null : window.devicePixelRatio,
                }
                : null,
            cores: typeof navigator === 'undefined' ? null : navigator.hardwareConcurrency ?? null,
            deviceMemoryGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
        },
        session: {
            id: diagnosticSessionId() || 'unknown',
            startedAt: new Date(diagnosticSessionStartedAt()).toISOString(),
            processEpoch: environment.epoch ?? null,
            eventCount: diagnosticEventCount(),
        },
        locale: typeof navigator === 'undefined' ? '' : navigator.language,
        timezone: (() => {
            try {
                return Intl.DateTimeFormat().resolvedOptions().timeZone;
            } catch {
                return '';
            }
        })(),
        retention: {
            eventsInMemory: 400,
            sessionFileBytes: environment.bytes ?? 0,
            policy: '本次 + 上一次会话；导出包最多保留 20 个 / 20MB',
        },
        privacy: {
            included: ['版本与设备型号', '结构化事件（无账号信息）', '崩溃堆栈', '性能摘要', '用户填写的描述'],
            excluded: ['密码', 'Cookie', 'Token', '账号与昵称', '私人文件内容', '完整歌词', '音频内容', '原始请求参数'],
        },
    };
};

/**
 * 报告已经脱敏过 token/cookie，但仍会带账号尾号等标识（uinTail=…7053、nickname=present）。
 * 进包之前再抹一遍：包会离开设备，文本报告不会。
 */
export const scrubReportForPackage = (report: string): string =>
    report
        .replace(/uinTail=…?\d+/g, 'uinTail=redacted')
        .replace(/nickname=present\(len=\d+\)/g, 'nickname=present')
        .replace(/([?&](?:token|key|sig|auth)=)[^&\s]+/gi, '$1redacted');

const formatCrashEntry = (entry: CrashDiagnosticEntry, index: number): string => {
    const at = Number.isFinite(entry.at) ? new Date(entry.at).toISOString() : 'unknown-time';
    const lines = [
        `[${index + 1}] ${at}  source=${entry.source}  thread=${entry.thread ?? '-'}  type=${entry.type}`,
        `    ${entry.message}`,
    ];
    if (entry.stack) {
        for (const line of String(entry.stack).split('\n').slice(0, 40)) {
            lines.push(`    ${line}`);
        }
    }
    return lines.join('\n');
};

export const collectDiagnosticErrors = async (): Promise<string> => {
    const entries = await readCrashDiagnostics().catch(() => [] as CrashDiagnosticEntry[]);
    const header = [
        '听屿 异常记录（errors.txt）',
        '说明：包含原生未捕获异常、WebView 渲染进程结束、Android 进程退出原因与前端异常。',
        `生成时间：${new Date().toISOString()}`,
        `记录条数：${entries.length}`,
        '',
    ].join('\n');
    if (entries.length === 0) {
        return `${header}(本次没有捕获到异常记录)\n`;
    }
    return `${header}${entries.map(formatCrashEntry).join('\n\n')}\n`;
};

export const collectDiagnosticPerformance = (): string => {
    const payload: Record<string, unknown> = {
        generatedAt: new Date().toISOString(),
        note: '帧时间来自 FrameMetrics / rAF 采样，是应用帧证据，不等于物理屏幕呈现。',
    };
    try {
        const snapshot = readFrameTimingSnapshot();
        payload.frameTiming = {
            installed: snapshot.installed,
            visibleMs: snapshot.visibleMs,
            hiddenMs: snapshot.hiddenMs,
            frameCount: snapshot.frameCount,
            stats: snapshot.stats,
            sessionSlowCount: snapshot.sessionSlowCount,
            sessionJankCount: snapshot.sessionJankCount,
            sessionFreezeCount: snapshot.sessionFreezeCount,
            longestFreezeMs: snapshot.longestFreezeMs,
            worstSecondFps: snapshot.worstSecondFps,
            recentSecondFps: snapshot.recentSecondFps,
            refreshHz: snapshot.refreshHz,
            deviceClass: snapshot.deviceClass,
            longTasks: snapshot.longTasks,
            // 原始帧间隔列表不进包：体积大且没有额外信息。
        };
    } catch {
        payload.frameTiming = null;
    }
    try {
        const navigation = performance.getEntriesByType('navigation')[0] as
            | PerformanceNavigationTiming
            | undefined;
        if (navigation) {
            payload.navigation = {
                type: navigation.type,
                domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
                loadEventMs: Math.round(navigation.loadEventEnd),
                transferSize: navigation.transferSize,
            };
        }
        payload.paint = performance
            .getEntriesByType('paint')
            .map((entry) => ({ name: entry.name, ms: Math.round(entry.startTime) }));
    } catch {
        // 老 WebView 没有这些 entry，缺就缺。
    }
    try {
        const memory = (performance as unknown as {
            memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
        }).memory;
        if (memory) {
            payload.jsHeap = {
                usedMb: Math.round(memory.usedJSHeapSize / 1048576),
                totalMb: Math.round(memory.totalJSHeapSize / 1048576),
            };
        }
    } catch {
        // ignore
    }
    return JSON.stringify(payload, null, 2);
};

/** 用户描述 + 类别。用户能看到自己写了什么，导出前可改。 */
export const formatFeedbackText = (draft: FeedbackDraft): string => {
    const description = (draft.description || '').trim();
    return [
        '听屿 问题反馈（feedback.txt）',
        `时间：${new Date().toISOString()}`,
        `类别：${draft.category}`,
        `附带诊断日志：${draft.includeDiagnostics ? '是' : '否'}`,
        `截图数量：${draft.includeDiagnostics ? draft.screenshots.length : 0}`,
        '',
        '--- 用户描述 ---',
        description.length > 0 ? description : '(用户没有填写描述)',
        '',
    ].join('\n');
};

/**
 * 组装诊断包的全部文本分片。只在用户点「预览 / 导出 / 分享」时调用 ——
 * buildDiagnosticReport 会遍历 30+ 个模块，不能放进常驻路径。
 */
export const buildDiagnosticBundle = async (draft: FeedbackDraft): Promise<DiagnosticBundleParts> => {
    await flushDiagnosticLog().catch(() => undefined);
    const [metadata, report] = await Promise.all([
        collectDiagnosticMetadata().catch(() => ({})),
        buildDiagnosticReport().catch(() => '(报告生成失败)'),
    ]);
    const errors = await collectDiagnosticErrors().catch(() => '(异常记录读取失败)');
    return {
        metadata: JSON.stringify(metadata, null, 2),
        errors,
        performance: collectDiagnosticPerformance(),
        feedback: formatFeedbackText(draft),
        report: scrubReportForPackage(report),
        screenshots: draft.includeDiagnostics ? draft.screenshots.slice(0, 3) : [],
        eventCount: diagnosticEventCount(),
        errorCount: (errors.match(/^\[\d+\]/gm) || []).length,
        generatedAt: Date.now(),
    };
};

/** 预览用的纯文本摘要：不生成 ZIP，不发分享，只读内存与本地记录。 */
export const buildDiagnosticPreview = async (draft: FeedbackDraft): Promise<string> => {
    const bundle = await buildDiagnosticBundle(draft);
    const metadata = (() => {
        try {
            return JSON.parse(bundle.metadata) as Record<string, any>;
        } catch {
            return {} as Record<string, any>;
        }
    })();
    return [
        '听屿 · 诊断信息预览',
        '',
        `版本      ${metadata?.app?.versionName ?? 'unknown'} (${metadata?.app?.buildId ?? '-'})`,
        `设备      ${metadata?.device?.manufacturer ?? ''} ${metadata?.device?.model ?? ''} · Android ${metadata?.device?.androidRelease ?? '-'}`,
        `WebView   ${metadata?.device?.webview ?? '-'}`,
        `会话      ${metadata?.session?.id ?? '-'} · 事件 ${bundle.eventCount} 条`,
        `异常      ${bundle.errorCount} 条`,
        `截图      ${bundle.screenshots.length} 张`,
        '',
        '-- 隐私 --',
        '不含密码、Cookie、Token、账号、私人文件、完整歌词与音频内容；',
        '只在点击「分享」后通过系统面板离开设备。',
        '',
        '-- 报告正文（节选） --',
        bundle.report.length > 4_000 ? `${bundle.report.slice(0, 4_000)}\n…（完整内容在诊断包里）` : bundle.report,
    ].join('\n');
};

/** 导出 ZIP 并拉起系统分享。原生不可用时返回 fallback，由界面降级为文本分享。 */
export const exportDiagnosticPackage = async (
    draft: FeedbackDraft,
    title: string,
): Promise<DiagnosticExportOutcome> => {
    const bundle = await buildDiagnosticBundle(draft);
    const plugin = nativeDiagnosticsPlugin() as (ReturnType<typeof nativeDiagnosticsPlugin> & {
        exportDiagnosticPackage?: (options: Record<string, unknown>) => Promise<{
            name?: string;
            bytes?: number;
            entries?: unknown[];
        }>;
    }) | null;
    if (!plugin?.exportDiagnosticPackage) {
        return { status: 'fallback', reason: 'native-unavailable' };
    }
    try {
        diagnosticEvent('feedback', 'info', 'export', {
            category: draft.category,
            withDiagnostics: draft.includeDiagnostics,
            screenshots: bundle.screenshots.length,
        });
        const result = await plugin.exportDiagnosticPackage({
            metadata: bundle.metadata,
            // events 留空：原生把「上一会话 + 本次内存环」拼好，避免重复。
            events: '',
            errors: bundle.errors,
            performance: bundle.performance,
            feedback: bundle.feedback,
            report: bundle.report,
            screenshots: bundle.screenshots,
            title,
        });
        return {
            status: 'shared',
            name: String(result?.name ?? 'diagnostic.zip'),
            bytes: Number(result?.bytes ?? 0),
            entries: Array.isArray(result?.entries) ? result.entries.length : 0,
        };
    } catch (error) {
        console.warn('[Diagnostics] export failed', error);
        return { status: 'fallback', reason: 'native-failed' };
    }
};

/** 供「删除诊断」使用：清事件流 + 已导出的包。 */
export const clearDiagnosticArtifacts = async (): Promise<number> => {
    const plugin = nativeDiagnosticsPlugin() as (ReturnType<typeof nativeDiagnosticsPlugin> & {
        clearDiagnosticData?: () => Promise<{ deleted?: number }>;
    }) | null;
    try {
        const result = await plugin?.clearDiagnosticData?.();
        return typeof result?.deleted === 'number' ? result.deleted : 0;
    } catch {
        return 0;
    }
};

export const diagnosticEventsJsonl = (): string => exportDiagnosticEventsJsonl();
