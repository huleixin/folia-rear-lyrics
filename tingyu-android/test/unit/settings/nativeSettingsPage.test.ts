// @vitest-environment jsdom
import { act, createElement as h, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Sparkles } from 'lucide-react';
import { useNativeSettingsPage } from '@/components/modal/settings/useNativeSettingsPage';
import type { SettingsNavGroup } from '@/components/modal/settings/navigation/settingsNavModel';
import zh from '@/i18n/locales/zh-CN';

// test/unit/settings/nativeSettingsPage.test.ts
const state=vi.hoisted(()=>({model:null as any,actions:null as any,snapshot:null as any,change:vi.fn(),refresh:vi.fn()}));
vi.mock('@/hooks/useNativePage',()=>({useNativePage:(_root:any,_id:any,_active:any,model:any,actions:any)=>{state.model=model;state.actions=actions;return true}}));
vi.mock('@/services/nativePages',()=>({absolutePageImage:(image:string)=>image}));
vi.mock('@/services/rearLyricsControl',()=>({setRearLyricsBackend:state.change}));
vi.mock('@/components/modal/settings/useRearLyricsSettings',()=>({useRearLyricsSettings:()=>({available:true,snapshot:state.snapshot,busy:false,failed:false,actionFailed:false,refresh:state.refresh,toggle:()=>{}})}));
vi.mock('react-i18next',async()=>{
    const {default:dictionary}=await import('@/i18n/locales/zh-CN');
    const t=(key:string,args?:Record<string,unknown>)=>{
        const value=key.split('.').reduce<any>((node,part)=>node?.[part],dictionary);
        return typeof value==='string'?value.replace(/{{(\w+)}}/g,(_match,part)=>String(args?.[part]??'')):key;
    };
    return {useTranslation:()=>({t})};
});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;
const groups:SettingsNavGroup[]=[{id:'appearance',label:'外观',items:[{id:'appearance',label:'视觉设置',description:'视觉设置说明',icon:Sparkles,anchors:[]}]},
    {id:'system',label:'系统',items:[]}];
function Probe(){const ref=useRef<HTMLDivElement>(null);useNativeSettingsPage(ref,false,()=>{},()=>{},groups,()=>{},()=>{});return h('div',{ref})}
beforeEach(()=>{vi.clearAllMocks();state.change.mockResolvedValue(true);state.refresh.mockResolvedValue(undefined);
    state.snapshot={enabled:true,returnedToSystem:true,rearDisplayId:1,backendMode:'lsp',lspConnected:true,build:12};
    host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(()=>{act(()=>root.unmount());host.remove()});
it('uses translated system status and keeps the original rear controls in one group',async()=>{
    await act(async()=>root.render(h(Probe)));
    const rear=state.model.sections.find((section:any)=>section.id==='rear');
    expect(rear.items.find((item:any)=>item.id==='state').subtitle).toBe(zh.rearBridge.system);
    expect(rear.items.map((item:any)=>item.id)).toEqual(['toggle','adaptation','state','mode','switchHint','backendHelp','guide']);
    expect(rear.image).toContain('xiaomi-backscreen-decoration');
    expect(JSON.stringify(state.model)).not.toContain('mobileSettings.rearState.system');
    expect(state.model.sections.find((section:any)=>section.id==='system').items[0].id).toBe('about');
    expect(state.model.sections.some((section:any)=>section.id==='about')).toBe(false);
});
it('retains backend selection and refuses a switch while rear lyrics are enabled',async()=>{
    await act(async()=>root.render(h(Probe)));
    await act(async()=>state.actions['backend:shizuku']({}));expect(state.change).not.toHaveBeenCalled();
    state.snapshot={...state.snapshot,enabled:false,returnedToSystem:false};
    await act(async()=>root.render(h(Probe)));
    await act(async()=>state.actions['backend:shizuku']({}));
    expect(state.change).toHaveBeenCalledWith('shizuku');expect(state.refresh).toHaveBeenCalled();
});
