// src/services/uiWarmup.ts
// Speculative module work shares one queue; navigation imports bypass it on demand.
const jobs = new Map<symbol, () => Promise<unknown>>();
let running = false, scheduled = false;
let lastInput = -Infinity;
export function noteUiInteraction() { lastInput = performance.now(); }
function schedule() {
    if (running || scheduled || !jobs.size || document.hidden) return;
    scheduled = true;
    const run = (budget?: IdleDeadline) => {
        scheduled = false;
        if (document.hidden) return;
        if (performance.now() - lastInput < 300 || (budget && budget.timeRemaining() < 12)) { schedule(); return; }
        const entry = jobs.entries().next().value;
        if (!entry) return;
        jobs.delete(entry[0]); running = true;
        Promise.resolve().then(entry[1]).catch(() => undefined).finally(() => { running = false; schedule(); });
    };
    // No timeout: an idle deadline must never force speculative parsing over input.
    if (window.requestIdleCallback) window.requestIdleCallback(run);
    else window.setTimeout(() => run(), 350);
}
let installed = false;
export function scheduleUiWarmup(load: () => Promise<unknown>) {
    if (!installed) {
        installed = true;
        const input = noteUiInteraction;
        window.addEventListener('pointerdown', input, { passive: true });
        window.addEventListener('keydown', input);
        document.addEventListener('visibilitychange', schedule);
    }
    const id = Symbol(); jobs.set(id, load); schedule();
    return () => { jobs.delete(id); };
}
