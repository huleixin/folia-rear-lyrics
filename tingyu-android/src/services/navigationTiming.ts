import { chromeNative } from './nativeChrome';
import { isAndroidNativeRuntime } from '../utils/platform';

// src/services/navigationTiming.ts
// Same opt-in recorder for startup, input and export. No user text or resource URLs.
export type NavigationSample = { phase: string; at: number; elapsedMs?: number };
let enabled = false;
try { enabled = localStorage.getItem('tingyu_navigation_diagnostics') === '1'; } catch { /* Storage unavailable. */ }
const samples: NavigationSample[] = [];
let observer: PerformanceObserver | undefined, stopTimer: ReturnType<typeof setTimeout> | undefined;
const now = () => performance.timeOrigin + performance.now();
function add(sample: NavigationSample) {
    if (!enabled || !/^[a-z0-9:-]{1,80}$/.test(sample.phase)) return;
    if (samples.length >= 256) samples.splice(128, 1);
    samples.push(sample);
}
export function navigationMark(phase: string, startedAt?: number) {
    if (!enabled) return;
    add({ phase, at: now(), elapsedMs: startedAt === undefined ? undefined : Math.max(0, now() - startedAt) });
}
export function navigationTimingSnapshot() { return samples.slice(); }
export function navigationDiagnosticsEnabled() { return enabled; }
function sampling() {
    observer?.disconnect(); observer = undefined; clearTimeout(stopTimer);
    const remaining = 10000 - performance.now();
    if (!enabled || remaining <= 0 || typeof PerformanceObserver === 'undefined') return;
    try {
        observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) if (entry.startTime < 10000)
                add({ phase: 'js-long-task', at: performance.timeOrigin + entry.startTime, elapsedMs: entry.duration });
        });
        observer.observe({ type: 'longtask', buffered: true });
        stopTimer = setTimeout(() => { observer?.disconnect(); observer = undefined; }, remaining);
    } catch { /* Unsupported WebView entry type. */ }
}
export async function setNavigationDiagnostics(value: boolean) {
    if (isAndroidNativeRuntime()) await chromeNative.navigationDiagnostics({ enabled: value });
    localStorage.setItem('tingyu_navigation_diagnostics', value ? '1' : '0');
    enabled = value; if (!value) samples.length = 0;
    sampling(); navigationMark('diagnostics-enabled-next-cold-start');
}
export async function navigationDiagnosticLines(): Promise<string[]> {
    const before = now();
    let native: Awaited<ReturnType<typeof chromeNative.navigationDiagnostics>> | undefined;
    if (isAndroidNativeRuntime()) {
        try { native = await chromeNative.navigationDiagnostics({}); } catch { /* Report JS evidence even if native bridge is unavailable. */ }
    }
    const after = now(), offset = native ? native.nativeNow - (before + after) / 2 : 0;
    const combined = [...samples.map(s => ({ ...s, source: 'js' })), ...(native?.samples ?? []).map(s => ({ ...s, at: s.at - offset, source: 'native' }))].sort((a,b)=>a.at-b.at);
    const origin = native ? native.startedAt - offset : performance.timeOrigin;
    const cached=combined.find(s=>s.phase==='cached-shell-frame-boundary');
    const liveNav=combined.find(s=>s.phase==='nav-live-surface-accepted');
    const livePage=combined.find(s=>s.phase==='page-native-commit:home');
    const touch=combined.find(s=>s.phase==='touch-received');
    const business=touch?combined.find(s=>s.at>=touch.at&&s.phase.endsWith('business-start')):undefined;
    const gap=(from:typeof cached,to:typeof cached)=>from&&to?`${Math.max(0,to.at-from.at).toFixed(1)}ms`:'not observed';
    return ['cold-start navigation (opt-in):',
        `  cached frame boundary -> live nav accepted: ${gap(cached,liveNav)}`,
        `  cached frame boundary -> home commit: ${gap(cached,livePage)}`,
        `  first touch received -> business callback: ${gap(touch,business)}`,
 `  enabled: js=${enabled} native=${native?.enabled ?? 'unavailable'}`,
        `  originEpochMs=${origin.toFixed(1)} nativeMinusJsMs=${offset.toFixed(1)} alignmentUncertaintyMs<=${((after-before)/2).toFixed(1)}`,
        '  sampling: first 10 seconds only; first 128 + recent 128 events retained per runtime',
        '  FrameMetrics/Compose frame boundaries are app-frame evidence, not physical screen presentation',
        ...combined.map(s=>`  +${(s.at-origin).toFixed(1)}ms ${s.source} ${s.phase}${s.elapsedMs===undefined?'':` durationOrLagMs=${s.elapsedMs.toFixed(1)}`}`)];
}
sampling();
navigationMark('js-module-graph-ready');
