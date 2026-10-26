// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createElement as h, act } from 'react';
import { createRoot } from 'react-dom/client';
import { useMainStageActive, useRearStageActive } from '@/hooks/useStageActivity';
import { isMainStageActive, MAIN_STAGE_ACTIVITY_EVENT } from '@/utils/stageActivity';

// test/unit/utils/stageActivity.test.ts
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>vi.unstubAllGlobals());
it('independently stops main/rear stages without confusing screen-off with stopped playback',()=>{
    vi.stubGlobal('Capacitor',{getPlatform:()=> 'android'});
    let hidden=false;Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
    const w=window as Window & {__tingyuMainVisible?:boolean;__tingyuRearSleeping?:boolean};
    w.__tingyuMainVisible=true;w.__tingyuRearSleeping=false;
    const host=document.createElement('div'),root=createRoot(host);
    function Harness(){const main=useMainStageActive(),rear=useRearStageActive();return h('output',null,`${main}/${rear}`);}
    act(()=>root.render(h(Harness)));expect(host.textContent).toBe('true/true');
    act(()=>{w.__tingyuMainVisible=false;window.dispatchEvent(new Event(MAIN_STAGE_ACTIVITY_EVENT));});expect(host.textContent).toBe('false/true');
    act(()=>window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping:true}})));expect(host.textContent).toBe('false/false');
    act(()=>{w.__tingyuMainVisible=true;window.dispatchEvent(new Event(MAIN_STAGE_ACTIVITY_EVENT));});expect(host.textContent).toBe('true/false');
    act(()=>window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping:false}})));expect(host.textContent).toBe('true/true');
    act(()=>{hidden=true;document.dispatchEvent(new Event('visibilitychange'));});expect(host.textContent).toBe('false/false');
    act(()=>{hidden=false;document.dispatchEvent(new Event('visibilitychange'));});expect(host.textContent).toBe('true/true');
    act(()=>root.unmount());
    delete w.__tingyuMainVisible;delete w.__tingyuRearSleeping;
});
it('keeps desktop rendering behaviour independent of Android native activity hints',()=>{
    vi.stubGlobal('Capacitor',{getPlatform:()=> 'web'});
    expect(isMainStageActive()).toBe(true);
});
