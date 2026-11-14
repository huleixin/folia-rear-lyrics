import {test} from 'node:test';
import assert from 'node:assert/strict';
import {API_ORIGINS,PRIMARY_API,BACKUP_API,withFeedbackFallback} from '../../src/services/feedback/endpoints.mjs';
import {readFileSync} from 'node:fs';

// feedback-server/test/endpoints.test.mjs: bounded failover and deployment binding contract.
test('primary first, fixed backup once, next action starts with primary',async()=>{
  for(let n=0;n<2;n++){const calls=[];const result=await withFeedbackFallback(async api=>{calls.push(api);if(api===PRIMARY_API)throw Error('network_failed');return 42;});assert.equal(result,42);assert.deepEqual(calls,[PRIMARY_API,BACKUP_API]);}
  let calls=0;await assert.rejects(withFeedbackFallback(async()=>{calls++;throw Error('network_failed');}),/network_failed/);assert.equal(calls,2);
});
test('no backup for pause, quota, authorization, validation, proof or conflict errors',async()=>{
  for(const code of ['uploads_paused','rate_limited','quota_exceeded','unauthorized','invalid_payload','invalid_challenge','challenge_timeout','idempotency_conflict']){let calls=0;await assert.rejects(withFeedbackFallback(async()=>{calls++;throw Error(code);}),new RegExp(code));assert.equal(calls,1);}
});
test('deployment keeps the custom domain and existing private resource bindings',()=>{
  const c=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url)));
  assert.deepEqual(API_ORIGINS,[PRIMARY_API,BACKUP_API]);assert.ok(API_ORIGINS.every(api=>new URL(api).protocol==='https:'));
  assert.equal(c.name,'tingyu-feedback-api');assert.equal(c.workers_dev,true);
  assert.deepEqual(c.routes,[{pattern:'feedback.20262000.xyz',custom_domain:true}]);
  assert.deepEqual(c.r2_buckets,[{binding:'LOGS_BUCKET',bucket_name:'tingyu-feedback'}]);
  assert.equal(c.d1_databases[0].binding,'DB');assert.equal(c.d1_databases[0].database_id,'bf8680e8-37b3-42f4-b878-0b41fd584ea6');
});
