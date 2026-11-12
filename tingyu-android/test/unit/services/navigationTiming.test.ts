// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const native=vi.hoisted(()=>({navigationDiagnostics:vi.fn()}));
vi.mock('@/services/nativeChrome',()=>({chromeNative:native}));

// test/unit/services/navigationTiming.test.ts
beforeEach(()=>{vi.resetModules();localStorage.clear();native.navigationDiagnostics.mockReset();delete (window as any).Capacitor});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();delete (window as any).Capacitor});
it('does no continuous sampling when off, stops after sixty seconds, and clears when disabled',async()=>{
    vi.useFakeTimers();
    const observe=vi.fn(),disconnect=vi.fn(),construct=vi.fn();
    vi.stubGlobal('PerformanceObserver',class{constructor(){construct()}observe=observe;disconnect=disconnect});
    const recorder=await import('@/services/navigationTiming');
    expect(construct).not.toHaveBeenCalled();
    recorder.navigationMark('off');expect(recorder.navigationTimingSnapshot()).toEqual([]);
    await recorder.setNavigationDiagnostics(true);expect(observe).toHaveBeenCalledOnce();
    recorder.navigationMark('first-touch');expect(recorder.navigationTimingSnapshot().some(s=>s.phase==='first-touch')).toBe(true);
    await vi.advanceTimersByTimeAsync(10000);expect(disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50001);expect(disconnect).toHaveBeenCalledOnce();
    await recorder.setNavigationDiagnostics(false);expect(recorder.navigationTimingSnapshot()).toEqual([]);
    await vi.advanceTimersByTimeAsync(10000);expect(observe).toHaveBeenCalledOnce();
});
it('preserves startup evidence with a bounded recent tail and merges native timestamps into export',async()=>{
    const recorder=await import('@/services/navigationTiming');await recorder.setNavigationDiagnostics(true);
    for(let i=0;i<400;i++)recorder.navigationMark(`phase-${i}`);
    recorder.navigationMark('https://private.example/token');
    const samples=recorder.navigationTimingSnapshot();
    expect(samples).toHaveLength(256);expect(samples.some(s=>s.phase==='phase-0')).toBe(true);expect(samples.at(-1)?.phase).toBe('phase-399');
    (window as any).Capacitor={getPlatform:()=> 'android'};
    const at=performance.timeOrigin+performance.now();
    native.navigationDiagnostics.mockResolvedValue({enabled:true,nativeNow:at,startedAt:at-500,samples:[{phase:'touch-received',at:at-100,elapsedMs:3}]});
    const report=(await recorder.navigationDiagnosticLines()).join('\n');
    expect(report).toContain('native touch-received');expect(report).toContain('alignmentUncertaintyMs');expect(report).not.toContain('private.example');
    await recorder.setNavigationDiagnostics(false);
});

it('does not attribute a later gesture callback to an earlier unhandled touch',async()=>{
    const recorder=await import('@/services/navigationTiming');await recorder.setNavigationDiagnostics(true);
    recorder.navigationMark('chrome-business-start',undefined,2);
    (window as any).Capacitor={getPlatform:()=> 'android'};
    const at=performance.timeOrigin+performance.now();
    native.navigationDiagnostics.mockResolvedValue({enabled:true,nativeNow:at,startedAt:at-1000,samples:[
        {phase:'touch-received',at:at-200,gestureId:1},{phase:'touch-received',at:at-100,gestureId:2}
    ]});
    const report=(await recorder.navigationDiagnosticLines()).join('\n');
    expect(report).toContain('first touch received -> same-gesture business callback: not observed');
    expect(report).toContain('chrome-business-start gesture=2');
    await recorder.setNavigationDiagnostics(false);
});
