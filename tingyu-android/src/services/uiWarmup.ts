import { isAndroidNativeRuntime } from '../utils/platform';
import { navigationMark } from './navigationTiming';

// src/services/uiWarmup.ts
// Only speculative work waits for live handoff; explicit user imports never enter this queue.
type Work = { load: () => Promise<unknown>; owners: Set<symbol>; label: string };
const jobs = new Map<() => Promise<unknown>, Work>(), completed = new WeakSet<() => Promise<unknown>>();
let activeLoad: (() => Promise<unknown>) | undefined;
let running = false, scheduled = false, lastInput = -Infinity, lastFinished = -Infinity;
const ready = new Set<'chrome'|'page'>();
export function noteUiInteraction() { lastInput = performance.now(); }
export function markStartupReady(part: 'chrome'|'page') {
    if (!ready.has(part)) { ready.add(part); navigationMark(`startup-${part}-interactive`); schedule(); }
}
function schedule(delayMs = 0) {
    if (running || scheduled || !jobs.size || document.hidden) return;
    if (isAndroidNativeRuntime() && ready.size < 2) return;
    scheduled = true;
    // Idle callbacks can run repeatedly within one idle period. A real timer yields
    // the cooldown instead of polling performance.now() throughout that period.
    if (delayMs > 0) { window.setTimeout(() => { scheduled = false; schedule(); }, delayMs); return; }
    const run = (budget?: IdleDeadline) => {
        scheduled = false;
        if (document.hidden) return;
        const cooldown = Math.max(300 - (performance.now() - lastInput), 300 - (performance.now() - lastFinished));
        if (cooldown > 0) { schedule(Math.ceil(cooldown)); return; }
        if (budget && budget.timeRemaining() < 12) { schedule(50); return; }
        const entry = jobs.values().next().value;
        if (!entry) return;
        jobs.delete(entry.load); running = true; activeLoad=entry.load; navigationMark(`warmup-${entry.label}-start`); const started = performance.timeOrigin+performance.now();
        Promise.resolve().then(entry.load).then(()=>{completed.add(entry.load)},()=>{navigationMark(`warmup-${entry.label}-failed`)})
            .finally(() => { running = false; activeLoad=undefined; lastFinished=performance.now(); navigationMark(`warmup-${entry.label}-end`,started); schedule(); });
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run);
    else window.setTimeout(() => run(), 350);
}
let installed = false;
export function scheduleUiWarmup(load: () => Promise<unknown>, label: 'settings'|'collection'|'module' = 'module') {
    if (completed.has(load)||activeLoad===load) return () => {};
    if (!installed) {
        installed = true;
        window.addEventListener('pointerdown', noteUiInteraction, { passive: true });
        window.addEventListener('keydown', noteUiInteraction);
        document.addEventListener('visibilitychange', () => schedule());
    }
    const owner=Symbol(), job=jobs.get(load)??{load,owners:new Set<symbol>(),label};job.owners.add(owner);jobs.set(load,job);schedule();
    return () => { job.owners.delete(owner);if(!job.owners.size&&jobs.get(load)===job)jobs.delete(load); };
}
