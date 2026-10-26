// @vitest-environment jsdom
import React, { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRearLyricsPublisher } from '@/hooks/useRearLyricsPublisher';
import { PlayerState } from '@/types';
import type { ObsBrowserSourceConfig, ObsBrowserSourceClock, ObsBrowserSourceAudio } from '@/types/obsBrowserSource';
import { useRearRuntimeStore } from '@/stores/useRearRuntimeStore';

// test/unit/hooks/rearPublisherPower.test.ts
// Count actual bridge calls and verify pause/re-enable/cleanup without altering rear clock semantics.
const native=vi.hoisted(()=>({ getRearLyricsStatus:vi.fn(), getRearLyricsRuntimeState:vi.fn(), publishRearLyricsSnapshot:vi.fn() }));
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:()=> 'android'}}));
vi.mock('@/platform/foliaNative',()=>({getFoliaNative:()=>native}));
vi.mock('@/services/rearLyricsFont',()=>({resolveRearUploadedFont:vi.fn().mockResolvedValue(null)}));
vi.mock('@/stores/useTypographySettingsStore',()=>({useTypographySettingsStore:(select:(state:unknown)=>unknown)=>select({lyricsCustomFont:null})}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement, enabled:boolean, sleeping:boolean, returnedToSystem:boolean;
let state:PlayerState, time:number;
const config={activePlaybackContext:'main',stageSource:null,song:{id:'real-track',name:'real-track'},songArtist:'artist'} as unknown as ObsBrowserSourceConfig;
const audio=()=>({audioPower:0,bands:{bass:0,lowMid:0,mid:0,vocal:0,treble:0},spectrum:[],sentAtMs:Date.now()}) as ObsBrowserSourceAudio;
const clock=()=>({currentTime:time,duration:100,playerState:state,playbackRate:1,sentAtMs:Date.now(),lyricOffsetMs:0}) as ObsBrowserSourceClock;
const read=()=>({currentTime:time,playbackRate:1,advancing:state===PlayerState.PLAYING});
function Harness({revision=0}:{revision?:number}) { useRearLyricsPublisher(revision?{...config}:config,clock,audio,read);return null; }
beforeEach(()=>{
    vi.useFakeTimers();vi.clearAllMocks();enabled=false;sleeping=false;returnedToSystem=false;state=PlayerState.PLAYING;time=10;
    native.getRearLyricsRuntimeState.mockImplementation(async()=>({enabled,sleeping,returnedToSystem}));native.getRearLyricsStatus.mockResolvedValue({enabled:false});
    native.publishRearLyricsSnapshot.mockResolvedValue(undefined);
    host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});
it('does not schedule 100ms publication or collect diagnostic reports while disabled',async()=>{
    await act(async()=>root.render(h(Harness)));
    await act(async()=>vi.advanceTimersByTimeAsync(20000));
    expect(native.getRearLyricsRuntimeState).toHaveBeenCalledTimes(11);
    expect(native.getRearLyricsStatus).not.toHaveBeenCalled();expect(native.publishRearLyricsSnapshot).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
});
it('stops clock/audio publication while the system owns the rear screen and resumes at the live position',async()=>{
    enabled=true;
    await act(async()=>root.render(h(Harness)));await act(async()=>vi.advanceTimersByTimeAsync(500));
    state=PlayerState.PAUSED;returnedToSystem=true;
    await act(async()=>vi.advanceTimersByTimeAsync(1000));
    const count=native.publishRearLyricsSnapshot.mock.calls.length;
    expect(useRearRuntimeStore.getState().enabled).toBe(false);
    await act(async()=>root.render(h(Harness,{revision:1})));
    await act(async()=>vi.advanceTimersByTimeAsync(30000));
    expect(native.publishRearLyricsSnapshot).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(1);
    state=PlayerState.PLAYING;time=55;returnedToSystem=false;
    await act(async()=>vi.advanceTimersByTimeAsync(2100));
    expect(useRearRuntimeStore.getState().enabled).toBe(true);
    expect(native.publishRearLyricsSnapshot.mock.lastCall?.[0].clock.currentTime).toBe(55);
});
it('keeps 10Hz playing snapshots, sparsely heartbeats when paused, and wakes for config changes',async()=>{
    enabled=true;
    await act(async()=>root.render(h(Harness)));await act(async()=>vi.advanceTimersByTimeAsync(1000));
    expect(native.publishRearLyricsSnapshot.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(useRearRuntimeStore.getState().enabled).toBe(true);
    state=PlayerState.PAUSED;await act(async()=>vi.advanceTimersByTimeAsync(200));
    const pausedCount=native.publishRearLyricsSnapshot.mock.calls.length;
    await act(async()=>vi.advanceTimersByTimeAsync(10000));
    expect(native.publishRearLyricsSnapshot.mock.calls.length-pausedCount).toBeLessThanOrEqual(2);
    await act(async()=>root.render(h(Harness,{revision:1})));await act(async()=>vi.advanceTimersByTimeAsync(0));
    expect(native.publishRearLyricsSnapshot.mock.lastCall?.[0]).toHaveProperty('config');
    sleeping=true;await act(async()=>vi.advanceTimersByTimeAsync(1000));
    expect(useRearRuntimeStore.getState().sleeping).toBe(true);
});
it('cleans up listeners/timers and ignores late native replies after unmount',async()=>{
    let resolve:(status:{enabled:boolean})=>void=()=>undefined;
    native.getRearLyricsRuntimeState.mockImplementation(()=>new Promise(r=>{resolve=r;}));
    await act(async()=>root.render(h(Harness)));
    act(()=>root.render(null));await act(async()=>resolve({enabled:true}));
    await act(async()=>vi.advanceTimersByTimeAsync(10000));
    expect(native.publishRearLyricsSnapshot).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
    expect(useRearRuntimeStore.getState().enabled).toBe(false);
});

it('does not sample or send audio during rear sleep and resumes from the current media clock',async()=>{
    enabled=true;
    await act(async()=>root.render(h(Harness)));await act(async()=>vi.advanceTimersByTimeAsync(300));
    sleeping=true;await act(async()=>vi.advanceTimersByTimeAsync(1000));
    const asleep=native.publishRearLyricsSnapshot.mock.calls.length;
    time=60;await act(async()=>vi.advanceTimersByTimeAsync(10000));
    expect(native.publishRearLyricsSnapshot).toHaveBeenCalledTimes(asleep);
    sleeping=false;await act(async()=>vi.advanceTimersByTimeAsync(1000));
    expect(native.publishRearLyricsSnapshot.mock.calls.length).toBeGreaterThan(asleep);
    expect(native.publishRearLyricsSnapshot.mock.lastCall?.[0].clock.currentTime).toBe(60);
});
