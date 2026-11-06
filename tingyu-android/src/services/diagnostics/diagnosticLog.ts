// src/services/diagnostics/diagnosticLog.ts
//
// 统一诊断事件流（前端侧）。
//
// 与 utils/crashDiagnostics.ts 的分工：那个模块负责「崩溃」的最后一帧（堆栈、文件、行号），
// 这个模块负责「崩溃之前发生了什么」的连续时间线。两者在诊断包里汇合：
// errors.txt 来自前者，events.jsonl 来自这里 + 原生镜像。
//
// 设计约束（对应 docs/ANDROID-DIAGNOSTICS-FEEDBACK-1.3.180.md）：
//  - 主线程零 IO：内存环形 + 1.5 秒批量交给原生写盘；
//  - 有界：内存 400 条、localStorage 160KB，超限丢最旧一半；
//  - 只记关键事件：同一 (module,event) 一秒一条，不逐帧、不逐进度；
//  - 脱敏：只放行标量，敏感键直接丢弃。

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type DiagnosticModule =
    | 'lifecycle'
    | 'nav'
    | 'ui'
    | 'playback'
    | 'audio'
    | 'source'
    | 'lyrics'
    | 'rear'
    | 'island'
    | 'lsp'
    | 'shizuku'
    | 'webview'
    | 'js'
    | 'perf'
    | 'feedback'
    | 'storage';

export type DiagnosticFieldValue = string | number | boolean | null | undefined;

export type DiagnosticEvent = {
    /** 毫秒时间戳（与原生同一时钟：都是 System.currentTimeMillis / Date.now） */
    t: number;
    /** 会话 ID，由原生侧下发；纯浏览器环境用本地生成的 id */
    s?: string;
    m: DiagnosticModule | string;
    l: DiagnosticLevel;
    e: string;
    r?: string;
    f?: Record<string, string | number | boolean>;
};

type NativeDiagnosticsPlugin = {
    diagnosticEvent?: (options: { lines: string }) => Promise<unknown>;
    diagnosticSession?: () => Promise<{
        sessionId?: string;
        startedAt?: number;
        epoch?: number;
        events?: number;
        bytes?: number;
        zipBytes?: number;
        buildId?: string;
        model?: string;
        manufacturer?: string;
        release?: string;
        sdk?: number;
        webview?: string;
    }>;
};

const STORAGE_KEY = 'tingyu_diagnostic_events_v1';
const MAX_EVENTS = 400;
const MAX_STORAGE_CHARS = 160_000;
const FLUSH_DELAY_MS = 1_500;
const FLUSH_BATCH = 20;
const MAX_PENDING = 300;
const THROTTLE_MS = 1_000;
const MAX_VALUE_CHARS = 240;

const SENSITIVE_PATTERN = /token|cookie|password|secret|authorization|uin|phone|email|lyric|path|file|url|nickname|account/i;

let events: DiagnosticEvent[] = [];
let pending: DiagnosticEvent[] = [];
let sessionId = '';
let sessionStartedAt = Date.now();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let initialized = false;
const lastAtByKey = new Map<string, number>();
/** 最近一次用户触摸（performance.now 基准）。给「点开某页用了多久」做分母。 */
let lastInteractionAt = 0;

export const nativeDiagnosticsPlugin = (): NativeDiagnosticsPlugin | null => {
    if (typeof window === 'undefined') return null;
    return (window as unknown as {
        Capacitor?: { Plugins?: { FoliaNative?: NativeDiagnosticsPlugin } };
    }).Capacitor?.Plugins?.FoliaNative ?? null;
};

const safeStorage = {
    read(): DiagnosticEvent[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter(isEvent).slice(-MAX_EVENTS) : [];
        } catch {
            return [];
        }
    },
    write(value: DiagnosticEvent[]) {
        try {
            let payload = JSON.stringify(value);
            while (payload.length > MAX_STORAGE_CHARS && value.length > 40) {
                value = value.slice(Math.ceil(value.length / 2));
                payload = JSON.stringify(value);
            }
            localStorage.setItem(STORAGE_KEY, payload);
        } catch {
            // 存储不可用（隐私模式/配额满）时只保留内存。
        }
    },
};

const isEvent = (value: unknown): value is DiagnosticEvent => {
    if (!value || typeof value !== 'object') return false;
    const event = value as DiagnosticEvent;
    return typeof event.t === 'number' && typeof event.e === 'string' && typeof event.m === 'string';
};

/** 与原生 DiagnosticFields 同一套规则：命中即整条字段丢弃。 */
export const isSensitiveDiagnosticKey = (key: string): boolean => SENSITIVE_PATTERN.test(key);

