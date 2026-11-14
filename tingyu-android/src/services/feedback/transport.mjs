// Fixed HTTPS endpoints; response facts contain no payload, query, capability or raw exception.
const codes=new Set("uploads_paused rate_limit daily_capacity storage_capacity proof_required invalid_capability invalid_category unsafe_or_unknown_fields description_required log_too_large body_too_large json_only_archives_rejected empty_body invalid_json idempotency_conflict feedback_expired submission_in_progress submission_conflict_retry challenge_used storage_retry d1_unavailable r2_unavailable request_failed not_found service_not_configured".split(" "));
export const safeCode=value=>codes.has(value)?value:"request_failed";
export function failure(code,facts){
  const errorType=['network_failed','request_timeout'].includes(code)?'network':facts.httpStatus>=500?'server':facts.httpStatus>=400?'validation':'protocol';
  return Object.assign(Error(code),{details:{...facts,code,errorType}});
}
const identifier=value=>typeof value==="string"&&/^[a-f0-9-]{16,64}(?:-[A-Z]{3})?$/i.test(value)?value:"";
const stages=new Set(['admission','proof','validation','fingerprint','reconcile','reserve','storage','finalize']);
function responseFacts(api,stage,start,bytes,status,header){const serverStage=header("X-Feedback-Stage");return {time:new Date(start).toISOString(),host:new URL(api).hostname,stage,bytes,httpStatus:status,elapsedMs:Date.now()-start,ray:identifier(header("CF-Ray")),requestId:identifier(header("X-Feedback-Request-ID")),serverStage:stages.has(serverStage)?serverStage:""};}
export async function request(api,path,options={}){
  const start=Date.now(),stage=path.includes("challenge")?"challenge":"status",c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);
  try{
    let r;try{r=await fetch(api+path,{...options,credentials:"omit",redirect:"error",signal:c.signal});}
    catch{throw failure(c.signal.aborted?"request_timeout":"network_failed",responseFacts(api,stage,start,0,0,()=>null));}
    const facts=responseFacts(api,stage,start,0,r.status,k=>r.headers.get(k));
    let d;try{const raw=await r.text();if(raw.length>16384)throw Error();d=JSON.parse(raw);}catch{throw failure(c.signal.aborted?"request_timeout":r.status>=500?"gateway_failed":"response_invalid",{...facts,elapsedMs:Date.now()-start});}
    if(!r.ok)throw failure(safeCode(d.error),facts);return d;
  }finally{clearTimeout(timer);}
}
export function upload(api,row,proof,challenge,id){return new Promise((resolve,reject)=>{
  const start=Date.now(),bytes=new TextEncoder().encode(row.body).length,x=new XMLHttpRequest();x.open("POST",api+"/api/feedback");x.timeout=60000;x.withCredentials=false;
  for(const [k,v]of Object.entries({"Content-Type":"application/json","Idempotency-Key":row.localId,"X-Feedback-Status-Token":row.capability,"X-Feedback-Challenge":challenge,"X-Feedback-Proof":proof}))x.setRequestHeader(k,v);
  const facts=()=>responseFacts(api,"upload",start,bytes,x.status,k=>x.getResponseHeader(k));
  let last=0;x.upload.onprogress=e=>{const now=Date.now();if(now-last<250&&e.loaded!==e.total)return;last=now;self.postMessage({id,progress:e.lengthComputable?Math.min(90,Math.round(e.loaded/e.total*90)):0});};
  x.upload.onload=()=>self.postMessage({id,phase:"awaiting",progress:90});
  x.onerror=()=>reject(failure("network_failed",facts()));x.ontimeout=()=>reject(failure("request_timeout",facts()));
  x.onload=()=>{
    const f=facts();let d;try{if(x.responseText.length>16384)throw Error();d=JSON.parse(x.responseText);}catch{reject(failure(x.status>=500?"gateway_failed":"response_invalid",f));return;}
    if(x.status<200||x.status>=300){reject(failure(safeCode(d.error),f));return;}
    if(!/^TY-[a-f0-9-]{36}$/.test(d.id??"")||!['pending','investigating','verification','fixed','unreproduced','closed'].includes(d.status)){reject(failure("response_invalid",f));return;}
    resolve(d);
  };x.send(row.body);
});}
