import { isFrameTimingSamplingEnabled, readFrameTimingSnapshot, setFrameTimingSamplingEnabled } from './frameTimingDiagnostics';

// src/utils/frameTimingDemand.ts
// Coalesce overlapping report requests; the passive mobile sampler returns to sleep after the window.
let pending: Promise<void> | null = null;
export function sampleFrameTimingWindow(durationMs = 1200): Promise<void> {
    if (pending) return pending;
    if (!readFrameTimingSnapshot().installed || isFrameTimingSamplingEnabled()) return Promise.resolve();
    setFrameTimingSamplingEnabled(true);
    pending = new Promise<void>(resolve => setTimeout(resolve, durationMs)).finally(() => {
        setFrameTimingSamplingEnabled(false); pending = null;
    });
    return pending;
}
