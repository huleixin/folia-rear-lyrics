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
