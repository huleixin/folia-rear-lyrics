import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,payload,submission,read,admin} from './harness.mjs';
import {cleanup} from '../src/feedback.mjs';
import {hash,signed,verified} from '../src/security.mjs';
import {sanitizeFeedback,safeStack,evidence,MAX_LOG_BYTES} from '../../src/services/feedback/schema.mjs';

// Test actual handlers and SQL with injected network/storage failures; secrets are synthetic.
test('private R2 + D1 upload, hash verification, idempotency, scoped status, permissions',async()=>{
 const f=fixture(),s=await submission(f),r=await f.call('/api/feedback',s.request);assert.equal(r.status,201);const {id}=await r.json();
 assert.equal(f.objects.size,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM feedback').get().n,1);
 assert.equal((await f.call('/api/feedback',s.request)).status,200);assert.equal(f.objects.size,1);
 const conflict={...s.request,body:JSON.stringify(payload({description:'different'}))};assert.equal((await f.call('/api/feedback',conflict)).status,409);
 assert.equal((await f.call('/api/feedback/status?id='+id)).status,404);
 assert.equal((await f.call('/api/feedback/status?id='+id,{headers:{'X-Feedback-Status-Token':'a'.repeat(64)}})).status,200);
 assert.equal((await f.call('/api/admin/feedback/'+id+'/log')).status,401);
 const log=await f.call('/api/admin/feedback/'+id+'/log',{headers:read});assert.equal(log.status,200);assert.equal(await hash(await log.arrayBuffer()),log.headers.get('X-Log-SHA256'));
 const patch={method:'PATCH',headers:{...read,'Content-Type':'application/json'},body:JSON.stringify({status:'verification',commit:'fe7cf39',note:'test'})};
 assert.equal((await f.call('/api/admin/feedback/'+id,patch)).status,403);patch.headers={...admin,'Content-Type':'application/json'};assert.equal((await f.call('/api/admin/feedback/'+id,patch)).status,200);
 const detail=await (await f.call('/api/admin/feedback/'+id,{headers:read})).json();assert.equal(detail.history.length,1);assert.ok(!('status_hash' in detail));
 [...f.objects.values()][0].body=Buffer.from('corrupt');assert.equal((await f.call('/api/admin/feedback/'+id+'/log',{headers:read})).status,503);
});
test('no-log feedback; deterministic evidence only; pagination and filters',async()=>{
 const f=fixture();for(let i=0;i<3;i++){const p=payload(i===2?{diagnostics:null}:{}),s=await submission(f,p);assert.equal((await f.call('/api/feedback',s.request)).status,201);}
 assert.equal(f.objects.size,2);const issues=await (await f.call('/api/admin/issues',{headers:read})).json();assert.equal(issues.items.length,2);assert.equal(issues.items[0].feedback_count,2);assert.equal(issues.items[0].affected_devices,null);
 const page=await (await f.call('/api/admin/feedback?limit=2&type=playback&version=1.5.40',{headers:read})).json();assert.equal(page.items.length,2);assert.ok(page.nextCursor);
 const next=await (await f.call('/api/admin/feedback?limit=2&cursor='+encodeURIComponent(page.nextCursor),{headers:read})).json();assert.equal(next.items.length,1);
 assert.equal(evidence(payload({diagnostics:null})).key,null);
});
test('R2 failure rolls back; finalize timeout reconciles; cleanup failures retain ledger',async()=>{
 const f=fixture(),s=await submission(f);f.bucket.failPut=true;assert.equal((await f.call('/api/feedback',s.request)).status,503);assert.equal(f.sql.prepare('SELECT bytes FROM quota').get().bytes,0);
 f.bucket.failPut=false;f.failFinalize();const retry=await submission(f);assert.equal((await f.call('/api/feedback',retry.request)).status,503);assert.equal(f.objects.size,1);
 f.sql.exec('UPDATE feedback SET created_at=created_at-61000');assert.equal((await f.call('/api/feedback',retry.request)).status,200);
 f.sql.exec('UPDATE feedback SET expires_at=0');f.bucket.failDelete=true;await cleanup(f.env);assert.equal(f.sql.prepare('SELECT count(*) n FROM feedback').get().n,1);
 f.bucket.failDelete=false;await cleanup(f.env);assert.equal(f.objects.size,0);assert.equal(f.sql.prepare('SELECT bytes FROM quota').get().bytes,0);
 f.objects.set('logs/orphan.json',{body:Buffer.from('{}'),uploaded:new Date(0)});await cleanup(f.env);assert.equal(f.objects.size,0);
});
test('malicious ZIP/raw/oversized/credential data rejected; sanitized whitelist stable',async()=>{
 const f=fixture();for(const [body,headers]of [['PK malicious zip',{'Content-Type':'application/zip'}],['{invalid',{}],[JSON.stringify({...payload(),cookie:'secret'}),{}],[JSON.stringify(payload()).replace('测试播放失败','Authorization: Bearer stolen'),{}],['x'.repeat(MAX_LOG_BYTES+32769),{}]]){
 const s=await submission(f,body,{headers});assert.equal((await f.call('/api/feedback',s.request)).status,400);}
 const p=sanitizeFeedback({...payload(),description:'https://host/private?token=secret\nCookie: password\nuser@example.com',diagnostics:{events:[{m:'audio',e:'failure',f:{cookie:'unsafe',lyrics:'private',errorCode:3}}],crashes:[{type:'Error',stack:'Error: secret\n at foo (https://host/private?token=xx:4:5)\n at java.lang.Thread.run(Thread.java:84)'}]}});
 const raw=JSON.stringify(p);for(const bad of ['password','user@example','https://host','unsafe','private','lyrics'])assert.ok(!raw.includes(bad));assert.ok(safeStack(' at java.lang.Thread.run(Thread.java:84)').includes('Thread.java:84'));
 assert.equal(f.objects.size,0);
});
test('proof required, challenge single use/expiry, rate and global capacity, pause gates',async()=>{
 const f=fixture();assert.equal((await f.call('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 const s=await submission(f);assert.equal((await f.call('/api/feedback',s.request)).status,201);s.request.headers['Idempotency-Key']='f'.repeat(64);assert.equal((await f.call('/api/feedback',s.request)).status,409);
 f.env.DAILY_UPLOAD_LIMIT='1';const n=await submission(f);assert.equal((await f.call('/api/feedback',n.request)).status,429);
 const g=fixture();g.env.STORAGE_LIMIT_BYTES='1';assert.equal((await g.call('/api/feedback',(await submission(g)).request)).status,429);
 g.env.UPLOADS_ENABLED='false';assert.equal((await g.call('/api/feedback/challenge')).status,503);assert.equal((await g.call('/api/feedback',(await submission(g)).request)).status,503);
 const h=fixture();h.sql.prepare('INSERT INTO counters VALUES(?,?,?)').run('global:challenge:'+Math.floor(Date.now()/86400000),2000,Date.now()+1e6);assert.equal((await h.call('/api/feedback/challenge',{headers:{'CF-Connecting-IP':'1.2.3.4'}})).status,429);
 const k=fixture();for(let i=0;i<30;i++)assert.equal((await k.call('/api/feedback/challenge')).status,200);assert.equal((await k.call('/api/feedback/challenge')).status,429);
});
test('cookie CSRF, read/admin isolation, one-time mobile login, safe shell',async()=>{
 const f=fixture();assert.equal((await f.call('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 const p=await f.call('/api/admin/pairings',{method:'POST',headers:{...admin,'Content-Type':'application/json'},body:'{"role":"admin"}'});assert.equal(p.status,200);const code=new URL((await p.json()).url).hash.split('=')[1];
 const opts={method:'POST',headers:{Origin:'https://test.invalid','Content-Type':'application/json'},body:JSON.stringify({pairing:code})};const login=await f.call('/api/admin/login',opts);assert.equal(login.status,200);assert.equal((await f.call('/api/admin/login',opts)).status,401);
 const cookie=login.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 assert.equal((await f.call('/api/admin/settings',{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{"uploadsEnabled":false}'})).status,403);
 assert.equal((await f.call('/api/admin/settings',{method:'PATCH',headers:{...read,'Content-Type':'application/json'},body:'{"uploadsEnabled":false}'})).status,403);
 const page=await f.call('/admin');assert.match(page.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);const js=await (await f.call('/admin/app.js')).text();assert.ok(!js.includes('innerHTML'));assert.ok(!js.includes('localStorage'));
});
test('expired/tampered proof and both upload gates; read cookie cannot manage',async()=>{
 const f=fixture(),s=await submission(f);
 s.request.headers['X-Feedback-Challenge']=await signed({kind:'pow',nonce:'expired',bits:16,exp:Date.now()-1},f.env.FEEDBACK_ADMIN_TOKEN);
 assert.equal((await f.call('/api/feedback',s.request)).status,403);
 const fresh=await submission(f);fresh.request.headers['X-Feedback-Challenge']+='x';
 assert.equal((await f.call('/api/feedback',fresh.request)).status,403);
 assert.equal(await verified(await signed({kind:'session',role:'admin',exp:0},f.env.FEEDBACK_ADMIN_TOKEN),f.env.FEEDBACK_ADMIN_TOKEN),null);
 f.sql.exec("UPDATE settings SET value='false' WHERE key='uploads_enabled'");
 assert.equal((await f.call('/api/feedback/challenge')).status,503);
 assert.equal((await f.call('/api/feedback',(await submission(f)).request)).status,503);
 const cookie='ty_session='+await signed({kind:'session',role:'read',exp:Date.now()+60000},f.env.FEEDBACK_ADMIN_TOKEN);
 assert.equal((await f.call('/api/admin/feedback',{headers:{Cookie:cookie}})).status,200);
 assert.equal((await f.call('/api/admin/settings',{method:'PATCH',headers:{Cookie:cookie,Origin:'https://test.invalid','Content-Type':'application/json'},body:'{"uploadsEnabled":true}'})).status,403);
});
test('atomic capacity under simultaneous uploads and cumulative count after expiry',async()=>{
 const f=fixture(),a=await submission(f),b=await submission(f);
 f.env.STORAGE_LIMIT_BYTES=String(Buffer.byteLength(JSON.stringify(payload().diagnostics))+1);
 const statuses=await Promise.all([f.call('/api/feedback',a.request),f.call('/api/feedback',b.request)]);
 assert.deepEqual(statuses.map(r=>r.status).sort(),[201,429]);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM feedback').get().n,1);
 assert.equal(f.objects.size,1);
 const stats=await (await f.call('/api/admin/stats',{headers:read})).json();assert.equal(stats.total,1);
 f.sql.exec('UPDATE feedback SET expires_at=0');
 const id=f.sql.prepare('SELECT id FROM feedback').get().id;
 assert.equal((await f.call('/api/admin/feedback/'+id,{headers:read})).status,404);
 await cleanup(f.env);
 assert.equal(f.objects.size,0);assert.equal(f.sql.prepare('SELECT bytes FROM quota').get().bytes,0);
 const after=await (await f.call('/api/admin/stats',{headers:read})).json();assert.equal(after.total,0);assert.equal(after.lifetime,1);
});
