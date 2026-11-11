// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { scheduleUiWarmup, noteUiInteraction } from '@/services/uiWarmup';

// test/unit/services/uiWarmup.test.ts
it('yields idle budget exhaustion instead of spinning within the same idle period', async () => {
    vi.resetModules(); vi.useFakeTimers();
    try {
        const scheduler = await import('@/services/uiWarmup');
        const idle: IdleRequestCallback[] = [];
        vi.stubGlobal('requestIdleCallback', (fn: IdleRequestCallback) => { idle.push(fn); return idle.length; });
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        vi.spyOn(performance, 'now').mockReturnValue(1000);
        const load = vi.fn(async () => undefined);
        const cancel = scheduler.scheduleUiWarmup(load);
        idle.shift()!({didTimeout:false,timeRemaining:()=>2});
        expect(idle).toHaveLength(0);
        expect(load).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(49); expect(idle).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(1); expect(idle).toHaveLength(1);
        cancel(); idle.shift()!({didTimeout:false,timeRemaining:()=>20});
        expect(load).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
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
    clock.mockReturnValue(1400); await vi.waitFor(() => expect(idle).toHaveLength(1), {timeout:1000}); idle.shift()!(budget);
    await Promise.resolve();
    expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled();
    hidden = true; finish();
    await new Promise(resolve=>setTimeout(resolve,0));
    await vi.waitFor(() => expect(idle).toHaveLength(0));
    clock.mockReturnValue(1800); hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(idle).toHaveLength(1));
    idle.shift()!(budget); await Promise.resolve();
    expect(second).toHaveBeenCalledOnce(); expect(cancelled).not.toHaveBeenCalled();
    stopFirst(); stopSecond(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});


it('waits for native page and chrome handoff, deduplicates owners and completed modules', async()=>{
    vi.resetModules();
    const scheduler=await import('@/services/uiWarmup');
    (window as any).Capacitor={getPlatform:()=> 'android'};
    const idle:IdleRequestCallback[]=[];
    vi.stubGlobal('requestIdleCallback',(fn:IdleRequestCallback)=>{idle.push(fn);return idle.length});
    vi.spyOn(document,'hidden','get').mockReturnValue(false);
    vi.spyOn(performance,'now').mockReturnValue(1000);
    const load=vi.fn(async()=>undefined);
    const cancel=scheduler.scheduleUiWarmup(load);scheduler.scheduleUiWarmup(load);cancel();
    expect(idle).toHaveLength(0);
    scheduler.markStartupReady('chrome');expect(idle).toHaveLength(0);
    scheduler.markStartupReady('page');expect(idle).toHaveLength(1);
    idle.shift()!({didTimeout:false,timeRemaining:()=>20});
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(load).toHaveBeenCalledOnce();
    scheduler.scheduleUiWarmup(load);expect(idle).toHaveLength(0);
    delete (window as any).Capacitor;vi.restoreAllMocks();vi.unstubAllGlobals();
});
