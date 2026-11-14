import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {sanitizeFeedback} from '../../src/services/feedback/schema.mjs';

// Real local Wrangler D1/R2 runtime smoke. Use synthetic .dev.vars only.
const API='http://127.0.0.1:8787',admin={'Authorization':'Bearer local-admin-test'};
const c=await (await fetch(API+'/api/feedback/challenge')).json();let proof=0;
while(!createHash('sha256').update(c.token+':'+proof).digest('hex').startsWith('0'.repeat(c.bits/4)))proof++;
const headers={'Content-Type':'application/json','Idempotency-Key':randomBytes(32).toString('hex'),'X-Feedback-Status-Token':randomBytes(32).toString('hex'),'X-Feedback-Challenge':c.token,'X-Feedback-Proof':String(proof)};
const body=JSON.stringify(sanitizeFeedback({category:'other',description:'本地 Worker R2 D1 验证',metadata:{version:'1.5.40'},diagnostics:{events:[],crashes:[]}}));
const response=await fetch(API+'/api/feedback',{method:'POST',headers,body});assert.ok(response.ok,await response.text());
const list=await (await fetch(API+'/api/admin/feedback',{headers:admin})).json();assert.ok(list.items.length);
const log=await fetch(API+'/api/admin/feedback/'+list.items[0].id+'/log',{headers:admin});assert.equal(log.status,200);const raw=Buffer.from(await log.arrayBuffer());assert.equal(createHash('sha256').update(raw).digest('hex'),log.headers.get('X-Log-SHA256'));
assert.equal((await fetch(API+'/api/admin/feedback')).status,401);
console.log('PASS real local Wrangler D1/R2 submit/list/private-log/checksum/auth');
