// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createBrowserStageOrientation } from '@/services/browserStageOrientation';
import type { StageOrientationSession } from '@/services/nativeStageOrientation';

// test/unit/services/browserStageOrientation.test.ts
let tail: Promise<unknown>, session: StageOrientationSession | undefined, fullscreen: Element | null;
let lock: ReturnType<typeof vi.fn>, unlock: ReturnType<typeof vi.fn>, exit: ReturnType<typeof vi.fn>, request: ReturnType<typeof vi.fn>;
const queue = <T>(operation: () => Promise<T>): Promise<T> => { const next = tail.then(operation); tail = next.catch(() => undefined); return next; };
beforeEach(() => {
    tail = Promise.resolve(); fullscreen = null;
    lock = vi.fn(async () => {}); unlock = vi.fn();
    vi.stubGlobal('screen', { orientation: { type: 'portrait-primary', lock, unlock } });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
    request = vi.fn(async () => { fullscreen = document.documentElement; });
    exit = vi.fn(async () => { fullscreen = null; document.dispatchEvent(new Event('fullscreenchange')); });
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
});
afterEach(async () => { await session?.close().catch(() => undefined); session = undefined; vi.unstubAllGlobals(); });

it('requests actual fullscreen within the click and restores the entry orientation on the second click', async () => {
    session = createBrowserStageOrientation(vi.fn(), queue);
    const rotating = session.toggle(); expect(request).toHaveBeenCalledOnce(); await rotating;
    expect(lock).toHaveBeenLastCalledWith('landscape');
    await session.toggle(); expect(lock).toHaveBeenLastCalledWith('portrait-primary');
    expect(unlock).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledOnce();
});
it('reports unsupported orientation and denied locks instead of claiming landscape', async () => {
    vi.stubGlobal('screen', { orientation: { type: 'portrait-primary', unlock } });
    const changed = vi.fn(); session = createBrowserStageOrientation(changed, queue);
    await expect(session.toggle()).rejects.toThrow('不支持'); expect(request).not.toHaveBeenCalled();
    await session.close();
    vi.stubGlobal('screen', { orientation: { type: 'portrait-primary', lock, unlock } });
    session = createBrowserStageOrientation(changed, queue); lock.mockRejectedValueOnce(new Error('NotSupportedError'));
    await expect(session.toggle()).rejects.toThrow('NotSupportedError');
    expect(changed).toHaveBeenLastCalledWith({ landscape: false, pending: false, error: undefined });
    expect(exit).toHaveBeenCalledOnce();
});
it('restores even when a landscape lock resolves after unmount', async () => {
    let resolve!: () => void; lock.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
    const changed = vi.fn(); session = createBrowserStageOrientation(changed, queue);
    const rotating = session.toggle(); await vi.waitFor(() => expect(lock).toHaveBeenCalledOnce());
    const closing = session.close(); resolve(); await rotating; await closing;
    expect(lock).toHaveBeenLastCalledWith('portrait-primary'); expect(unlock).toHaveBeenCalledOnce();
    expect(fullscreen).toBeNull(); expect(changed).toHaveBeenLastCalledWith({ landscape: false, pending: false, error: undefined });
});
it('leaves pre-existing fullscreen alone and releases orientation on cleanup', async () => {
    fullscreen = document.body; session = createBrowserStageOrientation(vi.fn(), queue);
    await session.toggle(); await session.close();
    expect(request).not.toHaveBeenCalled(); expect(exit).not.toHaveBeenCalled(); expect(unlock).toHaveBeenCalledOnce();
});
it('syncs fullscreen Escape/Back to portrait and releases the lock', async () => {
    const changed = vi.fn(); session = createBrowserStageOrientation(changed, queue); await session.toggle();
    fullscreen = null; document.dispatchEvent(new Event('fullscreenchange'));
    expect(unlock).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenLastCalledWith({ landscape: false, pending: false, error: undefined });
});
it('always unlocks and exits fullscreen even when restoring portrait is denied', async () => {
    const changed = vi.fn(); session = createBrowserStageOrientation(changed, queue); await session.toggle();
    lock.mockRejectedValueOnce(new Error('restoration denied'));
    await expect(session.toggle()).rejects.toThrow('restoration denied');
    expect(unlock).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenLastCalledWith({ landscape: false, pending: false, error: undefined });
});
it('cannot reenter landscape when a lock resolves after fullscreen Back', async () => {
    let resolve!: () => void; lock.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
    const changed = vi.fn(); session = createBrowserStageOrientation(changed, queue); const rotating = session.toggle();
    await vi.waitFor(() => expect(lock).toHaveBeenCalledOnce());
    fullscreen = null; document.dispatchEvent(new Event('fullscreenchange')); resolve(); await rotating;
    expect(lock).toHaveBeenLastCalledWith('portrait-primary');
    expect(changed).toHaveBeenLastCalledWith({ landscape: false, pending: false, error: undefined });
});
