// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import RearLyricsPanel from '@/components/rear/RearLyricsPanel';

// test/unit/settings/rearTapControls.test.ts
const receiver=vi.hoisted(()=>({config:null as null|((config:any)=>void)}));
vi.mock('@/hooks/useStageActivity',()=>({useRearStageActive:()=>true}));
vi.mock('@/hooks/useRearLayoutEvidence',()=>({useRearLayoutEvidence:()=>{}}));
vi.mock('@/services/rearAodRuntime',()=>({useRearAod:()=>false}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/services/rearLyricsTransport',()=>({createRearLyricsTransport:(_clock:unknown,config:(config:any)=>void)=>{receiver.config=config;return{subscribe:()=>()=>{}};}}));
vi.mock('@/components/obs/ObsBrowserSourceApp',()=>({default:()=>null}));
it('never reveals disabled controls on entry or taps, hides immediately and restores timed reveal when enabled',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.useFakeTimers();
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    try{
        await act(async()=>root.render(React.createElement(RearLyricsPanel)));
        const bar=()=>host.querySelector<HTMLElement>('[data-testid="rear-progress"]')!;
        const config=(enabled:boolean)=>act(()=>receiver.config!({rearTapControls:enabled,theme:{primaryColor:'#fff'}}));
        const tap=()=>act(()=>host.querySelector('main')!.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));
        config(false);tap();expect(bar().hidden).toBe(true);expect(bar().getAttribute('aria-hidden')).toBe('true');
        config(true);expect(bar().hidden).toBe(false);expect(bar().getAttribute('aria-hidden')).toBe('false');
        await act(async()=>vi.advanceTimersByTime(2500));expect(bar().getAttribute('aria-hidden')).toBe('true');
        tap();expect(bar().getAttribute('aria-hidden')).toBe('false');
        config(false);tap();expect(bar().hidden).toBe(true);expect(bar().getAttribute('aria-hidden')).toBe('true');
    }finally{await act(async()=>root.unmount());host.remove();vi.useRealTimers();}
});

