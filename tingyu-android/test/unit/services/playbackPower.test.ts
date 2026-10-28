// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bindPlaybackContextIdle, needsProcessedPlayback } from '@/services/playbackPower';

// test/unit/services/playbackPower.test.ts
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
const plain={android:true,analysis:false,equalizer:false,automix:false,replayGain:'off' as const,fade:false};
it('uses the plain pipeline only when every requested processing feature is off',()=>{
    expect(needsProcessedPlayback(plain)).toBe(false);
    for(const patch of [{android:false},{analysis:true},{equalizer:true},{automix:true},{replayGain:'album' as const},{fade:true}])
        expect(needsProcessedPlayback({...plain,...patch})).toBe(true);
});
function deck(){
    const media=document.createElement('audio');let stopped=true;
    Object.defineProperty(media,'paused',{get:()=>stopped});
    Object.defineProperty(media,'ended',{get:()=>false});
    return {media,play:()=>{stopped=false;media.dispatchEvent(new Event('play'))},pause:()=>{stopped=true;media.dispatchEvent(new Event('pause'))}};
}
function context(){
    const value={state:'running',suspend:vi.fn(async()=>{value.state='suspended'}),resume:vi.fn(async()=>{value.state='running'})};
    return value;
}
it('does not suspend a sounding automix tail, suspends after both pause, and resumes on Play',async()=>{
    const a=deck(),b=deck(),ctx=context();const dispose=bindPlaybackContextIdle(ctx as unknown as AudioContext,[a.media,b.media]);
    b.play();a.pause();await vi.advanceTimersByTimeAsync(1000);expect(ctx.suspend).not.toHaveBeenCalled();
    b.pause();await vi.advanceTimersByTimeAsync(599);expect(ctx.suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);expect(ctx.suspend).toHaveBeenCalledOnce();
    a.play();expect(ctx.resume).toHaveBeenCalledOnce();dispose();
    a.pause();await vi.advanceTimersByTimeAsync(1000);expect(ctx.suspend).toHaveBeenCalledOnce();
});
it('cancels pause drain on quick resume and recovers Play racing an in-flight suspend',async()=>{
    const a=deck(),ctx=context();const dispose=bindPlaybackContextIdle(ctx as unknown as AudioContext,[a.media]);
    a.pause();await vi.advanceTimersByTimeAsync(300);a.play();await vi.advanceTimersByTimeAsync(600);
    expect(ctx.suspend).not.toHaveBeenCalled();
    let finish!:()=>void;ctx.suspend.mockImplementation(()=>new Promise<void>(resolve=>{finish=()=>{ctx.state='suspended';resolve()}}));
    a.pause();await vi.advanceTimersByTimeAsync(600);a.play();finish();await Promise.resolve();
    expect(ctx.resume).toHaveBeenCalledOnce();dispose();
});
