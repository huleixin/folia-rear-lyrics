import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from '../src/index.mjs';
import {sanitizeFeedback} from '../../src/services/feedback/schema.mjs';
import {signed} from '../src/security.mjs';

// Real SQLite SQL/transactions plus a fault-injectable R2 adapter; not a cloud test.
export function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON;'+readFileSync(new URL('../migrations/0001_feedback.sql',import.meta.url),'utf8')+readFileSync(new URL('../migrations/0002_metrics.sql',import.meta.url),'utf8'));
  sql.exec("UPDATE settings SET value='true' WHERE key='uploads_enabled'");
  let failFinalize=false;const objects=new Map();
  const DB={prepare(query){let args=[];return {bind(...a){args=a;return this;},async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){if(failFinalize&&query.includes("SET phase='ready'")){failFinalize=false;throw Error('injected');}const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};}};},async batch(items){sql.exec('BEGIN');try{const out=[];for(const i of items)out.push(await i.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const bucket={failPut:false,failDelete:false,async put(key,body){if(this.failPut)throw Error('injected');objects.set(key,{body:Buffer.from(body),uploaded:new Date()});},async get(key){const o=objects.get(key);return o?{arrayBuffer:async()=>new Uint8Array(o.body).buffer}:null;},async delete(key){if(this.failDelete)throw Error('injected');objects.delete(key);},async list({prefix,cursor,limit}){const all=[...objects].filter(([k])=>k.startsWith(prefix)).sort(),start=Number(cursor)||0;return {objects:all.slice(start,start+limit).map(([key,o])=>({key,uploaded:o.uploaded})),truncated:all.length>start+limit,cursor:String(start+limit)};}};
  const env={DB,LOGS_BUCKET:bucket,FEEDBACK_READ_TOKEN:'test-read-only-not-a-secret',FEEDBACK_ADMIN_TOKEN:'test-admin-only-not-a-secret',UPLOADS_ENABLED:'true',POW_BITS:'16',DAILY_UPLOAD_LIMIT:'100',STORAGE_LIMIT_BYTES:'268435456'};
  const call=(path,options={})=>worker.fetch(new Request('https://test.invalid'+path,options),env);
  return {env,sql,objects,bucket,call,failFinalize:()=>{failFinalize=true;}};
}
export const payload=(overrides={})=>sanitizeFeedback({category:'playback',description:'测试播放失败',steps:'点击播放',metadata:{version:'1.5.40',versionCode:255,commit:'fe7cf39',model:'test-model',os:'14'},diagnostics:{events:[{t:Date.now(),m:'audio',l:'error',e:'load-error',f:{errorCode:42,channel:'native'}}]},...overrides});
let nonce=0;
export async function submission(f,body=payload(),options={}){
  const token=await signed({kind:'pow',bits:16,nonce:String(++nonce),exp:Date.now()+600000},f.env.FEEDBACK_ADMIN_TOKEN);
  let proof=0;while(!createHash('sha256').update(token+':'+proof).digest('hex').startsWith('0000'))proof++;
  const headers={'Content-Type':'application/json','Idempotency-Key':String(nonce).padStart(64,'0'),'X-Feedback-Status-Token':'a'.repeat(64),'X-Feedback-Challenge':token,'X-Feedback-Proof':String(proof),...options.headers};
  return {request:{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)},headers};
}
export const read={Authorization:'Bearer test-read-only-not-a-secret'};
export const admin={Authorization:'Bearer test-admin-only-not-a-secret'};
