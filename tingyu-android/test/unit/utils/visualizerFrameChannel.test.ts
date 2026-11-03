import { afterEach, expect, it, vi } from 'vitest';
import { installGlobalVisualizerFrameRateLimiter, setGlobalVisualizerFrameRate } from '@/utils/frameRateLimiter';
import { requestVisualizerAnimationFrame, cancelVisualizerAnimationFrame, requestVisualizerBackgroundFrame, cancelVisualizerBackgroundFrame,setVisualizerLowPower,setVisualizerRenderingSuspended,bindVisualizerTickerRate,setVisualizerLowPowerDemand,invalidateVisualizerLowPower,getVisualizerLowPowerStats,subscribeVisualizerLowPowerCadence } from '@/utils/visualizerFrameChannel';

// test/unit/utils/visualizerFrameChannel.test.ts
// A 60Hz UI must remain independent of the graphics cap, including live cap changes and cancellation.
afterEach(()=>vi.unstubAllGlobals());
it('keeps native UI frames while foreground follows 60FPS and wallpaper 30FPS and preserves queued work when the rate changes',()=>{
    let id=0;const callbacks=new Map<number,FrameRequestCallback>();
    const native=(fn:FrameRequestCallback)=>{callbacks.set(++id,fn);return id;};
    const cancel=(handle:number)=>{callbacks.delete(handle);};
    const fake={requestAnimationFrame:native,cancelAnimationFrame:cancel,Capacitor:{getPlatform:()=> 'android'},localStorage:{getItem:()=>null}};
    vi.stubGlobal('window',fake);installGlobalVisualizerFrameRateLimiter();
    expect(fake.requestAnimationFrame).toBe(native);expect(fake.cancelAnimationFrame).toBe(cancel);
    let ui=0,graphics=0,background=0;const uiTick=()=>{ui++;fake.requestAnimationFrame(uiTick);};const graphicsTick=()=>{graphics++;requestVisualizerAnimationFrame(graphicsTick);};
    const backgroundTick=()=>{background++;requestVisualizerBackgroundFrame(backgroundTick);};
    fake.requestAnimationFrame(uiTick);requestVisualizerAnimationFrame(graphicsTick);requestVisualizerBackgroundFrame(backgroundTick);
    for(let t=0;t<=1000;t+=16){const next=[...callbacks.values()];callbacks.clear();next.forEach(fn=>fn(t));}
    expect(ui).toBeGreaterThan(55);expect(graphics).toBeGreaterThanOrEqual(58);expect(graphics).toBeLessThanOrEqual(63);
    expect(background).toBeGreaterThanOrEqual(29);expect(background).toBeLessThanOrEqual(32);
    const once=vi.fn();requestVisualizerAnimationFrame(once);setGlobalVisualizerFrameRate('off');
    const next=[...callbacks.values()];callbacks.clear();next.forEach(fn=>fn(1016));expect(once).toHaveBeenCalledTimes(1);
    const cancelled=vi.fn();const handle=requestVisualizerAnimationFrame(cancelled);cancelVisualizerAnimationFrame(handle);
    const after=[...callbacks.values()];callbacks.clear();after.forEach(fn=>fn(1032));expect(cancelled).not.toHaveBeenCalled();
    expect(fake.requestAnimationFrame).toBe(native);
    const bgCancelled=vi.fn();const bgHandle=requestVisualizerBackgroundFrame(bgCancelled);cancelVisualizerBackgroundFrame(bgHandle);
    setGlobalVisualizerFrameRate(30);const a=graphics,b=background;
    for(let t=1048;t<2048;t+=16){const batch=[...callbacks.values()];callbacks.clear();batch.forEach(fn=>fn(t));}
    expect(graphics-a).toBeGreaterThanOrEqual(29);expect(graphics-a).toBeLessThanOrEqual(32);
    expect(background-b).toBeGreaterThanOrEqual(29);expect(background-b).toBeLessThanOrEqual(32);
    expect(bgCancelled).not.toHaveBeenCalled();
});

it('AOD samples pending graphics only under explicit demand without requesting native RAF and resumes the same queue',()=>{
    vi.useFakeTimers();const raf=vi.fn(()=>1),cancel=vi.fn();
    vi.stubGlobal('window',{requestAnimationFrame:raf,cancelAnimationFrame:cancel,Capacitor:{getPlatform:()=> 'android'},localStorage:{getItem:()=>null}});
    installGlobalVisualizerFrameRateLimiter();let count=0,handle=0;
    const tick=()=>{count++;handle=requestVisualizerAnimationFrame(tick);};
    requestVisualizerAnimationFrame(tick);setVisualizerLowPowerDemand(()=>500);setVisualizerLowPower(true);raf.mockClear();
    vi.advanceTimersByTime(2000);expect(count).toBe(5);expect(raf).not.toHaveBeenCalled();
    setVisualizerRenderingSuspended(true);vi.advanceTimersByTime(5000);expect(count).toBe(5);
    setVisualizerRenderingSuspended(false);vi.advanceTimersByTime(500);expect(count).toBe(6);
    cancelVisualizerAnimationFrame(handle);setVisualizerLowPowerDemand(null);setVisualizerLowPower(false);vi.clearAllTimers();vi.useRealTimers();
});
it('AOD stops the independent Pixi ticker and drives only bounded manual updates',()=>{
    vi.useFakeTimers();const ticker={maxFPS:60,started:true,stop:vi.fn(),start:vi.fn(),update:vi.fn()};
    const cleanup=bindVisualizerTickerRate(ticker);setVisualizerLowPowerDemand(()=>100);setVisualizerLowPower(true);
    expect(ticker.stop).toHaveBeenCalled();expect(ticker.maxFPS).toBe(0);
    vi.advanceTimersByTime(1000);expect(ticker.update).toHaveBeenCalledTimes(11);
    setVisualizerRenderingSuspended(true);vi.advanceTimersByTime(2000);expect(ticker.update).toHaveBeenCalledTimes(11);
    setVisualizerRenderingSuspended(false);setVisualizerLowPower(false);expect(ticker.start).toHaveBeenCalled();
    cleanup();setVisualizerLowPowerDemand(null);vi.clearAllTimers();vi.useRealTimers();
});

