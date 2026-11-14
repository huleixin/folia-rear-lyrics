import test from 'node:test';
import assert from 'node:assert/strict';
import {withFeedbackFallback,PRIMARY_API,BACKUP_API} from '../../src/services/feedback/endpoints.mjs';
import {failure,upload} from '../../src/services/feedback/transport.mjs';

test('bounded exponential retry records attempts; permanent HTML 4xx and pause stop',async()=>{
 const calls=[],delays=[];let error;
 try{await withFeedbackFallback(async(api)=>{calls.push(api);throw failure('gateway_failed',{httpStatus:503,stage:'upload'});},{maxAttempts:99,wait:async ms=>delays.push(ms)});}catch(e){error=e;}
 assert.deepEqual(calls,[PRIMARY_API,BACKUP_API,PRIMARY_API]);assert.equal(error.attempts.length,3);assert.deepEqual(error.attempts.map(x=>x.retries),[0,1,2]);assert.equal(error.details.errorType,'server');assert.ok(delays[0]>=600&&delays[0]<=800&&delays[1]>=1200&&delays[1]<=1400);
 for(const [code,status] of [['response_invalid',403],['response_invalid',413],['uploads_paused',503],['rate_limit',429]]){let n=0;await assert.rejects(withFeedbackFallback(async()=>{n++;throw failure(code,{httpStatus:status});},{maxAttempts:3,wait:async()=>{}}));assert.equal(n,1);}
});
test('XHR reports awaiting server, rejects malformed success, emits only safe facts',async()=>{
 const messages=[],previousX=globalThis.XMLHttpRequest,previousSelf=globalThis.self;
 let status=200,body='{}';const requests=[];
 globalThis.self={postMessage:m=>messages.push(m)};
 globalThis.XMLHttpRequest=class{upload={};status=status;responseText=body;headers={};open(method,url){this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}getResponseHeader(k){return {'CF-Ray':'a5a623dc5e82d5cf-NRT','X-Feedback-Request-ID':'bad private token','X-Feedback-Stage':'finalize'}[k]??null;}send(data){requests.push({data,headers:this.headers});this.upload.onprogress({loaded:10,total:10,lengthComputable:true});this.upload.onload();this.onload();}};
 const row={body:'{"description":"synthetic"}',localId:'a'.repeat(64),capability:'b'.repeat(64)};
 try{let e;try{await upload(PRIMARY_API,row,'proof','challenge',1);}catch(err){e=err;}assert.equal(e.message,'response_invalid');assert.equal(e.details.ray,'a5a623dc5e82d5cf-NRT');assert.equal(e.details.requestId,'');assert.ok(!JSON.stringify(e.details).includes('synthetic'));assert.ok(messages.every(m=>m.progress<=90));assert.equal(messages.at(-1).phase,'awaiting');
 status=201;body=JSON.stringify({id:'TY-00000000-0000-0000-0000-000000000000',status:'pending'});assert.equal((await upload(BACKUP_API,row,'proof','challenge',1)).status,'pending');assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);
 }finally{globalThis.XMLHttpRequest=previousX;globalThis.self=previousSelf;}
});
