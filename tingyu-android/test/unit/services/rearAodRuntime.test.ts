// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';

// test/unit/services/rearAodRuntime.test.ts
beforeEach(()=>{vi.resetModules();});
afterEach(()=>{vi.unstubAllGlobals();document.documentElement.removeAttribute('data-rear-aod');document.documentElement.removeAttribute('data-rear-mode');});
it('keeps AOD across hidden, suspends only rendering, rejects stale deliveries and redraws once on resume',async()=>{
    const low=vi.fn(),suspend=vi.fn(),invalidate=vi.fn();
    vi.doMock('@/utils/visualizerFrameChannel',()=>({setVisualizerLowPower:low,setVisualizerRenderingSuspended:suspend,invalidateVisualizerLowPower:invalidate}));
    const {applyRearMode,isRearAod,getRearModeReceipt}=await import('@/services/rearAodRuntime');
    expect(applyRearMode({mode:'AOD',sequence:1})).toBe(true);expect(isRearAod()).toBe(true);
    applyRearMode({mode:'HIDDEN',sequence:2});
    expect(isRearAod()).toBe(true);expect(suspend).toHaveBeenLastCalledWith(true);
    expect((window as any).__tingyuRearSleeping).toBe(true);
    expect(applyRearMode({mode:'NORMAL',sequence:1})).toBe(false);
    expect(applyRearMode({mode:'NORMAL',sequence:2})).toBe(false);
    applyRearMode({mode:'AOD',sequence:3});
    expect(suspend).toHaveBeenLastCalledWith(false);expect(isRearAod()).toBe(true);
    const count=invalidate.mock.calls.length;
    applyRearMode({mode:'AOD',sequence:3});expect(invalidate).toHaveBeenCalledTimes(count);
    applyRearMode({mode:'NORMAL',sequence:4});expect(isRearAod()).toBe(false);
    expect(getRearModeReceipt()).toEqual({mode:'NORMAL',sequence:4});
    expect(low.mock.calls.map(([value])=>value)).toEqual([true,false]);
});
it('replays HIDDEN and late iframe AOD without a retry timer, with scoped delivery receipts',async()=>{
    vi.doMock('@/utils/visualizerFrameChannel',()=>({setVisualizerLowPower:vi.fn(),setVisualizerRenderingSuspended:vi.fn(),invalidateVisualizerLowPower:vi.fn()}));
    const runtime=await import('@/services/rearAodRuntime');
    const {createRearModeRelay}=await import('@/services/rearModeRelay');
    const host=new EventTarget() as any;
    host.location={hostname:'rear.folia.local'};host.document={hidden:false};host.fetch=vi.fn().mockResolvedValue({});
    const timer=vi.spyOn(window,'setTimeout');
    let frame:any=null;
    runtime.applyRearMode({mode:'HIDDEN',sequence:10});
    const relay=createRearModeRelay(()=>frame,host);
    expect(host.fetch).toHaveBeenCalledTimes(1);
    frame=new EventTarget();
    frame.addEventListener('folia-rear-mode',(event:any)=>{frame.__foliaRearModeReceipt=event.detail;});
    relay.replay();expect(frame.__foliaRearModeReceipt).toEqual({mode:'HIDDEN',sequence:10});
    runtime.applyRearMode({mode:'AOD',sequence:11});host.dispatchEvent(new Event('folia-rear-mode'));
    expect(frame.__foliaRearModeReceipt).toEqual({mode:'AOD',sequence:11});
    relay.replay();expect(host.fetch).toHaveBeenCalledTimes(3);
    expect(timer).not.toHaveBeenCalled();relay.dispose();timer.mockRestore();
});
