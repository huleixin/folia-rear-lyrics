// @vitest-environment jsdom
import React, { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { usePlaybackVisualizerBridge } from '@/hooks/usePlaybackVisualizerBridge';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { useRearRuntimeStore } from '@/stores/useRearRuntimeStore';
import { currentTime, lyricCurrentTime } from '@/stores/motionSignals';
import { PlayerState } from '@/types';

// test/unit/hooks/mobilePlaybackWork.test.ts
// The actual bridge must keep media time/offsets and rear sampling when front-screen work is reduced.
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('skips hidden FFT work without freezing the playback or rear clock',async()=>{
    vi.useFakeTimers();vi.stubGlobal('Capacitor',{getPlatform:()=> 'android'});
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>window.setTimeout(()=>callback(performance.now()),16));
    vi.stubGlobal('cancelAnimationFrame',clearTimeout);
    Object.defineProperty(document,'hidden',{configurable:true,value:false});
    const audio={currentTime:12,paused:false,ended:false,seeking:false,readyState:4,playbackRate:1} as HTMLAudioElement;
    const fft=vi.fn((array:Uint8Array)=>array.fill(20));
    const params={audioRef:{current:audio},analyserRef:{current:{frequencyBinCount:1024,getByteFrequencyData:fft} as unknown as AnalyserNode},
        animationFrameRef:{current:0},effectiveLoopMode:'off' as const,isNowPlayingStageActive:false,isPlayerCapStageActive:false,
        stageActiveEntryKind:null,stageLyricsSession:null,stageLyricsClockRef:{current:{startTimeSec:0,endTimeSec:0,baseTimeSec:0,startedAtMs:null}},
        getSyntheticStageLyricsTime:()=>0,syncStageLyricsClock:vi.fn(),getNowPlayingDisplayTime:()=>0,getPlayerCapDisplayTime:()=>0,
        syncNowPlayingClock:vi.fn(),lyricTimelineOffsetMs:500,isTransitionAudible:()=>false};
    let read:ReturnType<typeof usePlaybackVisualizerBridge>=()=>null;
    function Harness(){read=usePlaybackVisualizerBridge(params);return null;}
    const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
    try {
        usePlaybackStore.setState({playerState:PlayerState.PLAYING,duration:100,lyrics:null,activePlaybackContext:'main'});
        useAppViewStore.setState({view:'home'});useRearRuntimeStore.setState({enabled:false,sleeping:false});
        await act(async()=>root.render(h(Harness)));
        expect(fft).not.toHaveBeenCalled();expect(currentTime.get()).toBe(12);expect(lyricCurrentTime.get()).toBe(11.5);
        audio.currentTime=25;await act(async()=>vi.advanceTimersByTimeAsync(250));expect(currentTime.get()).toBe(25);
        await act(async()=>useAppViewStore.setState({view:'player'}));expect(fft).toHaveBeenCalled();
        fft.mockClear();Object.defineProperty(document,'hidden',{configurable:true,value:true});
        act(()=>document.dispatchEvent(new Event('visibilitychange')));await act(async()=>vi.advanceTimersByTimeAsync(1000));
        expect(fft).not.toHaveBeenCalled();audio.currentTime=60;expect(read()?.currentTime).toBe(60);
        await act(async()=>useRearRuntimeStore.setState({enabled:true,sleeping:false}));
        fft.mockClear();await act(async()=>vi.advanceTimersByTimeAsync(1000));expect(fft).toHaveBeenCalledTimes(10);
        await act(async()=>usePlaybackStore.setState({playerState:PlayerState.PAUSED}));
        fft.mockClear();await act(async()=>vi.advanceTimersByTimeAsync(1000));expect(fft).not.toHaveBeenCalled();
    } finally {
        act(()=>root.unmount());host.remove();Object.defineProperty(document,'hidden',{configurable:true,value:false});
        vi.useRealTimers();vi.unstubAllGlobals();
    }
});
