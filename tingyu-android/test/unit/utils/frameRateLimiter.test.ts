import { describe, expect, it, vi } from 'vitest';
import { createFrameRateLimitedRaf, installGlobalVisualizerFrameRateLimiter, parseVisualizerFrameRate, setGlobalVisualizerFrameRate, shouldProcessFrameAtRate, VISUALIZER_FRAME_RATE_OPTIONS } from '../../../src/utils/frameRateLimiter';

// test/unit/utils/frameRateLimiter.test.ts

describe('frameRateLimiter', () => {
    it('parses supported visualizer frame rates', () => {
        expect(parseVisualizerFrameRate(null)).toBe('off');
        expect(parseVisualizerFrameRate('off')).toBe('off');
        expect(parseVisualizerFrameRate('auto')).toBe('off');
        expect(parseVisualizerFrameRate('120')).toBe(120);
        expect(parseVisualizerFrameRate('90')).toBe(90);
        expect(parseVisualizerFrameRate('60')).toBe(60);
        expect(parseVisualizerFrameRate('30')).toBe(30);
        expect(parseVisualizerFrameRate('15')).toBe('off');
        expect(parseVisualizerFrameRate('24')).toBe('off');
    });

    it('offers 30 FPS in the settings options', () => {
        expect(VISUALIZER_FRAME_RATE_OPTIONS).toContain(30);
        expect(VISUALIZER_FRAME_RATE_OPTIONS).toEqual([30, 60, 90, 120]);
    });

    it('skips frames until the target interval has elapsed', () => {
        expect(shouldProcessFrameAtRate(1000, 0, 60)).toBe(true);
        expect(shouldProcessFrameAtRate(1015, 1000, 60)).toBe(false);
        expect(shouldProcessFrameAtRate(1016, 1000, 60)).toBe(true);
    });

    it('always processes frames when disabled', () => {
        expect(shouldProcessFrameAtRate(1001, 1000, 'off')).toBe(true);
    });

    it('flushes all queued callbacks together on allowed frames', () => {
        const nativeCallbacks: FrameRequestCallback[] = [];
        const limiter = createFrameRateLimitedRaf(
            (callback) => {
                nativeCallbacks.push(callback);
                return nativeCallbacks.length;
            },
            () => undefined,
            60,
        );
        const processed: string[] = [];

        limiter.requestAnimationFrame(() => processed.push('a'));
        limiter.requestAnimationFrame(() => processed.push('b'));

        nativeCallbacks[0]?.(1000);
        expect(processed).toEqual(['a', 'b']);

        limiter.requestAnimationFrame(() => processed.push('c'));
        nativeCallbacks[1]?.(1015);
        expect(processed).toEqual(['a', 'b']);

        nativeCallbacks[2]?.(1016);
        expect(processed).toEqual(['a', 'b', 'c']);
    });

    it('continues flushing callbacks when one callback throws', () => {
        const originalConsoleError = console.error;
        const originalSetTimeout = globalThis.setTimeout;
        const nativeCallbacks: FrameRequestCallback[] = [];
        const reportedErrors: unknown[] = [];
        console.error = () => undefined;
        globalThis.setTimeout = ((callback: TimerHandler) => {
            try {
                if (typeof callback === 'function') {
                    callback();
                }
            } catch (error) {
                reportedErrors.push(error);
            }
            return 1 as unknown as ReturnType<typeof setTimeout>;
        }) as unknown as typeof setTimeout;

        try {
            const limiter = createFrameRateLimitedRaf(
                (callback) => {
                    nativeCallbacks.push(callback);
                    return nativeCallbacks.length;
                },
                () => undefined,
                60,
            );
            const error = new Error('boom');
            const processed: string[] = [];

            limiter.requestAnimationFrame(() => {
                throw error;
            });
            limiter.requestAnimationFrame(() => processed.push('after-error'));
            nativeCallbacks[0]?.(1000);

            expect(processed).toEqual(['after-error']);
            expect(reportedErrors).toEqual([error]);

            limiter.requestAnimationFrame(() => processed.push('next-frame'));
            nativeCallbacks[1]?.(1016);
            expect(processed).toEqual(['after-error', 'next-frame']);
        } finally {
            console.error = originalConsoleError;
            globalThis.setTimeout = originalSetTimeout;
        }
    });

    it('lets an earlier callback cancel a self-scheduling callback in the same frame', () => {
        const nativeCallbacks: FrameRequestCallback[] = [];
        const limiter = createFrameRateLimitedRaf(callback => {
            nativeCallbacks.push(callback);
            return nativeCallbacks.length;
        }, () => undefined);
        const processed: string[] = [];
        limiter.requestAnimationFrame(() => {
            processed.push('cancel');
            limiter.cancelAnimationFrame(rendererHandle);
        });
        const rendererHandle = limiter.requestAnimationFrame(() => {
            processed.push('renderer');
            limiter.requestAnimationFrame(() => processed.push('orphan'));
        });
        nativeCallbacks[0](1000);
        expect(processed).toEqual(['cancel']);
        expect(nativeCallbacks).toHaveLength(1);
    });

    it('cancels the native frame when the last queued callback is removed', () => {
        const cancelled: number[] = [];
        let requests = 0;
        const limiter = createFrameRateLimitedRaf(() => ++requests, handle => cancelled.push(handle));
        const first = limiter.requestAnimationFrame(() => undefined);
        const second = limiter.requestAnimationFrame(() => undefined);
        limiter.cancelAnimationFrame(first);
        expect(cancelled).toEqual([]);
        limiter.cancelAnimationFrame(second);
        expect(cancelled).toEqual([1]);
        limiter.requestAnimationFrame(() => undefined);
        expect(requests).toBe(2);
    });

    it('defers callbacks scheduled during a flush until the next frame', () => {
        const nativeCallbacks: FrameRequestCallback[] = [];
        const limiter = createFrameRateLimitedRaf(callback => { nativeCallbacks.push(callback); return nativeCallbacks.length; }, () => undefined);
        const processed: string[] = [];
        limiter.requestAnimationFrame(() => {
            processed.push('first');
            limiter.requestAnimationFrame(() => processed.push('next'));
        });
        nativeCallbacks[0](1000); expect(processed).toEqual(['first']);
        nativeCallbacks[1](1016); expect(processed).toEqual(['first', 'next']);
    });

    it('keeps the requested cadence on 60/90/120Hz displays instead of rounding 60Hz down to 45Hz', () => {
        for (const displayHz of [60, 90, 120]) for (const target of [30, 60] as const) {
            let id=0;const callbacks=new Map<number,FrameRequestCallback>(), times:number[]=[];
            const limiter=createFrameRateLimitedRaf(cb=>{callbacks.set(++id,cb);return id;},handle=>callbacks.delete(handle),target);
            const tick=(time:number)=>{times.push(time);limiter.requestAnimationFrame(tick);};
            limiter.requestAnimationFrame(tick);
            for(let n=0;n<displayHz*10;n++) {const batch=[...callbacks.values()];callbacks.clear();batch.forEach(fn=>fn(n*1000/displayHz));}
            expect(times.length).toBeGreaterThanOrEqual(target*10-1);
            expect(times.length).toBeLessThanOrEqual(target*10+1);
            expect(Math.max(...times.slice(1).map((t,i)=>t-times[i]))).toBeLessThanOrEqual(1000/target+1000/displayHz+.01);
            limiter.dispose();expect(callbacks.size).toBe(0);
        }
    });

    it('restores native requestAnimationFrame when disabled globally', () => {
        const previousWindow = (globalThis as { window?: Window; }).window;
        const originalRequestAnimationFrame = () => 1;
        const originalCancelAnimationFrame = () => undefined;
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: {
                requestAnimationFrame: originalRequestAnimationFrame,
                cancelAnimationFrame: originalCancelAnimationFrame,
                localStorage: { getItem: () => null },
            },
        });

        try {
            installGlobalVisualizerFrameRateLimiter(60);
            expect(globalThis.window.requestAnimationFrame).not.toBe(originalRequestAnimationFrame);

            setGlobalVisualizerFrameRate('off');
            expect(globalThis.window.requestAnimationFrame).toBe(originalRequestAnimationFrame);
            expect(globalThis.window.cancelAnimationFrame).toBe(originalCancelAnimationFrame);
        } finally {
            Object.defineProperty(globalThis, 'window', {
                configurable: true,
                value: previousWindow,
            });
        }
    });

    // 安卓歌词默认 60FPS，独立背景采用 30FPS；显式用户设置保持有效。
    // 用户一旦手动选过（storage 有值）或调用方显式覆盖，就永远以用户为准。
    describe('Android WebView default frame rate', () => {
        const installFakeWindow = (storedValue: string | null) => {
            const nativeCallbacks: FrameRequestCallback[] = [];
            const fakeWindow = {
                Capacitor: { getPlatform: () => 'android' },
                requestAnimationFrame: (callback: FrameRequestCallback) => {
                    nativeCallbacks.push(callback);
                    return nativeCallbacks.length;
                },
                cancelAnimationFrame: () => undefined,
                localStorage: { getItem: () => storedValue },
            };
            Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
            return { fakeWindow, nativeCallbacks };
        };

        // 在 1 秒的密集时间线里推原生帧，数实际被放过的帧数。
        const countFramesPerSecond = (fakeWindow: { requestAnimationFrame: (cb: FrameRequestCallback) => number; cancelAnimationFrame: () => void }, nativeCallbacks: FrameRequestCallback[]) => {
            let runs = 0;
            const tick = () => { runs += 1; fakeWindow.requestAnimationFrame(tick); };
            fakeWindow.requestAnimationFrame(tick);
            for (let t = 0; t <= 1000; t += 16) {
                const pending = nativeCallbacks.splice(0);
                for (const callback of pending) callback(t);
            }
            return runs;
        };

        it('uses 60 FPS foreground when nothing was ever stored', async () => {
            vi.resetModules();
            const previousWindow = (globalThis as { window?: unknown }).window;
            try {
                const { fakeWindow, nativeCallbacks } = installFakeWindow(null);
                const platform = await import('../../../src/utils/platform');
                const limiter = await import('../../../src/utils/frameRateLimiter');
                expect(platform.IS_ANDROID_WEBVIEW).toBe(true);

                limiter.installGlobalVisualizerFrameRateLimiter();
                const channel = await import('../../../src/utils/visualizerFrameChannel');
                const request = fakeWindow.requestAnimationFrame;
                const runs = countFramesPerSecond({ ...fakeWindow, requestAnimationFrame: channel.requestVisualizerAnimationFrame }, nativeCallbacks);
                expect(fakeWindow.requestAnimationFrame).toBe(request);
                // Foreground motion is smooth by default; wallpaper is tested separately.
                expect(runs).toBeGreaterThanOrEqual(58);
                expect(runs).toBeLessThanOrEqual(63);
            } finally {
                Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
                vi.resetModules();
            }
        });

        it('keeps the stored rate when the user has chosen one', async () => {
            vi.resetModules();
            const previousWindow = (globalThis as { window?: unknown }).window;
            try {
                const { fakeWindow, nativeCallbacks } = installFakeWindow('120');
                const limiter = await import('../../../src/utils/frameRateLimiter');
                limiter.installGlobalVisualizerFrameRateLimiter();
                const channel = await import('../../../src/utils/visualizerFrameChannel');
                const runs = countFramesPerSecond({ ...fakeWindow, requestAnimationFrame: channel.requestVisualizerAnimationFrame }, nativeCallbacks);
                expect(runs).toBeGreaterThan(40);
            } finally {
                Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
                vi.resetModules();
            }
        });
    });
});
