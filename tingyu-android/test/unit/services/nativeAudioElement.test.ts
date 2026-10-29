// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { attachNativeAudioElement, isNativeAudioElement, nativeAudioSpectrum } from '@/services/nativeAudioElement';
import type { NativeAudioState } from '@/types/nativeAudio';

// test/unit/services/nativeAudioElement.test.ts
afterEach(()=>vi.useRealTimers());
async function fixture(rejectDetach=false){
    const element=document.createElement('audio'),remove=vi.fn(async()=>{}),commands:Record<string,any>[]=[];
    let callback!:(state:NativeAudioState)=>void;
    const adapter=attachNativeAudioElement(element,{probe:async()=>({supported:true,engine:'test'}),command:async value=>{commands.push(value);if(rejectDetach&&value.action==='detach')throw Error('detach failed');return{accepted:true}},
        addListener:async(_name,listener)=>{callback=listener;return{remove}}});
    const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
    const state=(patch:Partial<NativeAudioState>={})=>callback({id:commands.at(-1)!.id,sequence:commands.at(-1)!.sequence,type:'state',
        position:0,duration:200,buffered:20,playing:false,paused:true,status:3,...patch});
    adapter.setSource('https://music.example/a.mp3','original-platform:song-1');await flush();
    return{element,adapter,commands,remove,flush,state};
}
it('keeps browser network/decoder idle while exposing metadata through the existing media contract',async()=>{
    const f=await fixture(),metadata=vi.fn();f.element.addEventListener('loadedmetadata',metadata);
    expect(isNativeAudioElement(f.element)).toBe(true);
    expect(Element.prototype.getAttribute.call(f.element,'src')).toBe(null);
    expect(f.element.getAttribute('src')).toBe('https://music.example/a.mp3');
    f.state();expect(f.element.duration).toBe(200);expect(f.element.readyState).toBe(4);expect(metadata).toHaveBeenCalledOnce();
    await f.adapter.dispose();expect(isNativeAudioElement(f.element)).toBe(false);expect(f.remove).toHaveBeenCalledOnce();
});
it('resolves Play on native output, anchors the clock, and does not replay playing events on heartbeats',async()=>{
    vi.useFakeTimers();const f=await fixture(),started=vi.fn();f.element.addEventListener('playing',started);
    const play=f.element.play();await f.flush();f.state({paused:false,playing:true,position:12});await play;
    expect(f.element.paused).toBe(false);vi.advanceTimersByTime(250);expect(f.element.currentTime).toBeCloseTo(12.25);
    f.state({type:'clock',paused:false,playing:true,position:13});expect(started).toHaveBeenCalledOnce();
    const values=new Array(1024).fill(21);f.state({type:'spectrum',spectrum:values});expect(nativeAudioSpectrum(f.element)![10]).toBe(21);
    await f.adapter.dispose();
});
it('does not replay a lyric boundary when a native clock packet arrives late',async()=>{
    vi.useFakeTimers({now:100000,toFake:['Date','performance','setTimeout','clearTimeout']});
    const f=await fixture(),play=f.element.play();await f.flush();
    f.state({paused:false,playing:true,position:12.9,capturedAtMs:Date.now()});await play;
    vi.advanceTimersByTime(220);const before=f.element.currentTime;
    // Native sampled 70ms before JS could process the packet; that delay is not a seek.
    f.state({type:'clock',paused:false,playing:true,position:13.05,capturedAtMs:Date.now()-70});
    expect(f.element.currentTime).toBeCloseTo(before,5);
    expect(f.element.currentTime).toBeGreaterThan(13.1);
    // Real backward seeks (including short ones) must remain immediate.
    f.element.currentTime=12.98;await f.flush();
    f.state({type:'seeked',paused:false,playing:true,position:12.98,capturedAtMs:Date.now()});
    expect(f.element.currentTime).toBeCloseTo(12.98);await f.adapter.dispose();
});
it('never extrapolates paused packets or implausibly old timestamps',async()=>{
    vi.useFakeTimers({now:100000,toFake:['Date','performance','setTimeout','clearTimeout']});
    const f=await fixture();f.state({position:12,capturedAtMs:Date.now()-400});
    expect(f.element.currentTime).toBe(12);
    const play=f.element.play();await f.flush();
    f.state({playing:true,paused:false,position:15,capturedAtMs:Date.now()-60000});await play;
    expect(f.element.currentTime).toBe(15);await f.adapter.dispose();
});
it('cancels stale Play on Pause, freezes its local clock, and passes seek/volume without UI-frame polling',async()=>{
    const f=await fixture();const promise=f.element.play().catch(reason=>reason.name);await f.flush();f.element.pause();
    expect(await promise).toBe('AbortError');expect(f.element.paused).toBe(true);
    f.element.currentTime=41;f.element.volume=.4;f.element.volume=.4;f.element.muted=false;await f.flush();
    expect(f.commands.slice().reverse().find(value=>value.action==='seek')!.position).toBe(41000);
    expect(f.commands.slice().reverse().find(value=>value.action==='volume')!.volume).toBe(.4);
    expect(f.commands.filter(value=>value.action==='volume')).toHaveLength(1);
    await f.adapter.dispose();
});
it('rejects retired-source errors and stops native output when a source is cleared',async()=>{
    const f=await fixture(),error=vi.fn();const old=f.commands[0];f.element.addEventListener('error',error);
    f.adapter.setSource('https://music.example/b.mp3','song-2');await f.flush();
    f.state({id:old.id,errorCode:2001,message:'old network error'});expect(error).not.toHaveBeenCalled();
    const active=f.commands.at(-1)!.id;f.adapter.setSource('','');await f.flush();
    expect(f.commands.at(-1)).toMatchObject({action:'detach',id:active});await f.adapter.dispose();
});
it('surfaces native decoder failures instead of leaving a pending Play without a message',async()=>{
    const f=await fixture(),errors=vi.fn();f.element.addEventListener('error',errors);
    const play=f.element.play().catch(reason=>reason.message);await f.flush();
    f.state({type:'error',status:1,errorCode:4001,message:'ERROR_CODE_DECODING_FAILED'});
    expect(await play).toContain('ERROR_CODE_DECODING_FAILED');expect(f.element.error?.code).toBe(3);expect(errors).toHaveBeenCalledOnce();
    await f.adapter.dispose();
});

