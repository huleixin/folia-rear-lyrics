// @vitest-environment jsdom
import React, { act, createElement as h, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useNativePage } from '@/hooks/useNativePage';
import { useComposeChrome } from '@/hooks/useComposeChrome';
import type { NativePageModel } from '@/types/nativePages';

// test/unit/hooks/startupPresentationHold.test.ts
// 启动与前后台切换专项（录屏 68710）：React 重建后数据未就绪时，页面/迷你条
// 不得把「空态包」发给原生顶掉缓存呈递。本文件在桥级别验证两条 hold 语义：
//   · useNativePage(model=null) → 不发包；模型就绪 → 发布；模型撤回 → 保持上一包。
//   · useComposeChrome(hold=true) → 不发包；hold 解除 → 发布。
// 缓存页/缓存迷你条的原生侧行为由 ComposeChromeHost 的 bootPage/seed 保证
// （firstHomeFrame 只随路由离开 home 翻转），这里不重复覆盖。

const pagesBridge=vi.hoisted(()=>({update:vi.fn(),remove:vi.fn(),supported:true}));
vi.mock('@/services/nativePages',()=>({NATIVE_FIRST:true,canUseNativePages:async()=>pagesBridge.supported,nativePages:{
    pageUpdate:pagesBridge.update,pageRemove:pagesBridge.remove,addListener:async()=>({remove:async()=>{}}),
}}));
const chromeBridge=vi.hoisted(()=>({update:vi.fn(),clock:vi.fn(),remove:vi.fn(),supported:true}));
vi.mock('@/services/nativeChrome',()=>({COMPOSE_CHROME_FAILURE_EVENT:'tingyu-compose-chrome-failed',PREHIDE_COMPOSE_CHROME:true,
    canUseComposeChrome:async()=>chromeBridge.supported,newChromeGeneration:()=>1,
    chromeNative:{update:chromeBridge.update,clock:chromeBridge.clock,remove:chromeBridge.remove,addListener:async()=>({remove:async()=>{}})},
    chromeWindowInteraction:vi.fn(),hasBlockingChromeWindow:()=>false,
    chromeClockNeedsAnchor:(now:number,at:number,p:number,last:number,playing:boolean)=>now-at>=2000||Math.abs(p-last-(playing?(now-at)/1000:0))>.65,
}));
vi.mock('@/hooks/useNativePageImages',()=>({useNativePageImages:(model:any)=>model}));
vi.mock('@/utils/stageActivity',()=>({isMainStageActive:()=>true,subscribeMainStageActivity:()=>()=>{}}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root:Root,host:HTMLDivElement;
const MODEL_A:NativePageModel={key:'home:local:hydrated',title:'推荐',sections:[]};
const MODEL_B:NativePageModel={key:'home:local:revised',title:'推荐',sections:[]};

function PageProbe({model}:{model:NativePageModel|null}){
    const ref=useRef<HTMLDivElement>(null);
    useNativePage(ref,'home',true,model,{});
    return h('div',{ref},'page');
}
function MiniProbe({hold}:{hold:boolean}){
    const ref=useRef<HTMLDivElement>(null);
    useComposeChrome(ref,'mini',true,{trackKey:'',playing:false,duration:0},{} as never,motionValue(0),hold);
    return h('div',{ref},'mini');
}
/** 曲库水合信号探针：动态加载模块，验证 mark 后等待者被唤醒。 */
function HydrationProbe({useHook,done}:{useHook:()=>boolean;done:(value:boolean)=>void}){
    const value=useHook();
    const [,bump]=useState(0);
    React.useEffect(()=>{done(value);},[value,done]);
    return h('button',{onClick:()=>bump(value=>value+1)},String(value));
}

beforeEach(()=>{
    vi.clearAllMocks();
    vi.useFakeTimers();
    pagesBridge.supported=true;chromeBridge.supported=true;
    vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
    vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:393,height:852,right:393,bottom:852,x:0,y:0,toJSON:()=>({})});
    pagesBridge.update.mockImplementation(async frame=>({accepted:true,session:frame.session}));
    chromeBridge.update.mockImplementation(async frame=>({accepted:true,session:frame.session}));
    pagesBridge.remove.mockResolvedValue(undefined);chromeBridge.remove.mockResolvedValue(undefined);
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('页面模型为 null 时不发包，模型就绪后立即发布真实数据',async()=>{
    await act(async()=>root.render(h(PageProbe,{model:null})));
    await act(async()=>{await vi.advanceTimersByTimeAsync(50);});
    expect(pagesBridge.update).not.toHaveBeenCalled();
    await act(async()=>root.render(h(PageProbe,{model:MODEL_A})));
    await act(async()=>{await vi.advanceTimersByTimeAsync(50);});
    expect(pagesBridge.update).toHaveBeenCalledTimes(1);
    expect(pagesBridge.update.mock.calls[0][0].model.key).toBe('home:local:hydrated');
});

it('模型撤回（再次为 null）时保持上一包，不重发也不清空',async()=>{
    await act(async()=>root.render(h(PageProbe,{model:MODEL_A})));
    await act(async()=>{await vi.advanceTimersByTimeAsync(50);});
    expect(pagesBridge.update).toHaveBeenCalledTimes(1);
    await act(async()=>root.render(h(PageProbe,{model:null})));
    await act(async()=>{await vi.advanceTimersByTimeAsync(50);});
    expect(pagesBridge.update).toHaveBeenCalledTimes(1);
    // 换新模型后恢复发布（数据刷新不受 hold 影响）。
    await act(async()=>root.render(h(PageProbe,{model:MODEL_B})));
    await act(async()=>{await vi.advanceTimersByTimeAsync(50);});
    expect(pagesBridge.update).toHaveBeenCalledTimes(2);
    expect(pagesBridge.update.mock.calls[1][0].model.key).toBe('home:local:revised');
});

it('迷你条 hold 期间不发包，解除后立即发布（恢复完成→真实歌曲）',async()=>{
    await act(async()=>root.render(h(MiniProbe,{hold:true})));
    await act(async()=>{await vi.advanceTimersByTimeAsync(500);});
    expect(chromeBridge.update).not.toHaveBeenCalled();
    await act(async()=>root.render(h(MiniProbe,{hold:false})));
    await act(async()=>{await vi.advanceTimersByTimeAsync(100);});
    expect(chromeBridge.update).toHaveBeenCalled();
    expect(chromeBridge.update.mock.calls.at(-1)![0].data.trackKey).toBe('');
});

it('localLibraryHydration：settle 前为未水合，mark 后唤醒等待者并保持为真',async()=>{
    vi.resetModules();
    const mod=await import('@/services/localLibraryHydration');
    expect(mod.isLocalLibraryHydrated()).toBe(false);
    const seen:boolean[]=[];
    await act(async()=>root.render(h(HydrationProbe,{useHook:mod.useLocalLibraryHydrated,done:(value:boolean)=>seen.push(value)})));
    expect(seen).toEqual([false]);
    act(()=>mod.markLocalLibraryHydrated());
    await act(async()=>{});
    expect(seen.at(-1)).toBe(true);
    expect(mod.isLocalLibraryHydrated()).toBe(true);
    // 幂等：重复 mark 不产生额外通知。
    const before=seen.length;
    act(()=>mod.markLocalLibraryHydrated());
    expect(seen.length).toBe(before);
});
