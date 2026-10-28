// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createFrameRateLimitedRaf } from '@/utils/frameRateLimiter';
import { bindVisualizerTickerRate, setVisualizerRenderingSuspended } from '@/utils/visualizerFrameChannel';

// test/unit/utils/visualizerSuspension.test.ts
it('holds queued graphics work without spinning native RAF, and resumes once',()=>{
    let frame:FrameRequestCallback|undefined,id=0;
    const request=vi.fn((cb:FrameRequestCallback)=>{frame=cb;return ++id});
    const cancel=vi.fn();const queue=createFrameRateLimitedRaf(request,cancel,60);
    const draw=vi.fn();const handle=queue.requestAnimationFrame(draw);
    queue.setSuspended!(true);expect(cancel).toHaveBeenCalledWith(1);
    frame!(100);expect(draw).not.toHaveBeenCalled();
    queue.setFrameRate(30);expect(request).toHaveBeenCalledTimes(1);
    queue.setSuspended!(false);expect(request).toHaveBeenCalledTimes(2);
    frame!(120);expect(draw).toHaveBeenCalledOnce();queue.cancelAnimationFrame(handle);queue.dispose();
});
it('stops Pixi only for the return interval and never starts a previously stopped ticker',()=>{
    const ticker={maxFPS:60,started:true,stop:vi.fn(),start:vi.fn()};
    const unbind=bindVisualizerTickerRate(ticker);
    try{
        setVisualizerRenderingSuspended(true);setVisualizerRenderingSuspended(true);
        expect(ticker.stop).toHaveBeenCalledOnce();setVisualizerRenderingSuspended(false);
        expect(ticker.start).toHaveBeenCalledOnce();ticker.started=false;
        setVisualizerRenderingSuspended(true);setVisualizerRenderingSuspended(false);
        expect(ticker.start).toHaveBeenCalledOnce();
    }finally{unbind();setVisualizerRenderingSuspended(false)}
});
