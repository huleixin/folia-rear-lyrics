// @vitest-environment jsdom
import { act, createElement as h, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useNativePage } from '@/hooks/useNativePage';

// test/unit/hooks/nativePage.test.ts
const bridge=vi.hoisted(()=>({update:vi.fn(),remove:vi.fn(),callback:null as null|((event:any)=>void),supported:true}));
vi.mock('@/services/nativePages',()=>({NATIVE_FIRST:true,canUseNativePages:async()=>bridge.supported,nativePages:{
    pageUpdate:bridge.update,pageRemove:bridge.remove,addListener:async(_name:string,callback:(e:any)=>void)=>{bridge.callback=callback;return{remove:async()=>{}}},
}}));
vi.mock('@/hooks/useNativePageImages',()=>({useNativePageImages:(model:any)=>model}));
vi.mock('@/services/nativeChrome',()=>({newChromeGeneration:()=>1}));
vi.mock('@/utils/stageActivity',()=>({isMainStageActive:()=>true,subscribeMainStageActivity:()=>()=>{}}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
const click=vi.fn();
function Probe({active=true,pageKey='home:test'}:{active?:boolean;pageKey?:string}){
    const ref=useRef<HTMLDivElement>(null);
    const native=useNativePage(ref,'home',active,{key:pageKey,title:'推荐',sections:[]},{open:click});
    return h('div',{ref},native?'native-owned':'legacy');
}
function Adapter({element}:{element:React.RefObject<HTMLElement|null>}){
    useNativePage(element,'home',true,{key:'home:adapter',title:'推荐',sections:[]},{});return null;
}
function ParentOwnedRef(){const ref=useRef<HTMLDivElement>(null);return h('div',{ref},h(Adapter,{element:ref}))}
function DocumentProbe({captured=false}:{captured?:boolean}){
    const ref=useRef<HTMLDivElement>(null);
    useNativePage(ref,'settings',true,{key:'settings:document:options:general',title:'界面设置',sections:[],
        document:captured?{paints:[],controls:[],areas:[],live:[]}:undefined},{});
    return h('div',{ref});
}
beforeEach(()=>{
    vi.clearAllMocks();bridge.supported=true;
    vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:393,height:852,right:393,bottom:852,x:0,y:0,toJSON:()=>({})});
    bridge.update.mockImplementation(async frame=>({accepted:true,session:frame.session}));bridge.remove.mockResolvedValue(undefined);
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.restoreAllMocks()});
it('never mounts a legacy page while native data delivery is pending',async()=>{
    let reply=()=>{};bridge.update.mockImplementation(frame=>new Promise(resolve=>{reply=()=>resolve({accepted:true,session:frame.session})}));
    await act(async()=>root.render(h(Probe)));
    expect(host.textContent).toBe('native-owned');expect(host.firstElementChild?.getAttribute('data-native-page')).toBe('true');
    await act(async()=>reply());expect(host.textContent).toBe('native-owned');
});
it('publishes the initial page when its DOM ref belongs to an ancestor',async()=>{
    await act(async()=>root.render(h(ParentOwnedRef)));
    expect(bridge.update).toHaveBeenCalledTimes(1);
    expect(bridge.update.mock.calls[0][0].model.key).toBe('home:adapter');
});
it('does not switch to old UI on unsupported or rejected native packets',async()=>{
    bridge.supported=false;await act(async()=>root.render(h(Probe)));
    expect(host.textContent).toBe('native-owned');expect(bridge.update).not.toHaveBeenCalled();
});
it('checks page session and model identity before running native actions',async()=>{
    await act(async()=>root.render(h(Probe)));const frame=bridge.update.mock.calls.at(-1)![0];
    const event={id:'home',session:frame.session,key:frame.model.key,action:'open'};
    act(()=>bridge.callback?.({...event,session:'stale'}));act(()=>bridge.callback?.({...event,key:'stale'}));expect(click).not.toHaveBeenCalled();
    act(()=>bridge.callback?.(event));expect(click).toHaveBeenCalledTimes(1);
    await act(async()=>root.render(h(Probe,{pageKey:'library:local'})));
    act(()=>bridge.callback?.(event));expect(click).toHaveBeenCalledTimes(1);
});
it('keeps native pages owned while inactive without polling or legacy reappearance',async()=>{
    await act(async()=>root.render(h(Probe)));const count=bridge.update.mock.calls.length;
    await act(async()=>root.render(h(Probe)));expect(bridge.update).toHaveBeenCalledTimes(count);
    await act(async()=>root.render(h(Probe,{active:false})));
    expect(host.textContent).toBe('native-owned');expect(bridge.remove).toHaveBeenCalled();
});
it('never substitutes the settings index while a new document key is being captured',async()=>{
    document.documentElement.dataset.nativeNavigation='route:2';
    await act(async()=>root.render(h(DocumentProbe)));
    expect(bridge.update).not.toHaveBeenCalled();
    await act(async()=>root.render(h(DocumentProbe,{captured:true})));
    // New models are published on the next layout frame, not within React's commit.
    await act(async()=>{await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))});
    expect(bridge.update).toHaveBeenCalledTimes(1);
    expect(bridge.update.mock.calls[0][0].navigation).toBe('route:2');
    delete document.documentElement.dataset.nativeNavigation;
});
it('does not remeasure or resend unchanged models across repeated parent renders',async()=>{
    await act(async()=>root.render(h(Probe)));
    const measure=vi.mocked(HTMLElement.prototype.getBoundingClientRect),count=measure.mock.calls.length;
    const packets=bridge.update.mock.calls.length;
    const stringify=vi.spyOn(JSON,'stringify');
    for(let i=0;i<30;i++)await act(async()=>root.render(h(Probe)));
    expect(measure.mock.calls.length).toBe(count);expect(bridge.update.mock.calls.length).toBe(packets);expect(stringify).not.toHaveBeenCalled();
});
