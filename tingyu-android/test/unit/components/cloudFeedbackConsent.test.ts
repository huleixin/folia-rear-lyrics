// @vitest-environment jsdom
import React,{act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {captureSemanticSettings} from '@/services/nativeSettingsSemantic';

// Consent regression through the actual React form and Compose semantic action projection.
const mocks=vi.hoisted(()=>({prepare:vi.fn(),call:vi.fn()}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(s:string)=>s})}));
vi.mock('@/services/feedback/client',()=>({prepareCloudFeedback:mocks.prepare,cloudCall:mocks.call}));
vi.mock('@/services/nativePages',()=>({absolutePageImage:(s:string)=>s}));
import CloudFeedbackSection from '@/components/modal/feedback/CloudFeedbackSection';
vi.stubGlobal('PointerEvent',MouseEvent);

it('requires fresh consent for every preview and projects native actions without DOM geometry',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  mocks.call.mockImplementation(async(action:string)=>action==='history'?[]:{id:'TY-test'});
  mocks.prepare.mockResolvedValue({localId:'draft',preview:'{"diagnostics":null}',bytes:20});
  const host=document.createElement('main');document.body.append(host);const root=createRoot(host);
  const draft={category:'playback',description:'Failure',includeDiagnostics:false,screenshots:[]};
  const render=async(d=draft)=>act(async()=>root.render(h(CloudFeedbackSection,{draft:d as any})));
  const click=async(label:string)=>act(async()=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===label);expect(b).toBeTruthy();b!.click();});
  try{
    await render();await click('feedbackCloud.prepare');
    let captured=captureSemanticSettings(host,'help','Feedback');
    const send=captured.document.flow!.nodes.find(n=>n.title==='feedbackCloud.send')!;
    expect(send.disabled).toBe(true);expect(mocks.call.mock.calls.some(([a])=>a==='send')).toBe(false);
    const consent=captured.document.flow!.nodes.find(n=>n.title==='feedbackCloud.consent')!;
    await act(async()=>{captured.actions['set:'+consent.id]?.({text:'1'});});
    captured=captureSemanticSettings(host,'help','Feedback');expect(captured.document.flow!.nodes.find(n=>n.title==='feedbackCloud.send')?.disabled).toBe(false);
    await render({...draft,description:'Changed'});expect(host.querySelector('[data-testid=cloud-preview]')).toBeNull();
    await click('feedbackCloud.prepare');expect(host.querySelector<HTMLButtonElement>('button[role=switch]')!.getAttribute('aria-checked')).toBe('false');
    await click('feedbackCloud.consent');await click('feedbackCloud.send');expect(mocks.call).toHaveBeenCalledWith('send',{localId:'draft'},expect.any(Function));
  }finally{await act(async()=>root.unmount());host.remove();}
});
