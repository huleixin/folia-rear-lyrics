// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createFrameRateLimitedRaf } from '@/utils/frameRateLimiter';
import { bindVisualizerTickerRate, configureVisualizerFrameChannel, requestVisualizerAnimationFrame, requestVisualizerBackgroundFrame } from '@/utils/visualizerFrameChannel';

// test/unit/utils/visualizerFrameBudget.test.ts
it('budgets canvas and wallpaper work on a 120Hz display without limiting UI frames, and updates Pixi separately', () => {
    let sequence=0;const native=new Map<number,FrameRequestCallback>();
    const request=vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{native.set(++sequence,callback);return sequence;});
    const cancel=vi.spyOn(window,'cancelAnimationFrame').mockImplementation(id=>{native.delete(id);});
    configureVisualizerFrameChannel(60,createFrameRateLimitedRaf);
    const ticker={maxFPS:0};const release=bindVisualizerTickerRate(ticker);
    let ui=0,text=0,wallpaper=0;
    const drawUi=()=>{ui++;window.requestAnimationFrame(drawUi);};
    const drawText=()=>{text++;requestVisualizerAnimationFrame(drawText);};
    const drawWallpaper=()=>{wallpaper++;requestVisualizerBackgroundFrame(drawWallpaper);};
    window.requestAnimationFrame(drawUi);requestVisualizerAnimationFrame(drawText);requestVisualizerBackgroundFrame(drawWallpaper);
    try {
        for(let i=0;i<120;i++){const frame=[...native.values()];native.clear();frame.forEach(callback=>callback(i*1000/120));}
        expect(ui).toBe(120);expect(text).toBeGreaterThanOrEqual(58);expect(text).toBeLessThanOrEqual(61);
        expect(wallpaper).toBeGreaterThanOrEqual(29);expect(wallpaper).toBeLessThanOrEqual(31);expect(ticker.maxFPS).toBe(60);
        configureVisualizerFrameChannel(90,createFrameRateLimitedRaf);expect(ticker.maxFPS).toBe(90);
        release();configureVisualizerFrameChannel(30,createFrameRateLimitedRaf);expect(ticker.maxFPS).toBe(90);
    } finally {release();native.clear();request.mockRestore();cancel.mockRestore();}
});
