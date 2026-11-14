import React from 'react';
import {useTranslation} from 'react-i18next';
import {cloudCall,prepareCloudFeedback,type CloudPreview,type CloudHistory,type CloudFailure} from '../../../services/feedback/client';
import type {FeedbackDraft} from '../../../services/diagnostics/diagnosticPackage';

// src/components/modal/feedback/useCloudFeedbackFlow.ts
// Shared feedback state keeps the footer action and native confirmation form in sync.
export function useCloudFeedbackFlow(draft:FeedbackDraft){
  const {t}=useTranslation();const copy=(key:string)=>t('feedbackCloud.'+key);
  const [steps,setSteps]=React.useState(''),[preview,setPreview]=React.useState<CloudPreview|null>(null);
  const [consent,setConsent]=React.useState(false),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('');
  const [history,setHistory]=React.useState<CloudHistory[]>([]);
  const [failure,setFailure]=React.useState<CloudFailure|null>(null);
  const refresh=React.useCallback(async()=>setHistory(await cloudCall<CloudHistory[]>('history')),[]);
  React.useEffect(()=>{void refresh().catch(()=>setMessage(copy('historyFailed')));},[refresh]);
  const signature=JSON.stringify([draft.category,draft.description,draft.includeDiagnostics,steps]);
  React.useEffect(()=>{setPreview(null);setConsent(false);},[signature]);
  async function prepare(localId?:string){
    if(busy)return;
    if(!localId&&!draft.description.trim()){setMessage(copy('descriptionRequired'));return;}
    setBusy(true);setMessage('');setFailure(null);setConsent(false);
    try{setPreview(localId?await cloudCall<CloudPreview>('preview',{localId}):await prepareCloudFeedback({...draft,steps}));await refresh();}
    catch{setMessage(copy('previewFailed'));}finally{setBusy(false);}
  }
  // Only this explicit, freshly consented action can send a prepared local draft.
  async function send(){if(!preview||!consent||busy)return;setBusy(true);setMessage(copy('challenge'));
    setFailure(null);
    try{const r=await cloudCall<{id:string}>('send',{localId:preview.localId},u=>setMessage(u.phase==='challenge'?copy('challenge'):u.phase==='awaiting'?copy('awaiting'):u.phase==='retry'?copy('retrying'):copy('upload')+' '+(u.progress??0)+'%'));
      setMessage(copy('success')+' · '+r.id);setPreview(null);setConsent(false);
    }catch(e){const code=e instanceof Error?e.message:'';setFailure((e as Error&{report?:CloudFailure}).report??null);setMessage(code==='uploads_paused'?copy('paused'):['rate_limit','daily_capacity','storage_capacity'].includes(code)?copy('rate'):copy('failed'));}
    finally{await refresh().catch(()=>undefined);setBusy(false);}
  }
  async function status(localId:string){if(busy)return;setBusy(true);try{await cloudCall('status',{localId});await refresh();}catch{setMessage(copy('historyFailed'));}finally{setBusy(false);}}
  async function remove(localId:string){if(busy)return;try{await cloudCall('delete',{localId});await refresh();}catch{setMessage(copy('historyFailed'));}}
  async function copyId(id:string){try{await navigator.clipboard.writeText(id);setMessage(copy('copied'));}catch{setMessage(copy('copyFailed'));}}
  async function copyError(report:CloudFailure){try{await navigator.clipboard.writeText(JSON.stringify(report,null,2));setMessage(copy('errorCopied'));}catch{setMessage(copy('copyFailed'));}}
  const cancel=()=>{if(!busy){setPreview(null);setConsent(false);setMessage('');}};
  return {copy,steps,setSteps,preview,consent,setConsent,busy,message,history,failure,prepare,send,status,remove,copyId,copyError,cancel};
}
export type CloudFeedbackFlow=ReturnType<typeof useCloudFeedbackFlow>;
