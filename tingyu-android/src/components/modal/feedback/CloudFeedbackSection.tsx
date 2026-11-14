import React from 'react';
import type {CloudFeedbackFlow} from './useCloudFeedbackFlow';

// src/components/modal/feedback/CloudFeedbackSection.tsx
// Native semantic confirmation: readable summary first; full upload contents on demand.
export default function CloudFeedbackSection({flow}:{flow:CloudFeedbackFlow}){
  const {copy,preview,busy}=flow;
  const [details,setDetails]=React.useState(false),[historyOpen,setHistoryOpen]=React.useState(false);
  const pending=flow.history.filter(r=>!r.feedbackId);
  React.useEffect(()=>setDetails(false),[preview?.localId]);
  const payload=React.useMemo(()=>{try{return preview?JSON.parse(preview.preview):null;}catch{return null;}},[preview]);
  return <section data-testid="feedback-cloud" data-settings-layout="column" data-settings-style='{"gap":10}'>
    {preview?<>
      <h3>{copy('reviewTitle')}</h3>
      <p className="whitespace-pre-wrap">{payload?.description}</p>
      {payload?.steps&&<p className="whitespace-pre-wrap">{payload.steps}</p>}
      <p data-settings-style='{"font":11,"tone":"muted"}'>{copy('size')}: {(preview.bytes/1024).toFixed(1)} KB · {copy(payload?.diagnostics?'withLog':'withoutLog')}</p>
      <button type="button" disabled={busy} onClick={()=>setDetails(v=>!v)}>{copy(details?'hideDetails':'details')}</button>
      {details&&<pre data-testid="cloud-preview" data-settings-layout="column" data-settings-style='{"font":11,"maxHeight":260,"scroll":true,"fill":true,"padding":[8,8,8,8]}' className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{preview.preview}</pre>}
      <div data-settings-layout="row" data-settings-style='{"gap":10,"align":"start"}'>
        <button type="button" role="switch" aria-checked={flow.consent} aria-label={copy('consent')} disabled={busy} onClick={()=>flow.setConsent(v=>!v)}/>
        <p data-settings-style='{"font":11,"grow":true}'>{copy('consent')}</p>
      </div>
      <button type="button" disabled={busy} onClick={flow.cancel}>{copy('cancel')}</button>
    </>:<>
      <label data-settings-layout="column" data-settings-style='{"gap":8}'>{copy('steps')}<textarea aria-label={copy('steps')} value={flow.steps} maxLength={2000} rows={2} onChange={e=>flow.setSteps(e.target.value)} data-settings-style='{"minHeight":64,"font":14}' className="w-full rounded-xl border border-current/20 bg-transparent p-3"/></label>
      <p data-settings-style='{"font":11,"tone":"muted"}'>{copy('privacy')}</p>
    </>}
    {flow.message&&<p role="status" aria-live="polite">{flow.message}</p>}
    {!preview&&flow.submittedId&&<>
      <p className="break-words">{flow.submittedId}</p>
      <button type="button" onClick={()=>void flow.copyId(flow.submittedId!)}>{copy('copy')}</button>
    </>}
    {flow.failure&&<button type="button" onClick={()=>void flow.copyError(flow.failure!)}>{copy('copyError')}</button>}
    {!preview&&pending.length>0&&<button type="button" disabled={busy} onClick={()=>setHistoryOpen(v=>!v)}>{copy('drafts')}</button>}
    {!preview&&historyOpen&&pending.map(r=><article key={r.localId} data-settings-layout="column" data-settings-style='{"gap":6,"border":true,"radius":12,"padding":[10,10,10,10]}'>
      <p>{new Date(r.at).toLocaleString()} · {copy('statuses.'+r.status)}</p>
      <div data-settings-layout="wrap" data-settings-style='{"gap":8}'>
        <button type="button" disabled={busy} onClick={()=>void flow.prepare(r.localId)}>{copy('retry')}</button>
        <button type="button" disabled={busy} onClick={()=>void flow.remove(r.localId)}>{copy('remove')}</button>
        {r.lastError&&<button type="button" onClick={()=>void flow.copyError(r.lastError!)}>{copy('copyError')}</button>}
      </div>
    </article>)}
  </section>;
}

export function CloudFeedbackSubmit({flow,disabled=false,style}:{flow:CloudFeedbackFlow;disabled?:boolean;style?:React.CSSProperties}){
  return <button type="button" data-testid="feedback-submit-button" data-settings-style='{"fill":true,"tone":"primary","radius":12,"padding":[12,16,12,16],"center":true,"font":14,"weight":600,"minHeight":48}'
    className="w-full rounded-xl px-4 py-3 font-semibold disabled:opacity-50" style={style}
    disabled={disabled||flow.busy||!!flow.preview&&!flow.consent} onClick={()=>void (flow.preview?flow.send():flow.prepare())}>
    {flow.copy(flow.busy?'working':flow.preview?'send':'prepare')}
  </button>;
}
