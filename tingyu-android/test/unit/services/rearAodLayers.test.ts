// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import RearLyricsSurface from '@/components/rear/RearLyricsSurface';
import {applyRearMode} from '@/services/rearAodRuntime';

// test/unit/services/rearAodLayers.test.ts
vi.mock('@/components/visualizer/backgrounds/VisualizerBackgroundRenderer',()=>({default:()=>React.createElement('div',{'data-testid':'background-renderer'})}));
vi.mock('@/services/rearBootTrace',()=>({rearBootTrace:vi.fn()}));
vi.mock('@/hooks/useStageActivity',()=>({useRearStageActive:()=>true}));
vi.mock('@/hooks/useRearViewport',()=>({useRearViewport:()=>({left:0,top:0,width:400,height:300})}));
vi.mock('@/services/rearLyricsTransport',()=>({createRearLyricsTransport:()=>({subscribe:(events:any)=>{events.config({theme:{backgroundColor:'#e0eee0'},background:{},visualizerOpacity:1});return()=>{};}})}));
vi.mock('@/services/rearStateRelay',()=>({createRearStateRelay:()=>({publish:vi.fn(),setConnected:vi.fn(),reset:vi.fn(),dispose:vi.fn()})}));
afterEach(()=>{document.body.innerHTML='';document.head.querySelectorAll('[data-test-aod]').forEach(el=>el.remove());delete document.documentElement.dataset.rearAod;delete document.documentElement.dataset.foliaSurface;vi.unstubAllGlobals();});
it('dims only the background and keeps the lyric iframe outside that filter before, during and after AOD',async()=>{
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
    await act(async()=>{root.render(React.createElement(RearLyricsSurface));});
    const stage=container.querySelector('[data-testid=rear-lyrics-surface]') as HTMLElement;
    const wallpaper=container.querySelector('[data-testid=rear-wallpaper]') as HTMLElement;
    const frame=container.querySelector('iframe')!;
    expect(stage.style.filter).toBe('');expect(wallpaper.style.filter).toBe('');
    await act(async()=>{applyRearMode({mode:'AOD',sequence:1});});
    expect(stage.style.filter).toBe('');expect(wallpaper.style.filter).toContain('brightness(.38)');
    expect(wallpaper.contains(frame)).toBe(false);expect(frame.style.filter).toBe('');
    await act(async()=>{applyRearMode({mode:'NORMAL',sequence:2});});
    expect(stage.style.filter).toBe('');expect(wallpaper.style.filter).toBe('');
    await act(async()=>root.unmount());
});
it('scopes subtitle attenuation to the rear AOD document while preserving current lyric opacity and color',()=>{
    const style=document.createElement('style');style.dataset.testAod='true';
    style.textContent=readFileSync(path.resolve('src/components/rear/rearAod.css'),'utf8');
    document.body.innerHTML='<div id="current" style="color:rgb(120,200,160)">current</div><div data-subtitle-track="translation">secondary</div>';
    const current=document.querySelector('#current')!,secondary=document.querySelector('[data-subtitle-track]')!;
    document.documentElement.dataset.foliaSurface='rear-lyrics-panel';document.documentElement.dataset.rearAod='true';
    document.head.append(style);
    expect(getComputedStyle(secondary).opacity).toBe('0.72');
    expect(getComputedStyle(current).color).toBe('rgb(120, 200, 160)');
    expect(getComputedStyle(current).filter).toBe('');
    // jsdom caches descendant styles across ancestor data-attribute edits; invalidate its sheet cache.
    document.documentElement.dataset.rearAod='false';style.remove();document.head.append(style);expect(getComputedStyle(secondary).opacity).not.toBe('0.72');
    document.documentElement.dataset.rearAod='true';document.documentElement.dataset.foliaSurface='main';
    style.remove();document.head.append(style);expect(getComputedStyle(secondary).opacity).not.toBe('0.72');
});
