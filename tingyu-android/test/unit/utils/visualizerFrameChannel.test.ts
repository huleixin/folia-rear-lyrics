import { afterEach, expect, it, vi } from 'vitest';
import { installGlobalVisualizerFrameRateLimiter, setGlobalVisualizerFrameRate } from '@/utils/frameRateLimiter';
import { requestVisualizerAnimationFrame, cancelVisualizerAnimationFrame, requestVisualizerBackgroundFrame, cancelVisualizerBackgroundFrame } from '@/utils/visualizerFrameChannel';

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