it('emits terminal ended/error once, even if native events are coalesced or repeated',async()=>{
    const f=await fixture(),ended=vi.fn(),errors=vi.fn();f.element.addEventListener('ended',ended);f.element.addEventListener('error',errors);
    f.state({status:4});f.state({status:4,type:'clock'});expect(ended).toHaveBeenCalledOnce();
    f.adapter.setSource('https://music.example/next.mp3','next');await f.flush();
    f.state({errorCode:2001});f.state({errorCode:2001,type:'clock'});expect(errors).toHaveBeenCalledOnce();await f.adapter.dispose();
});

it('does not acknowledge engine handoff when native output has not confirmed stopping',async()=>{
    const f=await fixture(true);await expect(f.adapter.dispose()).rejects.toThrow('detach failed');expect(f.remove).toHaveBeenCalledOnce();
});

it('a retry after a prepare error rejects on the new native error instead of remaining falsely unpaused',async()=>{
    const f=await fixture(),errors=vi.fn();f.element.addEventListener('error',errors);
    f.state({type:'error',status:1,errorCode:1004,message:'ERROR_CODE_FAILED_RUNTIME_CHECK'});
    const played=f.element.play().catch(reason=>reason.message);await f.flush();
    f.state({type:'state',status:2,paused:false});
    f.state({type:'error',status:1,paused:false,errorCode:1004,message:'ERROR_CODE_FAILED_RUNTIME_CHECK'});
    expect(await played).toContain('ERROR_CODE_FAILED_RUNTIME_CHECK');
    // Repeated native notifications may carry desiredPaused=false after an error.
    f.state({type:'state',status:1,paused:false,errorCode:1004,message:'ERROR_CODE_FAILED_RUNTIME_CHECK'});
    expect(f.element.paused).toBe(true);expect(f.element.readyState).toBe(0);expect(errors).toHaveBeenCalledTimes(2);
    await f.adapter.dispose();
});
it('a successful retry clears its previous media error',async()=>{
    const f=await fixture();f.state({type:'error',status:1,errorCode:1004,message:'failed'});
    const played=f.element.play();await f.flush();f.state({status:3,playing:true,paused:false});await played;
    expect(f.element.error).toBeNull();expect(f.element.paused).toBe(false);expect(f.element.readyState).toBe(4);
    await f.adapter.dispose();
});
it('a native output timeout pauses the transport and does not leave a playing-looking element',async()=>{
    vi.useFakeTimers();const f=await fixture(),paused=vi.fn();f.element.addEventListener('pause',paused);
    const played=f.element.play().catch(reason=>reason.message);await f.flush();
    await vi.advanceTimersByTimeAsync(15001);expect(await played).toContain('超时');
    expect(f.element.paused).toBe(true);expect(paused).toHaveBeenCalledOnce();expect(f.commands.at(-1)?.action).toBe('pause');
    await f.adapter.dispose();
});

it('ignores late transport events and obsolete queued sources during rapid skips',async()=>{
    const f=await fixture();const played=f.element.play();await f.flush();
    const playCommand=f.commands.at(-1)!;
    f.state({paused:false,playing:true,position:2});await played;
    f.element.pause();await f.flush();
    f.state({sequence:playCommand.sequence,paused:false,playing:true,position:3});
    expect(f.element.paused).toBe(true);
    f.adapter.setSource('https://music.example/b.mp3','b');
    f.adapter.setSource('https://music.example/c.mp3','c');await f.flush();
    expect(f.commands.filter(c=>c.action==='prepare').map(c=>c.uri)).toEqual(['https://music.example/a.mp3','https://music.example/c.mp3']);
    await f.adapter.dispose();
});
