import { afterEach, expect, it, vi } from 'vitest';
import { installGlobalVisualizerFrameRateLimiter, setGlobalVisualizerFrameRate } from '@/utils/frameRateLimiter';
import { requestVisualizerAnimationFrame, cancelVisualizerAnimationFrame } from '@/utils/visualizerFrameChannel';

// test/unit/utils/visualizerFrameChannel.test.ts
// A 60Hz UI must remain independent of the graphics cap, including live cap changes and cancellation.
afterEach(()=>vi.unstubAllGlobals());
it('keeps native UI frames while graphics follow 30FPS and preserves queued work when the rate changes',()=>{
    let id=0;const callbacks=new Map<number,FrameRequestCallback>();
    const native=(fn:FrameRequestCallback)=>{callbacks.set(++id,fn);return id;};
    const cancel=(handle:number)=>{callbacks.delete(handle);};
    const fake={requestAnimationFrame:native,cancelAnimationFrame:cancel,Capacitor:{getPlatform:()=> 'android'},localStorage:{getItem:()=>null}};
    vi.stubGlobal('window',fake);installGlobalVisualizerFrameRateLimiter();
    expect(fake.requestAnimationFrame).toBe(native);expect(fake.cancelAnimationFrame).toBe(cancel);
    let ui=0,graphics=0;const uiTick=()=>{ui++;fake.requestAnimationFrame(uiTick);};const graphicsTick=()=>{graphics++;requestVisualizerAnimationFrame(graphicsTick);};
    fake.requestAnimationFrame(uiTick);requestVisualizerAnimationFrame(graphicsTick);
    for(let t=0;t<=1000;t+=16){const next=[...callbacks.values()];callbacks.clear();next.forEach(fn=>fn(t));}
    expect(ui).toBeGreaterThan(55);expect(graphics).toBeGreaterThan(20);expect(graphics).toBeLessThan(40);
    const once=vi.fn();requestVisualizerAnimationFrame(once);setGlobalVisualizerFrameRate('off');
    const next=[...callbacks.values()];callbacks.clear();next.forEach(fn=>fn(1016));expect(once).toHaveBeenCalledTimes(1);
    const cancelled=vi.fn();const handle=requestVisualizerAnimationFrame(cancelled);cancelVisualizerAnimationFrame(handle);
    const after=[...callbacks.values()];callbacks.clear();after.forEach(fn=>fn(1032));expect(cancelled).not.toHaveBeenCalled();
    expect(fake.requestAnimationFrame).toBe(native);
});
