// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';

// test/unit/services/rearPreparation.test.ts
afterEach(()=>{vi.useRealTimers();history.replaceState(null,'','/');vi.resetModules();});
it('does not prepare an ordinary rear or main document',async()=>{
    vi.useFakeTimers();history.replaceState(null,'','/rear-lyrics.html');
    const runtime=await import('@/services/rearPreparation');
    expect(runtime.isRearPreparing()).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it('bounds inactive native-card preparation and never restarts it on visibility changes',async()=>{
    vi.useFakeTimers();history.replaceState(null,'','/rear-lyrics.html?nativeCard=1');
    const runtime=await import('@/services/rearPreparation');expect(runtime.isRearPreparing()).toBe(true);
    await vi.advanceTimersByTimeAsync(4500);expect(runtime.isRearPreparing()).toBe(false);
    document.dispatchEvent(new Event('visibilitychange'));expect(runtime.isRearPreparing()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
});
it('ends preparation immediately when the native host puts the stage to sleep',async()=>{
    vi.useFakeTimers();history.replaceState(null,'','/rear-lyrics.html?nativeCard=1');
    const runtime=await import('@/services/rearPreparation');
    window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping:true}}));
    expect(runtime.isRearPreparing()).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it('does not give a late iframe another full preparation window',async()=>{
    vi.useFakeTimers();const deadline=Date.now()-1;
    history.replaceState(null,'','/rear-lyrics.html?nativeCard=1&prepareUntil='+deadline);
    const runtime=await import('@/services/rearPreparation');
    expect(runtime.isRearPreparing()).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
