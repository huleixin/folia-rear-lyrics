// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createRearStateRelay, subscribeRearStateRelay, type RearStateSnapshot } from '@/services/rearStateRelay';
import { createRearLyricsTransport } from '@/services/rearLyricsTransport';
import { PlayerState } from '@/types';

// test/unit/services/rearStateRelay.test.ts
// Same-origin window messaging model with cloned payloads; no WebView graphics/layout claims.
function windows(){
    const host=Object.assign(new EventTarget(),{location:{origin:'https://localhost'}}) as unknown as Window;
    const child=Object.assign(new EventTarget(),{location:{origin:'https://localhost'},parent:host,setTimeout,clearTimeout}) as unknown as Window;
    const deliver=(target:Window,source:Window,data:unknown,origin='https://localhost')=>{
        const event=new Event('message');Object.defineProperties(event,{data:{value:structuredClone(data)},source:{value:source},origin:{value:origin}});target.dispatchEvent(event);
    };
    host.postMessage=vi.fn((data:unknown)=>deliver(host,child,data));child.postMessage=vi.fn((data:unknown)=>deliver(child,host,data));
    return {host,child,deliver};
}
const snapshot=(time=10,withConfig=false)=>({revision:1,...(withConfig?{config:{theme:{},song:{id:'real-song'}}}:{}),
    clock:{currentTime:time,duration:100,playerState:PlayerState.PLAYING,playbackRate:1,sentAtMs:Date.now()}}) as RearStateSnapshot;
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('replays configuration on iframe reload, validates origin/source/session and removes old subscriptions',()=>{
    vi.useFakeTimers();const {host,child,deliver}=windows();const relay=createRearStateRelay(()=>child,host);
    relay.publish(snapshot(10,true));const receive=vi.fn();const stop=subscribeRearStateRelay(receive,vi.fn(),child);
    expect(receive).toHaveBeenCalledTimes(1);expect(receive.mock.lastCall?.[0].config.song.id).toBe('real-song');
    const subscription=(host.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    deliver(host,child,{...subscription,session:'hostile'},'https://external.invalid');
    deliver(host,host,{...subscription,session:'wrong-frame'});
    relay.publish(snapshot(11));expect(receive).toHaveBeenCalledTimes(2);
    const reloaded=vi.fn();const stopNew=subscribeRearStateRelay(reloaded,vi.fn(),child);
    expect(reloaded.mock.lastCall?.[0].config.song.id).toBe('real-song');
    stop();relay.publish(snapshot(12));expect(reloaded.mock.lastCall?.[0].clock.currentTime).toBe(12);
    relay.dispose();const replacement=createRearStateRelay(()=>child,host);replacement.publish(snapshot(13,true));
    expect(reloaded.mock.lastCall?.[0].clock.currentTime).toBe(13);
    stopNew();const count=(child.postMessage as ReturnType<typeof vi.fn>).mock.calls.length;replacement.publish(snapshot(14));
    expect(child.postMessage).toHaveBeenCalledTimes(count);replacement.dispose();expect(vi.getTimerCount()).toBe(0);
});
it('uses one native fetch loop for both documents, preserves clocks, and stops/restarts through sleep',async()=>{
    vi.useFakeTimers();const {host,child}=windows();const relay=createRearStateRelay(()=>child,host);
    const fetcher=vi.fn(async(url:string)=>({ok:true,json:async()=>snapshot(10+Date.now()/1000,url.includes('revision=-1'))}));vi.stubGlobal('fetch',fetcher);
    const outerClock=vi.fn(),innerClock=vi.fn(),innerConfig=vi.fn();
    const events={config:vi.fn(),clock:outerClock,audio:vi.fn(),connected:relay.setConnected};
    const stopOuter=createRearLyricsTransport(()=>undefined,()=>undefined,false,{onSnapshot:relay.publish}).subscribe(events);
    const stopInner=createRearLyricsTransport(()=>undefined,()=>undefined,false,{receiveSnapshots:(data,connection)=>subscribeRearStateRelay(data,connection,child)})
        .subscribe({...events,config:innerConfig,clock:innerClock,connected:vi.fn()});
    await vi.advanceTimersByTimeAsync(500);
    expect(fetcher).toHaveBeenCalledTimes(6);expect(outerClock).toHaveBeenCalledTimes(6);expect(innerClock).toHaveBeenCalledTimes(6);
    expect(innerClock.mock.lastCall?.[0]).toEqual(outerClock.mock.lastCall?.[0]);expect(innerConfig).toHaveBeenCalledTimes(1);
    const power=(sleeping:boolean)=>window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping}}));
    power(true);const count=fetcher.mock.calls.length;await vi.advanceTimersByTimeAsync(2000);expect(fetcher).toHaveBeenCalledTimes(count);
    power(false);await vi.advanceTimersByTimeAsync(150);expect(fetcher.mock.calls.length).toBeGreaterThan(count);expect(innerConfig).toHaveBeenCalledTimes(1);
    stopOuter();stopInner();relay.dispose();const after=fetcher.mock.calls.length;await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(after);expect(vi.getTimerCount()).toBe(0);
});
it('retains newer config while an uploaded font is loading instead of dropping it behind clock-only packets',async()=>{
    let resolveFont:(value:unknown)=>void=()=>undefined;
    const font={load:()=>new Promise(resolve=>{resolveFont=resolve;})};
    vi.stubGlobal('FontFace',class { load=font.load; });
    const fonts={add:vi.fn(),delete:vi.fn()};Object.defineProperty(document,'fonts',{configurable:true,value:fonts});
    let incoming:(value:RearStateSnapshot)=>void=()=>undefined;
    const config=vi.fn(),clock=vi.fn();
    const stop=createRearLyricsTransport(()=>undefined,()=>undefined,true,{receiveSnapshots:receive=>{incoming=receive;return ()=>undefined;}})
        .subscribe({config,clock,audio:vi.fn(),connected:vi.fn()});
    const uploadedFont={id:'font-a',family:'custom',url:'data:font/woff2;base64,AA=='};
    incoming({...snapshot(10,true),uploadedFont});
    incoming({...snapshot(11,true),revision:2,uploadedFont,config:{...snapshot(11,true).config!,song:{id:'new-song',name:'new-song'}}});
    incoming({...snapshot(12),revision:2});resolveFont(font);
    for(let i=0;i<8;i++)await Promise.resolve();
    expect(config.mock.lastCall?.[0].song.id).toBe('new-song');expect(clock.mock.lastCall?.[0].currentTime).toBe(12);
    expect(fonts.add).toHaveBeenCalledTimes(1);stop();expect(fonts.delete).toHaveBeenCalledTimes(1);
    delete (document as unknown as {fonts?:unknown}).fonts;
});
