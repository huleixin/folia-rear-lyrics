import React from 'react';
import {useTranslation} from 'react-i18next';
import {cloudCall,prepareCloudFeedback,type CloudPreview,type CloudHistory} from '../../../services/feedback/client';
import type {FeedbackDraft} from '../../../services/diagnostics/diagnosticPackage';

// src/components/modal/feedback/CloudFeedbackSection.tsx: semantic form projected into existing Compose settings.
export default function CloudFeedbackSection({draft}:{draft:FeedbackDraft}){
  const {t}=useTranslation();const copy=(key:string)=>t('feedbackCloud.'+key);
  const [steps,setSteps]=React.useState(''),[preview,setPreview]=React.useState<CloudPreview|null>(null);
  const [consent,setConsent]=React.useState(false),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');
  const [history,setHistory]=React.useState<CloudHistory[]>([]),[uploading,setUploading]=React.useState<string|null>(null);
  const refresh=React.useCallback(async()=>setHistory(await cloudCall<CloudHistory[]>('history')),[]);
  React.useEffect(()=>{void refresh().catch(()=>setMessage(copy('failed')));},[refresh]);
  const signature=JSON.stringify([draft.category,draft.description,draft.includeDiagnostics,steps]);
  React.useEffect(()=>{setPreview(null);setConsent(false);},[signature]);
  async function prepare(localId?:string){setBusy(true);setMessage('');setConsent(false);try{setPreview(localId?await cloudCall<CloudPreview>('preview',{localId}):await prepareCloudFeedback({...draft,steps}));await refresh();}catch{setMessage(copy('previewFailed'));}finally{setBusy(false);}}
  async function send(){if(!preview||!consent||busy)return;setBusy(true);setUploading(preview.localId);setMessage(copy('challenge'));
    try{const r=await cloudCall<{id:string}>('send',{localId:preview.localId},u=>setMessage(u.phase==='challenge'?copy('challenge'):copy('upload')+' '+(u.progress??0)+'%'));
      setMessage(copy('success')+' · '+r.id);setPreview(null);setConsent(false);
    }catch(e){const code=e instanceof Error?e.message:'';setMessage(code==='uploads_paused'?copy('paused'):['rate_limit','daily_capacity','storage_capacity'].includes(code)?copy('rate'):copy('failed'));}
    finally{await refresh().catch(()=>undefined);setBusy(false);setUploading(null);}}
  const actionStyle={border:'1px solid currentColor',borderRadius:12,padding:'10px 12px'};
  return <section data-testid="feedback-cloud" data-settings-layout="column" data-settings-style='{"gap":10,"radius":16,"border":true,"padding":[12,12,12,12]}'>
    <h3>{copy('title')}</h3><p data-settings-style='{"font":11,"tone":"muted"}'>{copy('privacy')}</p>
    <label>{copy('steps')}<textarea aria-label={copy('steps')} value={steps} maxLength={2000} rows={3} onChange={e=>setSteps(e.target.value)} className="w-full rounded-xl border border-current/20 bg-transparent p-3"/></label>
    <button type="button" style={actionStyle} disabled={busy||!draft.description.trim()} onClick={()=>void prepare()}>{copy('prepare')}</button>
    {preview&&<div data-settings-layout="column" data-settings-style='{"gap":8}'>
      <p>{copy('size')}: {preview.bytes} B</p>
      <pre data-testid="cloud-preview" data-settings-layout="column" data-settings-style='{"font":11,"maxHeight":260,"scroll":true,"fill":true,"padding":[8,8,8,8]}' className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{preview.preview}</pre>
      <button type="button" role="switch" aria-checked={consent} aria-label={copy('consent')} disabled={busy} onClick={()=>setConsent(v=>!v)}>{consent?'✓ ':''}{copy('consent')}</button>
      <button type="button" disabled={!consent||busy} style={actionStyle} onClick={()=>void send()}>{copy('send')}</button>
      <button type="button" disabled={busy} onClick={()=>{setPreview(null);setConsent(false);}}>{copy('cancel')}</button>
    </div>}
    {message&&<p role="status" aria-live="polite">{message}</p>}
    <h4>{copy('history')}</h4>
    {history.map(r=><article key={r.localId} data-settings-layout="column" data-settings-style='{"gap":6,"border":true,"radius":12,"padding":[10,10,10,10]}'>
      <p>{new Date(r.at).toLocaleString()} · {copy('statuses.'+r.status)}</p><p>{r.feedbackId??copy('pending')}</p>
      <div data-settings-layout="wrap" data-settings-style='{"gap":8}'>
        {r.feedbackId?<><button type="button" onClick={()=>void navigator.clipboard.writeText(r.feedbackId!).then(()=>setMessage(copy('copy'))).catch(()=>setMessage(copy('failed')))}>{copy('copy')}</button>
          <button type="button" disabled={busy} onClick={()=>{setBusy(true);void cloudCall('status',{localId:r.localId}).then(refresh).catch(()=>setMessage(copy('failed'))).finally(()=>setBusy(false));}}>{copy('refresh')}</button></>:
          <button type="button" disabled={busy} onClick={()=>void prepare(r.localId)}>{copy('retry')}</button>}
        <button type="button" disabled={busy||uploading===r.localId} onClick={()=>void cloudCall('delete',{localId:r.localId}).then(refresh).catch(()=>setMessage(copy('failed')))}>{copy('remove')}</button>
      </div>
    </article>)}
  </section>;
}
