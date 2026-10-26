// @vitest-environment jsdom
import React,{act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import MonetBackgroundLayer from '@/components/visualizer/backgrounds/monet/MonetBackgroundLayer';
import {DEFAULT_MONET_BACKGROUND_TUNING} from '@/types';

// test/unit/visualizer/monetPause.test.ts
// A paused wallpaper must retain its compositor animation position, not rebuild its drift track.
vi.mock('@/components/visualizer/monet/monetBackgroundPipeline',()=>({getMonetBackgroundCacheKey:()=>'',resolveMonetBackgroundDataUrl:async()=>null,checkCanvasFilterSupport:()=>true}));
vi.mock('@/hooks/useReducedMotionFor',()=>({useReducedMotionFor:()=>false}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('pauses/resumes the existing drift animation and cancels it only on unmount',()=>{
    const animation={pause:vi.fn(),play:vi.fn(),cancel:vi.fn()};
    const animate=vi.fn(()=>animation);const original=HTMLElement.prototype.animate;
    HTMLElement.prototype.animate=animate as never;
    const host=document.createElement('div'),root=createRoot(host);
    const props={theme:{backgroundColor:'#000',primaryColor:'#fff',accentColor:'#888',secondaryColor:'#777'} as never,
        tuning:{...DEFAULT_MONET_BACKGROUND_TUNING,backgroundDriftEnabled:true,backgroundDriftStrength:.5}};
    try {
        act(()=>root.render(h(MonetBackgroundLayer,props)));expect(animate).toHaveBeenCalledOnce();
        act(()=>root.render(h(MonetBackgroundLayer,{...props,paused:true})));expect(animation.pause).toHaveBeenCalledOnce();expect(animation.cancel).not.toHaveBeenCalled();
        act(()=>root.render(h(MonetBackgroundLayer,{...props,paused:false})));expect(animate).toHaveBeenCalledOnce();expect(animation.play).toHaveBeenCalled();
    } finally {act(()=>root.unmount());HTMLElement.prototype.animate=original;}
    expect(animation.cancel).toHaveBeenCalledOnce();
});
