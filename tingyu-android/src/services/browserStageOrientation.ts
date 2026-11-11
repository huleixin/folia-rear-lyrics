import type { StageOrientationSession, StageOrientationSnapshot } from './nativeStageOrientation';

// src/services/browserStageOrientation.ts
// Screen Orientation locks the real display. Fullscreen is acquired only on an explicit click.
type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
type Queue = <T>(operation: () => Promise<T>) => Promise<T>;

export function createBrowserStageOrientation(changed: (state: StageOrientationSnapshot) => void, queue: Queue): StageOrientationSession {
    const orientation = typeof screen === 'undefined' ? undefined : screen.orientation as LockableOrientation | undefined;
    const entry = orientation?.type;
    let closed = false, busy = false, landscape = false, ownsFullscreen = false;
    let fullscreenGeneration = 0;
    let cleanup: Promise<void> | undefined;
    const fullscreenRoot = typeof document === 'undefined' ? undefined : document.documentElement;
    const emit = (pending = false, error?: string) => changed({ landscape, pending, error });
    const restore = async () => {
        try {
            if (landscape && entry && orientation?.lock) await orientation.lock(entry);
        } finally {
            // Even a rejected restoration must release the acquired lock/fullscreen.
            if (landscape) orientation?.unlock();
            landscape = false;
            const exit = ownsFullscreen && document.fullscreenElement === fullscreenRoot;
            ownsFullscreen = false;
            if (exit) await document.exitFullscreen();
        }
    };
    const onFullscreen = () => {
        if (ownsFullscreen && document.fullscreenElement !== fullscreenRoot) {
            // Escape/browser Back already exited our fullscreen; release its orientation lock too.
            fullscreenGeneration++;
            ownsFullscreen = false; orientation?.unlock(); landscape = false; emit();
        }
    };
    const onPageHide = () => { void session.close().catch(() => undefined); };
    if (typeof document !== 'undefined') document.addEventListener('fullscreenchange', onFullscreen);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);
    const session: StageOrientationSession = {
        ready: Promise.resolve(),
        toggle() {
            if (closed || busy) return Promise.resolve();
            if (!orientation?.lock) return Promise.reject(new Error('此浏览器不支持屏幕方向锁定，请使用 Android 应用'));
            busy = true; emit(true);
            const generation = fullscreenGeneration;
            // requestFullscreen needs the button's user activation, before entering the async queue.
            let fullscreen: Promise<void>;
            try {
                if (!landscape && !document.fullscreenElement && fullscreenRoot?.requestFullscreen) {
                    fullscreen = fullscreenRoot.requestFullscreen().then(() => { ownsFullscreen = true; });
                } else fullscreen = Promise.resolve();
            } catch (error) { fullscreen = Promise.reject(error); }
            // Attach a rejection handler now, even if an older operation is still in the queue.
            const prepared = fullscreen.then(() => ({ error: undefined as unknown }), error => ({ error }));
            return queue(async () => {
                try {
                    const preparation = await prepared;
                    if (closed) { await restore(); return; }
                    if (preparation.error) throw preparation.error;
                    if (landscape) await restore();
                    else {
                        await orientation.lock!('landscape');
                        landscape = true;
                        if (closed || generation !== fullscreenGeneration) await restore();
                    }
                } catch (error) {
                    // Keep failure cleanup inside the queue, ahead of any new stage's lock.
                    try { await restore(); } finally { throw error; }
                }
            }).finally(() => { busy = false; emit(); });
        },
        close() {
            if (cleanup) return cleanup;
            closed = true;
            if (typeof document !== 'undefined') document.removeEventListener('fullscreenchange', onFullscreen);
            if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
            cleanup = queue(restore).finally(() => emit());
            return cleanup;
        },
    };
    return session;
}
