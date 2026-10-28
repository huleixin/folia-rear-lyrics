// src/utils/frameRateLimiter.ts
// Shared helpers and global RAF gate for optional visualizer frame throttling.

import type { VisualizerFrameRate } from '../types';
import { isAndroidNativeRuntime } from './platform';
import { configureVisualizerFrameChannel, hasVisualizerFrameChannel } from './visualizerFrameChannel';

type AnimationFrameCallback = FrameRequestCallback;
type RequestAnimationFrameFn = (callback: AnimationFrameCallback) => number;
type CancelAnimationFrameFn = (handle: number) => void;

export type FrameRateLimitedRaf = {
    requestAnimationFrame: RequestAnimationFrameFn;
    cancelAnimationFrame: CancelAnimationFrameFn;
    setFrameRate: (frameRate: VisualizerFrameRate) => void;
    getFrameRate: () => VisualizerFrameRate;
    dispose: () => void;
    setSuspended?: (suspended: boolean) => void;
};

type WindowWithVisualizerFrameRateLimiter = Window & {
    __foliaNativeRequestAnimationFrame?: RequestAnimationFrameFn;
    __foliaNativeCancelAnimationFrame?: CancelAnimationFrameFn;
};

export const VISUALIZER_FRAME_RATE_OPTIONS = [30, 60, 90, 120] as const satisfies VisualizerFrameRate[];
export const VISUALIZER_FRAME_RATE_STORAGE_KEY = 'visualizer_frame_rate';
const FRAME_INTERVAL_TOLERANCE_MS = 1;

export const isVisualizerFrameRate = (value: unknown): value is VisualizerFrameRate => (
    value === 'off'
    || value === 30
    || value === 120
    || value === 90
    || value === 60
);

export const parseVisualizerFrameRate = (value: string | null): VisualizerFrameRate => {
    if (value === 'off' || value === 'auto' || value === null) {
        return 'off';
    }

    const parsed = Number(value);
    return isVisualizerFrameRate(parsed) ? parsed : 'off';
};

// Decides whether a RAF tick should run under the configured FPS cap.
export const shouldProcessFrameAtRate = (
    timestampMs: number,
    lastProcessedTimestampMs: number,
    frameRate: VisualizerFrameRate,
) => {
    if (frameRate === 'off') {
        return true;
    }

    const intervalMs = 1000 / frameRate - FRAME_INTERVAL_TOLERANCE_MS;
    return lastProcessedTimestampMs === 0 || timestampMs - lastProcessedTimestampMs >= intervalMs;
};

const reportAnimationFrameCallbackError = (error: unknown) => {
    console.error('Error in requestAnimationFrame callback:', error);
    setTimeout(() => {
        throw error;
    }, 0);
};

// Creates a shared RAF queue so every callback scheduled for an allowed frame flushes together.
export const createFrameRateLimitedRaf = (
    nativeRequestAnimationFrame: RequestAnimationFrameFn,
    nativeCancelAnimationFrame: CancelAnimationFrameFn,
    initialFrameRate: VisualizerFrameRate = 60,
): FrameRateLimitedRaf => {
    let frameRate = initialFrameRate;
    let suspended = false;
    let nextHandle = 1;
    let nativeFrameHandle: number | null = null;
    let lastProcessedTimestamp: number | null = null;
    const callbacks = new Map<number, AnimationFrameCallback>();

    const scheduleNativeFrame = () => {
        if (suspended || nativeFrameHandle !== null || callbacks.size === 0) {
            return;
        }

        nativeFrameHandle = nativeRequestAnimationFrame(processNativeFrame);
    };

    const processNativeFrame = (timestamp: number) => {
        nativeFrameHandle = null;
        if (suspended) return;

        if (lastProcessedTimestamp !== null && frameRate !== 'off'
            && timestamp - lastProcessedTimestamp < 1000 / frameRate - FRAME_INTERVAL_TOLERANCE_MS) {
            scheduleNativeFrame();
            return;
        }

        if (frameRate === 'off' || lastProcessedTimestamp === null) lastProcessedTimestamp = timestamp;
        else {
            const interval = 1000 / frameRate, elapsed = timestamp - lastProcessedTimestamp;
            lastProcessedTimestamp = elapsed >= interval ? timestamp - elapsed % interval : lastProcessedTimestamp + interval;
        }
        const frameHandles = Array.from(callbacks.keys());

        for (const handle of frameHandles) {
            if (suspended) break;
            // Match native RAF: an earlier callback may cancel a later one in the same frame.
            const callback = callbacks.get(handle);
            if (!callback) continue;
            callbacks.delete(handle);
            try {
                callback(timestamp);
            } catch (error) {
                reportAnimationFrameCallbackError(error);
            }
        }

        scheduleNativeFrame();
    };

    return {
        setSuspended: (value) => {
            suspended = value;
            if (value && nativeFrameHandle !== null) { nativeCancelAnimationFrame(nativeFrameHandle); nativeFrameHandle = null; }
            if (!value) { lastProcessedTimestamp = null; scheduleNativeFrame(); }
        },
        requestAnimationFrame: (callback) => {
            const handle = nextHandle;
            nextHandle += 1;
            callbacks.set(handle, callback);
            scheduleNativeFrame();
            return handle;
        },
        cancelAnimationFrame: (handle) => {
            callbacks.delete(handle);
            if (callbacks.size === 0 && nativeFrameHandle !== null) {
                nativeCancelAnimationFrame(nativeFrameHandle);
                nativeFrameHandle = null;
            }
        },
        setFrameRate: (nextFrameRate) => {
            frameRate = nextFrameRate;
            lastProcessedTimestamp = null;

            if (nativeFrameHandle !== null) {
                nativeCancelAnimationFrame(nativeFrameHandle);
                nativeFrameHandle = null;
            }
            scheduleNativeFrame();
        },
        getFrameRate: () => frameRate,
        dispose: () => {
            callbacks.clear();
            if (nativeFrameHandle !== null) nativeCancelAnimationFrame(nativeFrameHandle);
            nativeFrameHandle = null;
        },
    };
};

