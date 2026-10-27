// @vitest-environment jsdom
import React, { act, createElement as h, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useComposeChrome } from '@/hooks/useComposeChrome';

// test/unit/hooks/composeChrome.test.ts
const bridge=vi.hoisted(()=>({update:vi.fn(),clock:vi.fn(),remove:vi.fn(),callback:null as null|((e:any)=>void),interact:vi.fn(),supported:true}));
vi.mock('@/services/nativeChrome',()=>({COMPOSE_CHROME_FAILURE_EVENT:'tingyu-compose-chrome-failed',PREHIDE_COMPOSE_CHROME:true,canUseComposeChrome:async()=>bridge.supported,newChromeGeneration:()=>1,
    chromeNative:{update:bridge.update,clock:bridge.clock,remove:bridge.remove,addListener:async(_name:string,callback:(e:any)=>void)=>{bridge.callback=callback;return{remove:async()=>{}}}},
    chromeWindowInteraction:bridge.interact,
    chromeClockNeedsAnchor:(now:number,at:number,p:number,last:number,playing:boolean)=>now-at>=2000||Math.abs(p-last-(playing?(now-at)/1000:0))>.65,
}));
vi.mock('@/utils/stageActivity',()=>({isMainStageActive:()=>true,subscribeMainStageActivity:()=>()=>{}}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
const clock=motionValue(0),queue=vi.fn();
function Probe({active=true,id='mini'}:{active?:boolean;id?:'mini'|'nav'}){
    const ref=useRef<HTMLDivElement>(null);
    useComposeChrome(ref,id,active,{trackKey:'one',playing:true,duration:200},{queue},clock);
    return h('div',{ref,style:{opacity:1},'data-testid':'control'},'Fallback');
}
async function settle(ms=500){await act(async()=>{await vi.advanceTimersByTimeAsync(ms)});}
beforeEach(()=>{
    vi.useFakeTimers();vi.clearAllMocks();clock.set(0);bridge.supported=true;
    vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:600,width:360,height:46,right:360,bottom:646,x:0,y:600,toJSON:()=>({})});
    bridge.update.mockImplementation(async f=>({accepted:true,session:f.session}));bridge.clock.mockResolvedValue(undefined);bridge.remove.mockResolvedValue(undefined);
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('has no idle polling and removes native controls when inactive',async()=>{
    act(()=>root.render(h(Probe)));
    expect(host.firstElementChild?.getAttribute('data-compose-pending')).toBe('true');
    await settle();
    expect(host.firstElementChild?.getAttribute('data-compose-native')).toBe('true');
    expect(host.firstElementChild?.hasAttribute('data-compose-pending')).toBe(false);
    const count=bridge.update.mock.calls.length;await settle(10000);expect(bridge.update).toHaveBeenCalledTimes(count);expect(vi.getTimerCount()).toBe(0);
    await act(async()=>root.render(h(Probe,{active:false})));
    expect(host.firstElementChild?.hasAttribute('data-compose-native')).toBe(false);
    expect(host.firstElementChild?.getAttribute('data-compose-pending')).toBe('true');
    expect(bridge.remove).toHaveBeenCalled();
});
it('restores the original controls if the native probe is unsupported',async()=>{
    bridge.supported=false;
    act(()=>root.render(h(Probe)));
    expect(host.firstElementChild?.getAttribute('data-compose-pending')).toBe('true');
    await settle();
    expect(host.firstElementChild?.hasAttribute('data-compose-pending')).toBe(false);
    expect(host.firstElementChild?.hasAttribute('data-compose-native')).toBe(false);
    expect(bridge.update).not.toHaveBeenCalled();
});
it('ignores stale events, preserves active actions and releases a held gesture on hide',async()=>{
    await act(async()=>root.render(h(Probe)));await settle();
    const frame=bridge.update.mock.calls.at(-1)![0];
    act(()=>bridge.callback?.({id:'mini',session:'expired',action:'queue',value:0}));expect(queue).not.toHaveBeenCalled();
    act(()=>bridge.callback?.({id:'mini',session:frame.session,action:'queue',value:0}));expect(queue).toHaveBeenCalledTimes(1);
    act(()=>bridge.callback?.({id:'mini',session:frame.session,action:'interactionStart',value:0}));
    await act(async()=>root.render(h(Probe,{active:false})));expect(bridge.interact).toHaveBeenLastCalledWith('end');
});
it('bridges low-rate anchors instead of every progress frame',async()=>{
    await act(async()=>root.render(h(Probe)));await settle();
    for(let tick=1;tick<=240;tick++){await settle(1000/60);act(()=>clock.set(tick/60));}
    expect(bridge.clock.mock.calls.length).toBeLessThanOrEqual(3);expect(bridge.clock.mock.calls.length).toBeGreaterThanOrEqual(1);
});
it('restores every web fallback when the shared native host fails',async()=>{
    await act(async()=>root.render(h(React.Fragment,null,h(Probe),h(Probe,{id:'nav'}))));await settle();
    expect(host.querySelectorAll('[data-compose-native=true]')).toHaveLength(2);
    act(()=>window.dispatchEvent(new Event('tingyu-compose-chrome-failed')));
    expect(host.querySelectorAll('[data-compose-native=true]')).toHaveLength(0);
    const count=bridge.update.mock.calls.length;await settle(2000);expect(bridge.update).toHaveBeenCalledTimes(count);
});
