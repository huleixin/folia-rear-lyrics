import { getFoliaNative } from '../platform/foliaNative';
import { isAndroidNativeRuntime } from '../utils/platform';
import { createBrowserStageOrientation } from './browserStageOrientation';

// src/services/nativeStageOrientation.ts
// A session owns a transient main-display override; native events are the source of truth.
export type StageOrientationSnapshot = { landscape: boolean; pending: boolean; error?: string };
export type NativeStageOrientationState = StageOrientationSnapshot & {
    session: string; active: boolean; revision: number; reason: string;
};
export type StageOrientationCommand = { session?: string; active?: boolean; landscape?: boolean; revision?: number; reset?: boolean };
export type StageOrientationPlugin = {
    getStageOrientation(): Promise<NativeStageOrientationState>;
    setStageOrientation(command: StageOrientationCommand): Promise<NativeStageOrientationState>;
    addListener(name: 'stageOrientationChanged', listener: (state: NativeStageOrientationState) => void):
        Promise<{ remove(): Promise<void> }> | { remove(): Promise<void> };
};
export type StageOrientationSession = { ready: Promise<void>; toggle(): Promise<void>; close(): Promise<void> };
export const orientationError = (error: unknown): string =>
    error instanceof Error ? error.message : typeof error === 'string' ? error : '无法切换舞台屏幕方向';

// Serialize mutations across StrictMode/remounts, including cleanup after an in-flight lock.
let tail: Promise<unknown> = Promise.resolve();
export function enqueueStageOrientation<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
}
let serial = 0;
let current: StageOrientationSession | undefined;

export function createStageOrientationSession(changed: (state: StageOrientationSnapshot) => void): StageOrientationSession {
    const previous = current;
    if (previous) void previous.close().catch(() => undefined);
    const id = `stage-orientation-${Date.now()}-${++serial}`;
    const session = isAndroidNativeRuntime()
        ? createNativeSession(id, changed)
        : createBrowserStageOrientation(changed, enqueueStageOrientation);
    current = session;
    return session;
}

/** Reset/stop callers can release the current override without touching phone-fit preferences. */
export async function resetStageOrientation(): Promise<void> {
    const session = current; current = undefined;
    if (session) await session.close();
    else if (isAndroidNativeRuntime()) {
        await enqueueStageOrientation(() => getFoliaNative<StageOrientationPlugin>().setStageOrientation({ reset: true }));
    }
}

function createNativeSession(id: string, changed: (state: StageOrientationSnapshot) => void): StageOrientationSession {
    const plugin = getFoliaNative<StageOrientationPlugin>();
    let closed = false, busy = false, revision = -1;
    let state: StageOrientationSnapshot = { landscape: false, pending: false };
    let handle: { remove(): Promise<void> } | undefined;
    let cleanup: Promise<void> | undefined;
    const accept = (next: NativeStageOrientationState) => {
        if (closed || next.session !== id || next.revision <= revision) return;
        revision = next.revision;
        state = { landscape: next.landscape, pending: next.pending, error: next.error };
        changed(state);
    };
    // Subscribe before activating: Back/configuration can beat the command's promise response.
    const ready = Promise.resolve().then(() => plugin.addListener('stageOrientationChanged', accept))
        .then(async listener => {
            if (closed) { await listener.remove(); return; }
            handle = listener;
            await enqueueStageOrientation(async () => {
                if (!closed) accept(await plugin.setStageOrientation({ session: id, active: true }));
            });
        });
    const session: StageOrientationSession = {
        ready,
        async toggle() {
            if (closed || busy || state.pending) return;
            busy = true;
            try {
                await ready;
                await enqueueStageOrientation(async () => {
                    if (!closed) accept(await plugin.setStageOrientation({ session: id, landscape: !state.landscape, revision }));
                });
            } finally { busy = false; }
        },
        close() {
            if (cleanup) return cleanup;
            closed = true;
            if (current === session) current = undefined;
            // Clear UI immediately; deactivation still runs after any submitted native command.
            changed({ landscape: false, pending: false });
            const remove = handle ? Promise.resolve(handle.remove()).catch(() => undefined) : Promise.resolve();
            cleanup = enqueueStageOrientation(async () => {
                await plugin.setStageOrientation({ session: id, active: false });
            }).finally(() => remove);
            return cleanup;
        },
    };
    return session;
}
