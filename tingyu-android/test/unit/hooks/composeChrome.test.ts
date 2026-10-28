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
    hasBlockingChromeWindow:()=>[...document.querySelectorAll<HTMLElement>('[data-folia-keyboard-window="true"]')].some(n=>n.dataset.nativeChromeOverlay!=='nonblocking'),
    chromeClockNeedsAnchor:(now:number,at:number,p:number,last:number,playing:boolean)=>now-at>=2000||Math.abs(p-last-(playing?(now-at)/1000:0))>.65,
}));
vi.mock('@/utils/stageActivity',()=>({isMainStageActive:()=>true,subscribeMainStageActivity:()=>()=>{}}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
const clock=motionValue(0),queue=vi.fn();
function Probe({active=true,id='mini'}:{active?:boolean;id?:'mini'|'nav'|'stage'}){
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
    expect(host.firstElementChild?.hasAttribute('data-compose-pending')).toBe(false);
    await settle();
    expect(host.firstElementChild?.getAttribute('data-compose-native')).toBe('true');
    expect(host.firstElementChild?.hasAttribute('data-compose-pending')).toBe(false);
    const count=bridge.update.mock.calls.length;await settle(10000);expect(bridge.update).toHaveBeenCalledTimes(count);expect(vi.getTimerCount()).toBe(0);
    await act(async()=>root.render(h(Probe,{active:false})));
    expect(host.firstElementChild?.getAttribute('data-compose-native')).toBe('true');
    expect(host.firstElementChild?.getAttribute('data-compose-pending')).toBe('true');
    expect(bridge.remove).toHaveBeenCalled();
});
it('connects a native footer without waiting for an invisible ancestor entry animation',async()=>{
    host.setAttribute('inert','');
    await act(async()=>root.render(h(Probe,{id:'nav'})));await settle(20);
    expect(bridge.update.mock.calls.at(-1)?.[0].enabled).toBe(true);
    expect(bridge.update.mock.calls.at(-1)?.[0].safeBottom).toBe(0);
});
it('still honours entry inertness for stage controls',async()=>{
    host.setAttribute('inert','');
    await act(async()=>root.render(h(Probe,{id:'stage'})));await settle(20);
    expect(bridge.update.mock.calls.at(-1)?.[0].enabled).toBe(false);
});
it('never reveals legacy controls if a native probe fails',async()=>{
    bridge.supported=false;
    act(()=>root.render(h(Probe)));
    expect(host.firstElementChild?.hasAttribute('data-compose-pending')).toBe(false);
    await settle();
    expect(host.firstElementChild?.hasAttribute('data-compose-pending')).toBe(false);
    expect(host.firstElementChild?.getAttribute('data-compose-native')).toBe('true');
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
it('retains native ownership and ignores actions when the bridge fails',async()=>{
    await act(async()=>root.render(h(React.Fragment,null,h(Probe),h(Probe,{id:'nav'}))));await settle();
    expect(host.querySelectorAll('[data-compose-native=true]')).toHaveLength(2);
    act(()=>window.dispatchEvent(new Event('tingyu-compose-chrome-failed')));
    expect(host.querySelectorAll('[data-compose-native=true]')).toHaveLength(2);
    const frame=bridge.update.mock.calls.at(-1)![0];
    act(()=>bridge.callback?.({id:frame.id,session:frame.session,action:'queue',value:0}));
    expect(queue).not.toHaveBeenCalled();
    const count=bridge.update.mock.calls.length;await settle(2000);expect(bridge.update).toHaveBeenCalledTimes(count);
});
it('suppresses legacy paint from the first layout even with a delayed reply',async()=>{
    let drawn:(value:any)=>void=()=>{};
    bridge.update.mockImplementation(f=>new Promise(resolve=>{drawn=value=>resolve({session:f.session,...value});}));
    await act(async()=>root.render(h(Probe)));
    await settle(1500);
    expect(host.firstElementChild?.getAttribute('data-compose-native')).toBe('true');
    expect(host.firstElementChild?.hasAttribute('data-compose-pending')).toBe(false);
    await act(async()=>drawn({accepted:true}));
    expect(host.firstElementChild?.getAttribute('data-compose-native')).toBe('true');
});
it('sends modal hiding immediately even while native takeover is awaiting a draw',async()=>{
    const replies:Array<()=>void>=[];
    bridge.update.mockImplementation(f=>new Promise(resolve=>{replies.push(()=>resolve({accepted:true,session:f.session}));}));
    await act(async()=>root.render(h(Probe)));await settle(20);
    const blocker=document.createElement('div');blocker.dataset.foliaKeyboardWindow='true';
    await act(async()=>document.body.append(blocker));
    expect(bridge.update.mock.calls.at(-1)?.[0].enabled).toBe(false);
    expect(bridge.update).toHaveBeenCalledTimes(2);
    await act(async()=>replies[0]());
    expect(host.firstElementChild?.getAttribute('data-compose-native')).toBe('true');
    await act(async()=>replies[1]());
    expect(host.firstElementChild?.getAttribute('data-compose-pending')).toBe('true');
    await act(async()=>blocker.remove());
    expect(bridge.update.mock.calls.at(-1)?.[0].enabled).toBe(true);
    await act(async()=>root.render(h(Probe,{active:false})));
    expect(host.firstElementChild?.getAttribute('data-compose-pending')).toBe('true');
});
it('keeps transport painted behind a non-overlapping stage menu',async()=>{
    await act(async()=>root.render(h(Probe)));await settle();
    const menu=document.createElement('div');menu.dataset.foliaKeyboardWindow='true';menu.dataset.nativeChromeOverlay='nonblocking';
    await act(async()=>document.body.append(menu));
    expect(bridge.update.mock.calls.at(-1)?.[0].enabled).toBe(true);
    expect(host.firstElementChild?.getAttribute('data-compose-native')).toBe('true');
    await act(async()=>menu.remove());
});