it('idle and paused AOD do not draw until a visual event, then cancel on hidden',()=>{
    vi.useFakeTimers();const raf=vi.fn(()=>1);vi.stubGlobal('window',{requestAnimationFrame:raf,cancelAnimationFrame:vi.fn(),Capacitor:{getPlatform:()=> 'android'},localStorage:{getItem:()=>null}});installGlobalVisualizerFrameRateLimiter();
    let count=0,handle=0;const draw=()=>{count++;handle=requestVisualizerAnimationFrame(draw);};
    setVisualizerLowPowerDemand(()=>null);setVisualizerLowPower(true);requestVisualizerAnimationFrame(draw);
    vi.advanceTimersByTime(10_000);expect(count).toBe(1);
    invalidateVisualizerLowPower();vi.advanceTimersByTime(0);expect(count).toBe(2);
    vi.advanceTimersByTime(60_000);expect(count).toBe(2);
    setVisualizerRenderingSuspended(true);invalidateVisualizerLowPower();vi.advanceTimersByTime(5000);expect(count).toBe(2);
    cancelVisualizerAnimationFrame(handle);setVisualizerLowPowerDemand(null);setVisualizerLowPower(false);setVisualizerRenderingSuspended(false);vi.clearAllTimers();vi.useRealTimers();
});
it('bounds tiny/overlapping timeline wakeups at 30 FPS; pause, hidden and AOD exit cancel continuous timers',()=>{
    vi.useFakeTimers();vi.setSystemTime(0);const now=vi.spyOn(performance,'now').mockImplementation(()=>Date.now());
    const raf=vi.fn(()=>1);vi.stubGlobal('window',{requestAnimationFrame:raf,cancelAnimationFrame:vi.fn(),Capacitor:{getPlatform:()=> 'android'},localStorage:{getItem:()=>null}});installGlobalVisualizerFrameRateLimiter();
    let count=0,handle=0,playing=true;const tick=()=>{count++;handle=requestVisualizerAnimationFrame(tick);};
    setVisualizerLowPowerDemand(()=>playing?1:null);setVisualizerLowPower(true);requestVisualizerAnimationFrame(tick);raf.mockClear();
    vi.advanceTimersByTime(1000);expect(count).toBeGreaterThanOrEqual(30);expect(count).toBeLessThanOrEqual(32);expect(raf).not.toHaveBeenCalled();
    playing=false;invalidateVisualizerLowPower();vi.advanceTimersByTime(0);const paused=count;
    vi.advanceTimersByTime(60000);expect(count).toBe(paused);expect(getVisualizerLowPowerStats().cancelled).toBe(true);
    setVisualizerRenderingSuspended(true);playing=true;invalidateVisualizerLowPower();vi.advanceTimersByTime(2000);expect(count).toBe(paused);expect(getVisualizerLowPowerStats().pending).toBe(false);
    setVisualizerRenderingSuspended(false);vi.advanceTimersByTime(0);expect(count).toBe(paused+1);
    cancelVisualizerAnimationFrame(handle);setVisualizerLowPowerDemand(null);setVisualizerLowPower(false);vi.clearAllTimers();now.mockRestore();vi.useRealTimers();
});
it('real channel samples degrade stepwise and recover during healthy frames instead of latching to 500ms',()=>{
    vi.useFakeTimers();vi.setSystemTime(0);let lag=0;const now=vi.spyOn(performance,'now').mockImplementation(()=>Date.now()+lag);
    vi.stubGlobal('window',{requestAnimationFrame:vi.fn(()=>1),cancelAnimationFrame:vi.fn(),Capacitor:{getPlatform:()=> 'android'},localStorage:{getItem:()=>null}});installGlobalVisualizerFrameRateLimiter();
    let handle=0;const tick=()=>{handle=requestVisualizerAnimationFrame(tick);};const changes:number[]=[];
    const stop=subscribeVisualizerLowPowerCadence(change=>changes.push(change.to));
    setVisualizerLowPowerDemand(()=>1000/30);setVisualizerLowPower(true);requestVisualizerAnimationFrame(tick);vi.advanceTimersByTime(0);
    for(let i=0;i<9;i++){lag+=1000;vi.advanceTimersToNextTimer();}
    expect(getVisualizerLowPowerStats()).toMatchObject({cadenceFps:6,downgrades:3});
    for(let i=0;i<240;i++)vi.advanceTimersToNextTimer();
    expect(getVisualizerLowPowerStats()).toMatchObject({cadenceFps:30,recoveries:3});
    expect(changes).toEqual([20,12,6,12,20,30]);expect(getVisualizerLowPowerStats().callbackHz).toBeGreaterThan(0);
    stop();cancelVisualizerAnimationFrame(handle);setVisualizerLowPowerDemand(null);setVisualizerLowPower(false);vi.clearAllTimers();now.mockRestore();vi.useRealTimers();
});
