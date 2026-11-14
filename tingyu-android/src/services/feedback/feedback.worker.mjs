import {sanitizeFeedback,validateFeedback,MAX_LOG_BYTES} from './schema.mjs';
import CryptoJS from 'crypto-js/core';
import 'crypto-js/sha256';

// src/services/feedback/feedback.worker.mjs: bounded preparation/storage/upload away from UI thread.
const API='https://tingyu-feedback-api.2473297053.workers.dev';
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
let dbPromise;
let activeSend=false;
function db(){return dbPromise??=new Promise((resolve,reject)=>{const r=indexedDB.open('tingyu-cloud-feedback',1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'localId'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('local_storage_failed'));});}
async function records(){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('records','readonly'),r=t.objectStore('records').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('local_storage_failed'));});}
async function write(row,remove=false,insert=false){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('records','readwrite'),s=t.objectStore('records');let full=false;
  if(remove)s.delete(row.localId);else if(insert){const count=s.count();count.onsuccess=()=>{if(count.result>=20){full=true;t.abort();}else s.add(row);};}else s.put(row);
  t.oncomplete=resolve;t.onerror=()=>reject(Error('local_storage_failed'));t.onabort=()=>reject(Error(full?'history_full':'local_storage_failed'));});}
async function prune(){for(const r of await records())if(r.at<Date.now()-30*86400000)await write(r,true);}
async function request(path,options={}){const c=new AbortController(),timer=setTimeout(()=>c.abort(),45000);try{const r=await fetch(API+path,{...options,signal:c.signal});const d=await r.json();if(!r.ok)throw Error(d.error??'network_failed');return d;}finally{clearTimeout(timer);}}
async function solve(challenge){if(!Number.isInteger(challenge.bits)||challenge.bits<16||challenge.bits>22||typeof challenge.token!=='string'||challenge.token.length>2048)throw Error('invalid_challenge');
  const started=Date.now(),prefix=CryptoJS.algo.SHA256.create().update(challenge.token+':');
  // Reuse the hashed prefix and inspect digest bits directly; yield most of the time to playback.
  let slice=Date.now();for(let n=0;n<8000000;n++){const h=prefix.clone().finalize(String(n));if((h.words[0]>>>(32-challenge.bits))===0)return String(n);
    if(n%32===0&&Date.now()-slice>=2){if(Date.now()-started>90000)throw Error('challenge_timeout');await new Promise(resolve=>setTimeout(resolve,6));slice=Date.now();}}
  throw Error('challenge_timeout');}
function upload(row,proof,challenge,id){return new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST',API+'/api/feedback');x.timeout=60000;
  for(const [k,v]of Object.entries({'Content-Type':'application/json','Idempotency-Key':row.localId,'X-Feedback-Status-Token':row.capability,'X-Feedback-Challenge':challenge,'X-Feedback-Proof':proof}))x.setRequestHeader(k,v);
  let last=0;x.upload.onprogress=e=>{const now=Date.now();if(now-last<250&&e.loaded!==e.total)return;last=now;self.postMessage({id,progress:e.lengthComputable?Math.round(e.loaded/e.total*100):0});};
  x.onerror=x.ontimeout=()=>reject(Error('network_failed'));x.onload=()=>{try{const d=JSON.parse(x.responseText);if(x.status>=200&&x.status<300)resolve(d);else reject(Error(d.error??'upload_failed'));}catch{reject(Error('upload_failed'));}};x.send(row.body);});}
self.onmessage=async ({data:{id,action,input}})=>{let sending=false;try{
  let value;
  if(action==='prepare'){
    const native=(input.nativeEvents??'').split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
    const frontend=(input.frontendEvents??'').split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
    const events=[...native,...frontend,...(input.events??[])].sort((a,b)=>a.t-b.t);
    const seen=new Set();const unique=events.filter(e=>{const k=JSON.stringify(e);if(seen.has(k))return false;seen.add(k);return true;});
    let nativeCrashes=[];try{nativeCrashes=JSON.parse(input.nativeCrashes??'[]');}catch{}
    const crashes=[...nativeCrashes,...(input.crashes??[])].map(c=>({...c,at:typeof c.at==='string'?Date.parse(c.at):c.at,commit:String(c.commit??'').split('@').at(-1).replace(/-dirty$/,'')}));
    const payload=validateFeedback(sanitizeFeedback({...input,diagnostics:input.includeDiagnostics?{events:unique,crashes,performance:input.performance??{}}:null}));
    const body=JSON.stringify(payload);if(new TextEncoder().encode(body).length>MAX_LOG_BYTES+32768)throw Error('log_too_large');
    const r={localId:random(),capability:random(),at:Date.now(),body,status:'draft',category:payload.category};
    await prune();await write(r,false,true);
    value={localId:r.localId,preview:JSON.stringify(payload,null,2),bytes:new TextEncoder().encode(body).length};
  }else if(action==='history'){await prune();value=(await records()).sort((a,b)=>b.at-a.at).map(({body,capability,...r})=>r);
  }else if(action==='preview'){const r=(await records()).find(r=>r.localId===input.localId);if(!r)throw Error('draft_missing');value={localId:r.localId,preview:JSON.stringify(JSON.parse(r.body),null,2),bytes:new TextEncoder().encode(r.body).length};
  }else if(action==='delete'){const r=(await records()).find(r=>r.localId===input.localId);if(r)await write(r,true);value=true;
  }else if(action==='send'){
    if(activeSend)throw Error('upload_in_progress');activeSend=true;sending=true;
    const r=(await records()).find(r=>r.localId===input.localId);if(!r)throw Error('draft_missing');if(r.feedbackId)throw Error('already_submitted');
    self.postMessage({id,phase:'challenge'});const c=await request('/api/feedback/challenge');const p=await solve(c);self.postMessage({id,phase:'upload'});
    try{const response=await upload(r,p,c.token,id);r.feedbackId=response.id;r.status=response.status;r.body='';await write(r);value={id:r.feedbackId,status:r.status};}
    catch(e){r.status='retry';await write(r);throw e;}
  }else if(action==='status'){const r=(await records()).find(r=>r.localId===input.localId);if(!r?.feedbackId)throw Error('draft_missing');
    const s=await request('/api/feedback/status?id='+encodeURIComponent(r.feedbackId),{headers:{'X-Feedback-Status-Token':r.capability}});r.status=s.status;await write(r);value=s;
  }else throw Error('unknown_action');
  self.postMessage({id,value});
}catch(error){self.postMessage({id,error:error?.message??'request_failed'});}finally{if(sending)activeSend=false;}};
