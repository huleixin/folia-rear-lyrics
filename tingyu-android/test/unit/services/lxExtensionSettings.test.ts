// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@/components/shared/useLiquidReduced',()=>({useLiquidReduced:()=>true}));
import SourceExtensionSettings from '@/components/modal/settings/SourceExtensionSettings';
import LxRiskDialog, { LX_RISK_BODY } from '@/components/audio-tools/LxRiskDialog';
import { useLxSourceStore as store } from '@/stores/useLxSourceStore';
import { useSettingsModalStore } from '@/stores/useSettingsModalStore';
import { captureSemanticSettings } from '@/services/nativeSettingsSemantic';

// test/unit/services/lxExtensionSettings.test.ts
it.each([true,false])('keeps management deep, projects unchecked consent to Compose, and blocks stale Continue',async(isDaylight)=>{
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('PointerEvent',MouseEvent);
    store.setState({extensionEnabled:false,riskAccepted:false,scripts:[],activeId:null,consent:null});
    useSettingsModalStore.setState({settingsModalState:{isOpen:true,initialTab:'options'}});
    const host=document.createElement('main');document.body.append(host);const root=createRoot(host);
    await act(async()=>root.render(h('div',null,h(SourceExtensionSettings),h(LxRiskDialog,{isDaylight}))));
    const click=async(label:string)=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label)!;expect(button).toBeTruthy();await act(async()=>button.click());};
    try{
        expect(host.textContent).toBe('高级扩展');await click('高级扩展');await click('实验性功能');
        expect(document.body.textContent).not.toContain('管理第三方音源');
        await act(async()=>document.querySelector<HTMLButtonElement>('[role=switch]')!.click());
        const captured=captureSemanticSettings(host,'integration','音源与系统歌词'),modal=captured.document.flow!.modal!;
        expect(modal.title).toBe('实验性功能提醒');expect(document.body.textContent).toContain(LX_RISK_BODY);
        const checkbox=modal.nodes.find(n=>n.kind==='checkbox')!,next=modal.nodes.find(n=>n.title==='继续')!;
        expect(checkbox.value).toBe('0');expect(next.disabled).toBe(true);
        await act(async()=>captured.actions['act:'+next.id]?.({}));expect(store.getState().extensionEnabled).toBe(false);
        await act(async()=>captured.actions['set:'+checkbox.id]?.({text:'1'}));
        const accepted=captureSemanticSettings(host,'integration','音源与系统歌词');
        expect(accepted.document.flow!.modal!.nodes.find(n=>n.title==='继续')!.disabled).toBe(false);
        await act(async()=>accepted.actions['act:'+next.id]?.({}));
        expect(store.getState().extensionEnabled).toBe(true);expect(document.body.textContent).toContain('管理第三方音源');
    }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
