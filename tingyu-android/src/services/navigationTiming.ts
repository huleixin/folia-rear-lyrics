// src/services/navigationTiming.ts
// Opt in with localStorage.tingyu_navigation_diagnostics=1, then reload. No user content.
let enabled = false;
try { enabled = localStorage.getItem('tingyu_navigation_diagnostics') === '1'; } catch { /* Unavailable storage. */ }
const samples: { phase: string; at: number; elapsedMs?: number }[] = [];
export function navigationMark(phase: string, startedAt?: number) {
    if (!enabled) return;
    const sample = { phase, at: Date.now(), elapsedMs: startedAt === undefined ? undefined : Date.now() - startedAt };
    samples.push(sample); if (samples.length > 128) samples.shift();
    console.info('[TingyuNavigation]', sample);
}
export function navigationTimingSnapshot() { return samples.slice(); }

if (enabled && typeof PerformanceObserver !== 'undefined') {
    try {
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) navigationMark('js-long-task', Date.now() - entry.duration);
        });
        observer.observe({ type: 'longtask', buffered: true });
    } catch { /* Unsupported WebView entry type. */ }
}
