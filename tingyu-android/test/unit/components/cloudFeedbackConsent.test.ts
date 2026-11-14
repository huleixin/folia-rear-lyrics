// @vitest-environment jsdom
import React,{act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi,beforeEach} from 'vitest';
import {captureSemanticSettings} from '@/services/nativeSettingsSemantic';

// Consent regression through the actual React form and Compose semantic action projection.
const mocks=vi.hoisted(()=>({prepare:vi.fn(),call:vi.fn()}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(s:string)=>s})}));
vi.mock('@/services/feedback/client',()=>({prepareCloudFeedback:mocks.prepare,cloudCall:mocks.call}));
vi.mock('@/services/nativePages',()=>({absolutePageImage:(s:string)=>s}));
import CloudFeedbackSection,{CloudFeedbackSubmit} from '@/components/modal/feedback/CloudFeedbackSection';
import {useCloudFeedbackFlow} from '@/components/modal/feedback/useCloudFeedbackFlow';
vi.stubGlobal('PointerEvent',MouseEvent);
beforeEach(()=>vi.clearAllMocks());
function Form({draft}:{draft:any}){const flow=useCloudFeedbackFlow(draft);return h('div',null,h(CloudFeedbackSection,{flow}),h(CloudFeedbackSubmit,{flow}));}

it('requires fresh consent for every preview and projects native actions without DOM geometry',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  mocks.call.mockImplementation(async(action:string)=>action==='history'?[]:{id:'TY-test'});
  mocks.prepare.mockResolvedValue({localId:'draft',preview:'{"description":"Failure","diagnostics":null}',bytes:50});
  const host=document.createElement('main');document.body.append(host);const root=createRoot(host);
  const draft={category:'playback',description:'Failure',includeDiagnostics:false,screenshots:[]};
  const render=async(d=draft)=>act(async()=>root.render(h(Form,{draft:d})));
  const click=async(label:string)=>act(async()=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===label||b.getAttribute('aria-label')===label);expect(b).toBeTruthy();b!.click();});
  try{
    await render();expect(mocks.prepare).not.toHaveBeenCalled();await click('feedbackCloud.prepare');
    expect(host.querySelector('[data-testid=cloud-preview]')).toBeNull();await click('feedbackCloud.details');
    expect(host.querySelector('[data-testid=cloud-preview]')).not.toBeNull();
    let captured=captureSemanticSettings(host,'help','Feedback');
    const send=captured.document.flow!.nodes.find(n=>n.title==='feedbackCloud.send')!;
    expect(send.disabled).toBe(true);expect(mocks.call.mock.calls.some(([a])=>a==='send')).toBe(false);
    const consent=captured.document.flow!.nodes.find(n=>n.title==='feedbackCloud.consent')!;
    await act(async()=>{captured.actions['set:'+consent.id]?.({text:'1'});});
    captured=captureSemanticSettings(host,'help','Feedback');expect(captured.document.flow!.nodes.find(n=>n.title==='feedbackCloud.send')?.disabled).toBe(false);
    await render({...draft,description:'Changed'});expect(host.querySelector('[data-testid=cloud-preview]')).toBeNull();
    await click('feedbackCloud.prepare');expect(host.querySelector<HTMLButtonElement>('button[role=switch]')!.getAttribute('aria-checked')).toBe('false');
    await click('feedbackCloud.consent');await click('feedbackCloud.send');expect(mocks.call).toHaveBeenCalledWith('send',{localId:'draft'},expect.any(Function));
    expect(host.textContent).toContain('TY-test');
    captured=captureSemanticSettings(host,'help','Feedback');
    expect(captured.document.flow!.nodes.some(n=>n.title==='feedbackCloud.copy'&&n.kind==='action')).toBe(true);
    expect(host.textContent).not.toContain('feedbackCloud.drafts');
  }finally{await act(async()=>root.unmount());host.remove();}
});

it('keeps failed drafts retryable with fresh consent while hiding submitted history',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  const records=[
    {localId:'accepted',at:1,category:'other',status:'pending',feedbackId:'TY-previous'},
    {localId:'unsent',at:2,category:'playback',status:'retry'}
  ];
  mocks.call.mockImplementation(async(action:string)=>action==='history'?records:{localId:'unsent',preview:'{"description":"Saved failure","diagnostics":null}',bytes:50});
  const host=document.createElement('main');document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(h(Form,{draft:{category:'other',description:'',includeDiagnostics:false,screenshots:[]}})));
    const drafts=[...host.querySelectorAll('button')].find(b=>b.textContent==='feedbackCloud.drafts')!;
    await act(async()=>drafts.click());
    expect(host.querySelectorAll('article')).toHaveLength(1);
    expect(host.textContent).not.toContain('TY-previous');
    let captured=captureSemanticSettings(host,'help','Feedback');
    const retry=captured.document.flow!.nodes.find(n=>n.title==='feedbackCloud.retry')!;
    await act(async()=>{captured.actions['act:'+retry.id]?.({});});
    expect(mocks.call).toHaveBeenCalledWith('preview',{localId:'unsent'});
    captured=captureSemanticSettings(host,'help','Feedback');
    expect(captured.document.flow!.nodes.find(n=>n.title==='feedbackCloud.send')?.disabled).toBe(true);
    expect(mocks.call.mock.calls.some(([action])=>action==='send')).toBe(false);
  }finally{await act(async()=>root.unmount());host.remove();}
});

it('explains an empty description and never prepares or uploads it',async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  mocks.call.mockResolvedValue([]);
  const host=document.createElement('main');document.body.append(host);const root=createRoot(host);
  try{
    await act(async()=>root.render(h(Form,{draft:{category:'other',description:' ',includeDiagnostics:false,screenshots:[]}})));
    const primary=host.querySelector<HTMLButtonElement>('[data-testid=feedback-submit-button]')!;
    expect(primary.disabled).toBe(false);await act(async()=>primary.click());
    expect(host.textContent).toContain('feedbackCloud.descriptionRequired');expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.call.mock.calls.some(([a])=>a==='send')).toBe(false);
  }finally{await act(async()=>root.unmount());host.remove();}
});