const clampText = (value: string, max = MAX_VALUE_CHARS): string => {
    const text = value.replace(/\u0000/g, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max)}…`;
};

const sanitizeFields = (
    fields?: Record<string, DiagnosticFieldValue>,
): Record<string, string | number | boolean> | undefined => {
    if (!fields) return undefined;
    const out: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(fields)) {
        if (!key || isSensitiveDiagnosticKey(key)) continue;
        if (value === null || value === undefined) continue;
        if (typeof value === 'boolean' || typeof value === 'number') {
            out[clampText(key, 32)] = value;
        } else if (typeof value === 'string') {
            out[clampText(key, 32)] = clampText(value);
        }
        // 对象 / 数组 / 函数一律丢弃：误传整份响应体是最大的隐私风险。
    }
    return Object.keys(out).length > 0 ? out : undefined;
};

const scheduleFlush = () => {
    if (flushTimer !== undefined) return;
    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        void flushDiagnosticLog();
    }, FLUSH_DELAY_MS);
};

const schedulePersist = () => {
    if (persistTimer !== undefined) return;
    persistTimer = setTimeout(() => {
        persistTimer = undefined;
        safeStorage.write(events);
    }, 2_000);
};

/** 初始化：读取本地历史、向原生取会话 ID。可重复调用。 */
export const initDiagnosticLog = (): void => {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;
    events = safeStorage.read();
    sessionStartedAt = Date.now();
    const plugin = nativeDiagnosticsPlugin();
    if (plugin?.diagnosticSession) {
        void plugin.diagnosticSession()
            .then((result) => {
                if (result?.sessionId) sessionId = result.sessionId;
                if (typeof result?.startedAt === 'number') sessionStartedAt = result.startedAt;
                void flushDiagnosticLog();
            })
            .catch(() => undefined);
    } else {
        sessionId = Math.random().toString(16).slice(2, 10);
    }
    // 只挂一个 passive 监听，用来给 page-enter 算「从点击到页面进入」的耗时；
    // 不记录坐标、不记录控件，避免变成隐形的行为埋点。
    if (typeof window !== 'undefined') {
        window.addEventListener('pointerdown', () => {
            lastInteractionAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        }, { capture: true, passive: true });
        document.addEventListener('visibilitychange', () => {
            diagnosticEvent('lifecycle', 'info', document.visibilityState === 'hidden' ? 'app-hidden' : 'app-visible');
        });
    }
    window.addEventListener('pagehide', () => void flushDiagnosticLog(), { capture: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void flushDiagnosticLog();
    });
};

/** 记录一条事件。被节流或参数非法时静默丢弃。 */
export const diagnosticEvent = (
    module: DiagnosticModule | string,
    level: DiagnosticLevel,
    name: string,
    fields?: Record<string, DiagnosticFieldValue>,
    ref?: string,
): void => {
    try {
        if (!module || !name) return;
        if (level === 'debug' || level === 'info') {
            const key = `${module}:${name}`;
            const now = Date.now();
            const last = lastAtByKey.get(key);
            if (last !== undefined && now - last < THROTTLE_MS) return;
            if (lastAtByKey.size > 512) lastAtByKey.clear();
            lastAtByKey.set(key, now);
        }
        const event: DiagnosticEvent = {
            t: Date.now(),
            m: String(module).slice(0, 24),
            l: level,
            e: clampText(name, 60),
        };
        if (sessionId) event.s = sessionId;
        if (ref) event.r = clampText(ref, 48);
        const safe = sanitizeFields(fields);
        if (safe) event.f = safe;

        events.push(event);
        if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
        pending.push(event);
        if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING);
        schedulePersist();
        scheduleFlush();
    } catch {
        // 诊断不能成为第二个故障源。
    }
};

/** 把待发事件交给原生。原生不在（浏览器 / OBS 源）时直接清空，避免无限堆积。 */
export const flushDiagnosticLog = async (): Promise<void> => {
    const plugin = nativeDiagnosticsPlugin();
    if (!plugin?.diagnosticEvent) {
        pending = [];
        return;
    }
    if (pending.length === 0) return;
    const batch = pending.slice(0, FLUSH_BATCH);
    pending = pending.slice(batch.length);
    try {
        await plugin.diagnosticEvent({ lines: batch.map((event) => JSON.stringify(event)).join('\n') });
    } catch {
        // 失败的批次放回队首，下次再试；超过上限就丢最旧。
        pending = [...batch, ...pending].slice(-MAX_PENDING);
    }
    if (pending.length > 0) scheduleFlush();
};

/** 读当前内存环（最旧在前）。 */
export const readDiagnosticEvents = (): DiagnosticEvent[] => events.slice();

/** 事件流 JSONL：给诊断包用。 */
export const exportDiagnosticEventsJsonl = (): string =>
    events.map((event) => JSON.stringify(event)).join('\n');

export const diagnosticEventCount = (): number => events.length;

export const diagnosticSessionId = (): string => sessionId;

export const diagnosticSessionStartedAt = (): number => sessionStartedAt;

/** 距离最近一次触摸过去了多少毫秒；没有触摸记录时返回 undefined。 */
export const millisecondsSinceInteraction = (): number | undefined => {
    if (!lastInteractionAt) return undefined;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const delta = Math.round(now - lastInteractionAt);
    return delta >= 0 && delta < 60_000 ? delta : undefined;
};

export const clearDiagnosticEvents = (): void => {
    events = [];
    pending = [];
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
};

/**
 * 轻量阶段计时：包住一次「打开设置 / 搜索 / 资料库 / 切舞台」的操作，
 * 结束时把耗时记进 perf 事件。只测显式调用点，不注册任何监听。
 */
export const startDiagnosticPhase = (name: string): (() => void) => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return () => {
        const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const durationMs = Math.round(endedAt - startedAt);
        diagnosticEvent('perf', durationMs > 400 ? 'warn' : 'info', `phase:${name}`, { ms: durationMs });
    };
};
