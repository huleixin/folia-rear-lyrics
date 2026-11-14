import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {fixture} from './harness.mjs';
import {PRIMARY_API,BACKUP_API} from '../../src/services/feedback/endpoints.mjs';

// Test the compiled APK worker, including actual IndexedDB, XHR and proof computation.
const asset=(await readdir(new URL('../../dist/assets/',import.meta.url))).find(n=>/^feedback\.worker-.*\.js$/.test(n));
assert.ok(asset,'Build capacitor assets first');
const body=await readFile(new URL('../../dist/assets/'+asset,import.meta.url));
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/worker.js'?'text/javascript':'text/html');res.end(req.url==='/worker.js'?body:'<!doctype html><title>Feedback worker test</title>');});
await new Promise(r=>server.listen(8791,'127.0.0.1',r));
let browser;const f=fixture();let calls=0,posts=0,interrupt=true,mode='normal';const origins=[],uploads=[];
try{
  browser=await chromium.launch({headless:true});const context=await browser.newContext();
  await context.route(url=>[PRIMARY_API,BACKUP_API].includes(url.origin),async route=>{
    calls++;const request=route.request(),url=new URL(request.url());
    origins.push(url.origin);
    if(mode==='offline'||(mode==='status-fallback'&&url.origin===PRIMARY_API)){await route.abort('connectionreset');return;}
    if(mode==='paused'){await route.fulfill({status:503,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({error:'uploads_paused'})});return;}
    const response=await f.call(url.pathname+url.search,{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})});
    if(request.method()==='POST'){posts++;uploads.push({origin:url.origin,body:request.postData(),key:request.headers()['idempotency-key'],cap:request.headers()['x-feedback-status-token']});if(interrupt||mode==='lost-responses'){interrupt=false;await route.abort('connectionreset');return;}}
    await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:Buffer.from(await response.arrayBuffer())});
  });
  const page=await context.newPage();await page.goto('http://127.0.0.1:8791');
  await page.evaluate(()=>{
    const worker=new Worker('/worker.js',{type:'module'}),pending=new Map();let sequence=0;
    window.feedbackCall=(action,input={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,action,input});});
    worker.onmessage=({data})=>{if(data.phase||data.progress!==undefined)return;const p=pending.get(data.id);pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.value);};
    worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message));pending.clear();};
    window.ticks=0;setInterval(()=>window.ticks++,20);
  });
  const input={category:'playback',description:'Network recovery test',steps:'Press play',includeDiagnostics:true,metadata:{version:'1.5.40',commit:'fe7cf399',buildDirty:true},events:[{t:Date.now(),m:'audio',l:'error',e:'load-error',f:{errorCode:42,url:'https://private.invalid?token=secret',cookie:'private'}}]};
  const preview=await page.evaluate(input=>window.feedbackCall('prepare',input),input);
  assert.equal(calls,0,'Preparing/preview must never upload');assert.ok(!preview.preview.includes('private.invalid'));assert.ok(!preview.preview.includes('cookie'));
  const started=Date.now(),before=await page.evaluate(()=>window.ticks);
  const uploaded=await page.evaluate(id=>window.feedbackCall('send',{localId:id}),preview.localId);
  assert.match(uploaded.id,/^TY-/);assert.equal(posts,2);assert.equal(f.sql.prepare('SELECT count(*) n FROM feedback').get().n,1,'Cross-domain lost response retry must be idempotent');
  assert.deepEqual(origins,[PRIMARY_API,PRIMARY_API,BACKUP_API,BACKUP_API]);
  assert.deepEqual(uploads.map(({origin,...u})=>u),[uploads[0],uploads[0]].map(({origin,...u})=>u));
  let rows=await page.evaluate(()=>window.feedbackCall('history'));assert.equal(rows[0].status,'pending');assert.ok(!('capability'in rows[0])&&!('body'in rows[0]));
  const elapsed=Date.now()-started,ticks=await page.evaluate(()=>window.ticks)-before;assert.ok(ticks>elapsed/100,'Main thread continues ticking during proof/upload');
  mode='status-fallback';assert.equal((await page.evaluate(id=>window.feedbackCall('status',{localId:id}),preview.localId)).status,'pending');mode='normal';
  const retryDraft=await page.evaluate(input=>window.feedbackCall('prepare',input),{...input,description:'Manual retry test'});
  const failSend=id=>page.evaluate(async id=>{try{await window.feedbackCall('send',{localId:id});return 'unexpected';}catch(e){return e.message;}},id);
  mode='paused';let previous=calls;assert.equal(await failSend(retryDraft.localId),'uploads_paused');assert.equal(calls-previous,1,'Pause must not be bypassed via backup');
  mode='offline';previous=calls;assert.equal(await failSend(retryDraft.localId),'network_failed');assert.equal(calls-previous,2,'Exhaust both origins once at challenge');
  assert.equal((await page.evaluate(id=>window.feedbackCall('preview',{localId:id}),retryDraft.localId)).preview,retryDraft.preview);
  rows=await page.evaluate(()=>window.feedbackCall('history'));assert.equal(rows.find(r=>r.localId===retryDraft.localId).status,'retry');
  mode='lost-responses';assert.equal(await failSend(retryDraft.localId),'network_failed');assert.equal(posts,4);
  assert.equal((await page.evaluate(id=>window.feedbackCall('preview',{localId:id}),retryDraft.localId)).preview,retryDraft.preview);
  mode='normal';await page.evaluate(id=>window.feedbackCall('send',{localId:id}),retryDraft.localId);assert.equal(posts,5);assert.equal(f.sql.prepare('SELECT count(*) n FROM feedback').get().n,2);
  assert.equal(uploads.at(-1).origin,PRIMARY_API,'A later manual action prioritizes new domain again');
  for(const u of uploads.slice(2))assert.deepEqual({body:u.body,key:u.key,cap:u.cap},{body:uploads[2].body,key:uploads[2].key,cap:uploads[2].cap});
  const noLog=await page.evaluate(input=>window.feedbackCall('prepare',{...input,includeDiagnostics:false}),input);assert.equal(JSON.parse(noLog.preview).diagnostics,null);
  await page.evaluate(async input=>{const rows=await window.feedbackCall('history');for(let n=rows.length;n<20;n++)await window.feedbackCall('prepare',input);},input);
  assert.match(await page.evaluate(async input=>{try{await window.feedbackCall('prepare',input);}catch(e){return e.message;}},input),/history_full/);
  await page.evaluate(id=>window.feedbackCall('delete',{localId:id}),noLog.localId);assert.equal((await page.evaluate(()=>window.feedbackCall('history'))).length,19);
  console.log('PASS compiled client worker: new domain first; bounded cross-domain retry/idempotency; pause respected; challenge failure and exhausted uploads retain drafts; manual retry; status fallback; privacy/consent; IndexedDB limit; no-log; main-thread ticks. Initial send '+elapsed+'ms, ticks '+ticks);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