let installedLimiter: FrameRateLimitedRaf | null = null;

export const setGlobalVisualizerFrameRate = (frameRate: VisualizerFrameRate) => {
    if (typeof window === 'undefined') {
        return;
    }
    if (isAndroidNativeRuntime() || hasVisualizerFrameChannel()) {
        configureVisualizerFrameChannel(frameRate, createFrameRateLimitedRaf);
        return;
    }

    if (frameRate === 'off') {
        restoreGlobalVisualizerFrameRateLimiter();
        return;
    }

    if (!installedLimiter) {
        installGlobalVisualizerFrameRateLimiter(frameRate);
        return;
    }

    installedLimiter.setFrameRate(frameRate);
};

export const restoreGlobalVisualizerFrameRateLimiter = () => {
    if (typeof window === 'undefined') {
        return;
    }

    const frameWindow = window as WindowWithVisualizerFrameRateLimiter;
    if (frameWindow.__foliaNativeRequestAnimationFrame) {
        window.requestAnimationFrame = frameWindow.__foliaNativeRequestAnimationFrame;
    }
    if (frameWindow.__foliaNativeCancelAnimationFrame) {
        window.cancelAnimationFrame = frameWindow.__foliaNativeCancelAnimationFrame;
    }
    installedLimiter = null;
};

export const installGlobalVisualizerFrameRateLimiter = (overrideFrameRate?: VisualizerFrameRate, scoped = isAndroidNativeRuntime()) => {
    if (typeof window === 'undefined') {
        return;
    }

    const initialFrameRate = overrideFrameRate
        ?? parseVisualizerFrameRate(window.localStorage.getItem(VISUALIZER_FRAME_RATE_STORAGE_KEY));
    // Android defaults to 60Hz for readable foreground motion, with a separate 30Hz wallpaper
    // budget. Explicit user frame caps (including unlimited) remain authoritative.
    const storedFrameRateRaw = window.localStorage.getItem(VISUALIZER_FRAME_RATE_STORAGE_KEY);
    const effectiveFrameRate = initialFrameRate === 'off'
        && !overrideFrameRate
        && storedFrameRateRaw === null
        && scoped
        ? 60
        : initialFrameRate;
    if (scoped) {
        configureVisualizerFrameChannel(effectiveFrameRate, createFrameRateLimitedRaf);
        return;
    }
    if (effectiveFrameRate === 'off') {
        restoreGlobalVisualizerFrameRateLimiter();
        return;
    }

    if (installedLimiter) {
        installedLimiter.setFrameRate(effectiveFrameRate);
        return;
    }

    const frameWindow = window as WindowWithVisualizerFrameRateLimiter;
    frameWindow.__foliaNativeRequestAnimationFrame ??= window.requestAnimationFrame;
    frameWindow.__foliaNativeCancelAnimationFrame ??= window.cancelAnimationFrame;
    const nativeRequestAnimationFrame: RequestAnimationFrameFn = (callback) => (
        frameWindow.__foliaNativeRequestAnimationFrame?.call(window, callback) ?? 0
    );
    const nativeCancelAnimationFrame: CancelAnimationFrameFn = (handle) => {
        frameWindow.__foliaNativeCancelAnimationFrame?.call(window, handle);
    };
    installedLimiter = createFrameRateLimitedRaf(nativeRequestAnimationFrame, nativeCancelAnimationFrame, effectiveFrameRate);

    window.requestAnimationFrame = installedLimiter.requestAnimationFrame;
    window.cancelAnimationFrame = installedLimiter.cancelAnimationFrame;
};
