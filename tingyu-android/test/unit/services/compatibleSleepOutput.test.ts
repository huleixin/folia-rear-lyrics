// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ensureCompatibleSleepOutput, releaseCompatibleSleepOutput } from '@/services/compatibleSleepOutput';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { PlayerState } from '@/types';
import {getPlaybackSongKey} from '@/utils/appPlaybackGuards';

// test/unit/services/compatibleSleepOutput.test.ts
const port=vi.hoisted(()=>({compatiblePlayback:vi.fn()}));
vi.mock('@/platform/tingyuPlayback',()=>({getTingyuPlayback:()=>port}));
const saved=usePlaybackStore.getState();
let element:HTMLAudioElement,paused:boolean,attempt:string;
beforeEach(()=>{
    attempt='A#1';paused=false;port.compatiblePlayback.mockReset().mockResolvedValue({accepted:true,blocked:false});
    element=document.createElement('audio');document.body.append(element);
    Object.defineProperty(element,'paused',{get:()=>paused});element.pause=vi.fn(()=>{paused=true;});
    usePlaybackStore.setState({currentSong:{id:1,name:'A',durationMs:200000,artists:[],album:{id:0,name:''}},audioSrc:'blob:audio',playerState:PlayerState.PLAYING});
});
afterEach(async()=>{await releaseCompatibleSleepOutput();element.remove();usePlaybackStore.setState(saved);});
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
const lease=()=>port.compatiblePlayback.mock.calls.find(([o])=>o.action==='claim')![0].lease;
it('manual selection does not label an outgoing browser source as the newly selected song',async()=>{
    element.setAttribute('src','blob:old');await ensureCompatibleSleepOutput(()=>attempt);await flush();
    expect(port.compatiblePlayback.mock.lastCall?.[0].songKey).toBe('');
    element.setAttribute('src','blob:audio');element.dispatchEvent(new Event('play',{bubbles:true}));await flush();
    expect(port.compatiblePlayback.mock.lastCall?.[0].songKey).toBe(getPlaybackSongKey(usePlaybackStore.getState().currentSong!));
    usePlaybackStore.setState({currentSong:{id:2,name:'B',durationMs:200000,artists:[],album:{id:0,name:''}},audioSrc:null});await flush();
    expect(port.compatiblePlayback.mock.lastCall?.[0].songKey).toBe('');expect(element.pause).not.toHaveBeenCalled();
});
it('uses one leased endpoint without a JS countdown; pauses and acknowledges all browser decks',async()=>{
    const other=document.createElement('audio');let otherPaused=false;Object.defineProperty(other,'paused',{get:()=>otherPaused});other.pause=vi.fn(()=>{otherPaused=true;});document.body.append(other);
    try{
        await ensureCompatibleSleepOutput(()=>attempt);await ensureCompatibleSleepOutput(()=>attempt);
        expect(port.compatiblePlayback.mock.calls.filter(([o])=>o.action==='claim')).toHaveLength(1);
        expect(window.__tingyuSleepOutput!(lease(),'pause',8,true)).toBe(true);await flush();
        expect(paused).toBe(true);expect(otherPaused).toBe(true);expect(usePlaybackStore.getState().playerState).toBe(PlayerState.PAUSED);
        expect(port.compatiblePlayback).toHaveBeenCalledWith(expect.objectContaining({action:'pause-ack',ticket:8,paused:true}));
    }finally{other.remove();}
});
it('a cancelled/old native task or old output lease cannot pause a new song',async()=>{
    await ensureCompatibleSleepOutput(()=>attempt);
    port.compatiblePlayback.mockImplementation(async o=>({accepted:o.action!=='pause-check'}));
    expect(window.__tingyuSleepOutput!('old-lease','pause',8,true)).toBe(false);
    window.__tingyuSleepOutput!(lease(),'pause',8,true);await flush();expect(paused).toBe(false);expect(element.pause).not.toHaveBeenCalled();
});
it('does not acknowledge success if the browser output refuses to pause',async()=>{
    element.pause=vi.fn();await ensureCompatibleSleepOutput(()=>attempt);
    window.__tingyuSleepOutput!(lease(),'pause',8,true);await flush();
    expect(port.compatiblePlayback).toHaveBeenCalledWith(expect.objectContaining({action:'pause-ack',paused:false}));
    expect(usePlaybackStore.getState().playerState).toBe(PlayerState.PLAYING);
    element.pause=()=>{paused=true;};
});
it('native track waiting disables browser repeat, cancellation restores the prior preference',async()=>{
    element.loop=true;await ensureCompatibleSleepOutput(()=>attempt);
    window.__tingyuSleepOutput!(lease(),'barrier',0,true);expect(element.loop).toBe(false);
    window.__tingyuSleepOutput!(lease(),'barrier',0,false);expect(element.loop).toBe(true);
});
it.each([true,false])('a natural boundary is gated by native policy (blocked=%s)',async blocked=>{
    await ensureCompatibleSleepOutput(()=>attempt);const next=vi.fn();element.addEventListener('ended',next);
    port.compatiblePlayback.mockImplementation(async()=>({accepted:true,blocked}));
    element.dispatchEvent(new Event('ended'));expect(next).not.toHaveBeenCalled();await flush();expect(next).toHaveBeenCalledTimes(blocked?0:1);
});
it('a delayed boundary verdict cannot advance a replacement attempt',async()=>{
    await ensureCompatibleSleepOutput(()=>attempt);const next=vi.fn();element.addEventListener('ended',next);
    let deliver!:(value:any)=>void;port.compatiblePlayback.mockImplementation(async o=>o.action==='boundary'?new Promise(resolve=>{deliver=resolve;}):({accepted:true}));
    element.dispatchEvent(new Event('ended'));await flush();attempt='B#2';deliver({accepted:true,blocked:false});await flush();expect(next).not.toHaveBeenCalled();
});
it('releases only after real browser pause and native ownership acknowledgement',async()=>{
    await ensureCompatibleSleepOutput(()=>attempt);await releaseCompatibleSleepOutput();
    expect(paused).toBe(true);expect(port.compatiblePlayback).toHaveBeenCalledWith(expect.objectContaining({action:'release',paused:true}));expect(window.__tingyuSleepOutput).toBeUndefined();
});
it('waits for the DSP graph to stop before acknowledging a timed pause',async()=>{
    let quiet!:(value:boolean)=>void;
    await ensureCompatibleSleepOutput(()=>attempt,()=>new Promise(resolve=>{quiet=resolve;}));
    window.__tingyuSleepOutput!(lease(),'pause',9,true);await flush();
    expect(port.compatiblePlayback.mock.calls.some(([o])=>o.action==='pause-ack')).toBe(false);
    quiet(true);await flush();expect(port.compatiblePlayback).toHaveBeenCalledWith(expect.objectContaining({action:'pause-ack',ticket:9,paused:true}));
    // Release has a separate, acknowledged quiescence operation.
    const releasing=releaseCompatibleSleepOutput();await flush();quiet(true);await releasing;
});
