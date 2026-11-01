// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { scheduleUiWarmup, noteUiInteraction } from '@/services/uiWarmup';

// test/unit/services/uiWarmup.test.ts
it('serializes speculative imports, honors cancellation, and pauses when hidden', async () => {
    const idle: IdleRequestCallback[] = [];
    vi.stubGlobal('requestIdleCallback', (fn: IdleRequestCallback) => { idle.push(fn); return idle.length; });
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    let finish!: () => void;
    const first = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const second = vi.fn(async () => undefined), cancelled = vi.fn(async () => undefined);
    const stopFirst = scheduleUiWarmup(first), stopSecond = scheduleUiWarmup(second);
    scheduleUiWarmup(cancelled)();
    const budget = { didTimeout: false, timeRemaining: () => 20 };
    noteUiInteraction(); idle.shift()!(budget);
    expect(first).not.toHaveBeenCalled();
    clock.mockReturnValue(1400); idle.shift()!(budget);
    await Promise.resolve();
    expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled();
    hidden = true; finish();
    await vi.waitFor(() => expect(idle).toHaveLength(0));
    hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(idle).toHaveLength(1));
    idle.shift()!(budget); await Promise.resolve();
    expect(second).toHaveBeenCalledOnce(); expect(cancelled).not.toHaveBeenCalled();
    stopFirst(); stopSecond(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
