// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { playbackWorkPolicy, startPlaybackWorkScheduler } from '@/utils/playbackWorkScheduler';

// test/unit/utils/playbackWorkScheduler.test.ts
// Verify transitions, clock continuity and cancellation with a deterministic 60Hz browser scheduler.
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('removes audio analysis and per-frame polling behind the mobile library while retaining its media clock', () => {
    vi.useFakeTimers();
    const raf = vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal('requestAnimationFrame', raf); vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    let visible = true, player = false, rear = false, mediaTime = 0, shownTime = -1;
    const work = vi.fn((sampleAudio: boolean) => { shownTime = mediaTime; return sampleAudio; });
    const frame = { current: 0 };
    const stop = startPlaybackWorkScheduler(work, () => playbackWorkPolicy(true, visible, player, rear), frame);
    vi.advanceTimersByTime(60000);
    expect(work).toHaveBeenCalledTimes(241);
    expect(work.mock.calls.every(([sample]) => !sample)).toBe(true); expect(raf).not.toHaveBeenCalled();
    mediaTime = 123; vi.advanceTimersByTime(250); expect(shownTime).toBe(123);
    visible = false; document.dispatchEvent(new Event('visibilitychange'));
    const count = work.mock.calls.length; vi.advanceTimersByTime(10000);
    expect(work.mock.calls.length-count).toBe(10);
    player = true; visible = true; document.dispatchEvent(new Event('visibilitychange'));
    expect(work.mock.lastCall?.[0]).toBe(true); vi.advanceTimersByTime(100); expect(raf).toHaveBeenCalled();
    rear = true; visible = false; document.dispatchEvent(new Event('visibilitychange'));
    const rearCount = work.mock.calls.length; vi.advanceTimersByTime(1000);
    expect(work.mock.calls.length-rearCount).toBe(10); expect(work.mock.lastCall?.[0]).toBe(true);
    stop(); const stoppedCount = work.mock.calls.length;
    document.dispatchEvent(new Event('visibilitychange')); vi.advanceTimersByTime(10000);
    expect(work).toHaveBeenCalledTimes(stoppedCount); expect(vi.getTimerCount()).toBe(0);
});
it('keeps the desktop visualizer cadence and rear sampling independent from the phone library policy', () => {
    expect(playbackWorkPolicy(false, true, false, false).animate).toBe(true);
    expect(playbackWorkPolicy(true, false, false, true)).toEqual({ animate: false, sampleAudio: true, delay: 100 });
});

it('stops Android paused sampling/RAF while keeping sparse progress updates and desktop behaviour',()=>{
    expect(playbackWorkPolicy(true,true,true,true,false)).toEqual({animate:false,sampleAudio:false,delay:100});
    expect(playbackWorkPolicy(false,true,true,false,false).animate).toBe(true);
});
