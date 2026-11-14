import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {fixture} from './harness.mjs';

// Test the compiled APK worker, including actual IndexedDB, XHR and proof computation.
const asset=(await readdir(new URL('../../dist/assets/',import.meta.url))).find(n=>/^feedback\.worker-.*\.js$/.test(n));
assert.ok(asset,'Build capacitor assets first');
const body=await readFile(new URL('../../dist/assets/'+asset,import.meta.url));
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/worker.js'?'text/javascript':'text/html');res.end(req.url==='/worker.js'?body:'<!doctype html><title>Feedback worker test</title>');});
await new Promise(r=>server.listen(8791,'127.0.0.1',r));
let browser;const f=fixture();let calls=0,posts=0,interrupt=true;
try{
  browser=await chromium.launch({headless:true});const context=await browser.newContext();
  await context.route('https://tingyu-feedback-api.2473297053.workers.dev/**',async route=>{
    calls++;const request=route.request(),url=new URL(request.url());
    const response=await f.call(url.pathname+url.search,{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})});
    if(request.method()==='POST'){posts++;if(interrupt){interrupt=false;await route.abort('connectionreset');return;}}
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
  assert.match(await page.evaluate(async id=>{try{await window.feedbackCall('send',{localId:id});return 'unexpected';}catch(e){return e.message;}},preview.localId),/network_failed/);
  assert.equal(posts,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM feedback').get().n,1,'Server accepted before lost response');
  let rows=await page.evaluate(()=>window.feedbackCall('history'));assert.equal(rows[0].status,'retry');assert.ok(!('capability'in rows[0])&&!('body'in rows[0]));
  assert.equal((await page.evaluate(id=>window.feedbackCall('preview',{localId:id}),preview.localId)).preview,preview.preview);
  const uploaded=await page.evaluate(id=>window.feedbackCall('send',{localId:id}),preview.localId);
  assert.match(uploaded.id,/^TY-/);assert.equal(posts,2);assert.equal(f.sql.prepare('SELECT count(*) n FROM feedback').get().n,1,'Retry must be idempotent');
  const elapsed=Date.now()-started,ticks=await page.evaluate(()=>window.ticks)-before;assert.ok(ticks>elapsed/100,'Main thread continues ticking during proof/upload');
  assert.equal((await page.evaluate(id=>window.feedbackCall('status',{localId:id}),preview.localId)).status,'pending');
  const noLog=await page.evaluate(input=>window.feedbackCall('prepare',{...input,includeDiagnostics:false}),input);assert.equal(JSON.parse(noLog.preview).diagnostics,null);
  await page.evaluate(async input=>{for(let n=0;n<18;n++)await window.feedbackCall('prepare',input);},input);
  assert.match(await page.evaluate(async input=>{try{await window.feedbackCall('prepare',input);}catch(e){return e.message;}},input),/history_full/);
  await page.evaluate(id=>window.feedbackCall('delete',{localId:id}),noLog.localId);assert.equal((await page.evaluate(()=>window.feedbackCall('history'))).length,19);
  console.log('PASS compiled client worker: no implicit upload; privacy; lost response/manual retry/idempotency; IndexedDB history/limit; no-log; status; main-thread ticks. Proof+two sends '+elapsed+'ms, ticks '+ticks);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
