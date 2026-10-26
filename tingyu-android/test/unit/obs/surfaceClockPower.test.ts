// @vitest-environment jsdom
import React, {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import ObsBrowserSourceApp from '@/components/obs/ObsBrowserSourceApp';
import type {ObsBrowserSourceConfig,ObsBrowserSourceClock} from '@/types/obsBrowserSource';
import type {LyricsSurfaceTransport} from '@/types/lyricsSurfaceTransport';
import type {MotionValue} from 'framer-motion';

// test/unit/obs/surfaceClockPower.test.ts
const observed=vi.hoisted(()=>({clock:null as MotionValue<number>|null}));
vi.mock('@/components/visualizer/VisualizerRenderer',()=>({default:(p:{currentTime:MotionValue<number>})=>{observed.clock=p.currentTime;return h('div',{'data-test-stage':true});}}));
vi.mock('@/utils/frameRateLimiter',()=>({setGlobalVisualizerFrameRate:vi.fn()}));
vi.mock('react-i18next',async original=>({...await original<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key})}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();delete (window as Window & {__tingyuRearSleeping?:boolean}).__tingyuRearSleeping;});
it('does not poll a frozen clock, still applies paused seeks, and catches up once after sleep',()=>{
    vi.useFakeTimers();Object.defineProperty(document,'hidden',{value:false,configurable:true});
    const raf=vi.fn((cb:FrameRequestCallback)=>window.setTimeout(()=>cb(performance.now()),16));
    vi.stubGlobal('requestAnimationFrame',raf);vi.stubGlobal('cancelAnimationFrame',clearTimeout);
    let events:Parameters<LyricsSurfaceTransport['subscribe']>[0];
    const transport:LyricsSurfaceTransport={subscribe:next=>{events=next;return()=>{};}};
    const host=document.createElement('div'),root=createRoot(host);
    act(()=>root.render(h(ObsBrowserSourceApp,{transport})));
    const config={theme:{backgroundColor:'#000',primaryColor:'#fff'},visualizerMode:'classic',lyrics:{lines:[]},background:{transparent:true}} as unknown as ObsBrowserSourceConfig;
    const clock=(time:number,state='PAUSED')=>({currentTime:time,duration:100,playerState:state,playbackRate:1,sentAtMs:Date.now()}) as ObsBrowserSourceClock;
    act(()=>{events.config(config);events.clock(clock(10));});
    expect(observed.clock?.get()).toBe(10);
    const idle=raf.mock.calls.length;act(()=>vi.advanceTimersByTime(1000));expect(raf.mock.calls.length).toBe(idle);
    act(()=>events.clock(clock(25)));expect(observed.clock?.get()).toBe(25);
    act(()=>events.clock(clock(30,'PLAYING')));act(()=>vi.advanceTimersByTime(1000));
    expect(observed.clock?.get()).toBeGreaterThan(30.9);
    act(()=>window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping:true}})));
    expect(host.querySelector('[data-test-stage]')).toBeNull();
    const sleeping=raf.mock.calls.length;act(()=>vi.advanceTimersByTime(2000));expect(raf.mock.calls.length).toBe(sleeping);
    act(()=>window.dispatchEvent(new CustomEvent('folia-rear-power',{detail:{sleeping:false}})));
    expect(host.querySelector('[data-test-stage]')).not.toBeNull();expect(observed.clock?.get()).toBeGreaterThan(32.9);
    act(()=>events.clock(clock(50)));const paused=raf.mock.calls.length;act(()=>vi.advanceTimersByTime(1000));expect(raf.mock.calls.length).toBe(paused);
    expect(observed.clock?.get()).toBe(50);
    act(()=>root.unmount());expect(vi.getTimerCount()).toBe(0);
});
