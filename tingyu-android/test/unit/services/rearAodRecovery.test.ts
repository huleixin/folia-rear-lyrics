// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {applyRearMode} from '@/services/rearAodRuntime';
import {requestVisualizerAnimationFrame,cancelVisualizerAnimationFrame,setVisualizerLowPowerDemand,
    invalidateVisualizerLowPower,getVisualizerLowPowerStats} from '@/utils/visualizerFrameChannel';

// test/unit/services/rearAodRecovery.test.ts
it('bounds one simulated playing hour and wakes paused seeks and hidden resumes without native RAF polling',()=>{
    vi.useFakeTimers({loopLimit:200000});vi.setSystemTime(0);
    const now=vi.spyOn(performance,'now').mockImplementation(()=>Date.now());
    const raf=vi.spyOn(window,'requestAnimationFrame');
    let playing=true,count=0,handle=0;
    const tick=()=>{count++;handle=requestVisualizerAnimationFrame(tick);};
    try{
        setVisualizerLowPowerDemand(()=>playing?1000/30:null);
        applyRearMode({mode:'AOD',sequence:1});handle=requestVisualizerAnimationFrame(tick);
        vi.advanceTimersByTime(3600000);
        // Browser/fake timers truncate 33.333ms to integer ms; retain the existing cadence implementation.
        expect(count).toBeGreaterThan(100000);expect(count).toBeLessThanOrEqual(Math.ceil(3600000/Math.floor(1000/30))+1);
        expect(getVisualizerLowPowerStats().pending).toBe(true);
        playing=false;invalidateVisualizerLowPower();vi.advanceTimersByTime(0);
        const paused=count;vi.advanceTimersByTime(3600000);expect(count).toBe(paused);
        // A paused seek or new track is a visual event, not a new time authority.
        invalidateVisualizerLowPower();vi.advanceTimersByTime(0);expect(count).toBe(paused+1);
        applyRearMode({mode:'HIDDEN',sequence:2});invalidateVisualizerLowPower();
        vi.advanceTimersByTime(3600000);expect(count).toBe(paused+1);expect(getVisualizerLowPowerStats().pending).toBe(false);
        applyRearMode({mode:'AOD',sequence:3});vi.advanceTimersByTime(0);expect(count).toBe(paused+2);
        vi.advanceTimersByTime(60000);expect(count).toBe(paused+2);expect(raf).not.toHaveBeenCalled();
    }finally{
        cancelVisualizerAnimationFrame(handle);setVisualizerLowPowerDemand(null);applyRearMode({mode:'NORMAL',sequence:4});
        now.mockRestore();raf.mockRestore();vi.clearAllTimers();vi.useRealTimers();
    }
});
