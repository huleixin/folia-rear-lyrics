import { validateFeedback, canonical, evidence, MAX_LOG_BYTES } from '../../src/services/feedback/schema.mjs';
import { json, hash, limitedJson, checkProof, ipKey, rate, globalAdmission } from './security.mjs';

// feedback-server/src/feedback.mjs: reserve D1 first, finalize only after private R2 write.
export async function submit(req,env){
  if(env.UPLOADS_ENABLED!=='true')return json({error:'uploads_paused'},503);
  const enabled=await env.DB.prepare("SELECT value FROM settings WHERE key='uploads_enabled'").first();
  if(env.UPLOADS_ENABLED!=='true'||enabled?.value!=='true')return json({error:'uploads_paused'},503);
  const ip=await ipKey(req,env);
  if(!await globalAdmission(env,'attempt',2000)||!await rate(env,'attempt:'+ip+':'+Math.floor(Date.now()/3600000),12,7200000))return json({error:'rate_limit'},429);
  if(!await checkProof(req,env))return json({error:'proof_required'},403);
  const key=req.headers.get('Idempotency-Key')??'',cap=req.headers.get('X-Feedback-Status-Token')??'';
  if(!/^[a-f0-9]{64}$/.test(key)||!/^[a-f0-9]{64}$/.test(cap))return json({error:'invalid_capability'},400);
  const input=validateFeedback(await limitedJson(req,MAX_LOG_BYTES+32768));
  const keyHash=await hash(key),capHash=await hash(cap),payloadHash=await hash(canonical(input));
  const existing=await env.DB.prepare('SELECT * FROM feedback WHERE idempotency_hash=?').bind(keyHash).first();
  if(existing){
    if(existing.payload_hash!==payloadHash||existing.status_hash!==capHash)return json({error:'idempotency_conflict'},409);
    if(existing.expires_at<=Date.now())return json({error:'feedback_expired'},410);
    // Reconcile a lost finalize response only after verifying the stored object.
    if(existing.phase==='pending'&&Date.now()-existing.created_at>60000){
      const object=existing.log_key?await env.LOGS_BUCKET.get(existing.log_key):null;
      const body=object?await object.arrayBuffer():null;
      if(!existing.log_key||(body&&body.byteLength===existing.log_bytes&&await hash(body)===existing.log_hash)){
        await env.DB.prepare("UPDATE feedback SET phase='ready' WHERE id=?").bind(existing.id).run();existing.phase='ready';
      }
    }
    return existing.phase==='ready'?json({id:existing.id,status:existing.status,replayed:true}):json({error:'submission_in_progress'},409);
  }
  if(!await rate(env,'daily:'+Math.floor(Date.now()/86400000),Math.min(500,Number(env.DAILY_UPLOAD_LIMIT)||100),172800000))return json({error:'daily_capacity'},429);
  const proofHash=await hash(req.headers.get('X-Feedback-Challenge'));
  try{await env.DB.prepare('INSERT INTO challenges(hash,expires_at) VALUES(?,?)').bind(proofHash,Date.now()+7200000).run();}
  catch{return json({error:'challenge_used'},409);}
  const id='TY-'+crypto.randomUUID(),now=Date.now(),info=evidence(input),issue=await hash(info.key??id);
  const log=input.diagnostics?JSON.stringify(input.diagnostics):null,bytes=log?new TextEncoder().encode(log).length:0;
  const logKey=log?'logs/'+id+'.json':null,logHash=log?await hash(log):null,m=input.metadata;
  const storageLimit=Math.min(1024*1024*1024,Number(env.STORAGE_LIMIT_BYTES)||268435456);
  let result;
  try{result=await env.DB.prepare('INSERT INTO feedback(id,created_at,expires_at,idempotency_hash,status_hash,payload_hash,category,version,version_code,git_commit,model,os,severity,issue_id,description,steps,metadata,log_key,log_hash,log_bytes,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT bytes FROM quota WHERE id=1)+?<=? AND (SELECT count(*) FROM feedback)<10000')
    .bind(id,now,now+30*86400000,keyHash,capHash,payloadHash,input.category,m.version,m.versionCode,m.commit,m.model,m.os,info.severity,issue,input.description,input.steps,JSON.stringify({...m,feature:info.feature}),logKey,logHash,bytes,now,bytes,storageLimit).run();}
  catch{return json({error:'submission_conflict_retry'},409);}
  if(!result.meta.changes)return json({error:'storage_capacity'},429);
  try{if(log)await env.LOGS_BUCKET.put(logKey,log,{httpMetadata:{contentType:'application/json'},customMetadata:{sha256:logHash}});}
  catch{ // A failed R2 write is safe to undo. A finalize timeout is reconciled by scheduled cleanup.
    try{if(logKey)await env.LOGS_BUCKET.delete(logKey);await env.DB.prepare('DELETE FROM feedback WHERE id=? AND phase=?').bind(id,'pending').run();}catch{}
    return json({error:'storage_retry'},503);
  }
  await env.DB.prepare("UPDATE feedback SET phase='ready' WHERE id=?").bind(id).run();
  return json({id,status:'pending'},201);
}
export async function status(req,env){
  const id=new URL(req.url).searchParams.get('id'),token=req.headers.get('X-Feedback-Status-Token')??'';
  if(!/^[a-f0-9]{64}$/.test(token))return json({error:'not_found'},404);
  if(!await globalAdmission(env,'status',10000)||!await rate(env,'status:'+await ipKey(req,env)+':'+Math.floor(Date.now()/3600000),120,7200000))return json({error:'rate_limit'},429);
  const row=await env.DB.prepare("SELECT id,status,updated_at,fix_commit FROM feedback WHERE id=? AND status_hash=? AND phase='ready' AND expires_at>?").bind(id??'',await hash(token),Date.now()).first();
  return row?json(row):json({error:'not_found'},404);
}
export async function cleanup(env,now=Date.now()){
  const rows=await env.DB.prepare("SELECT id,log_key FROM feedback WHERE expires_at<=? OR (phase='pending' AND created_at<?) LIMIT 500").bind(now,now-7200000).all();
  for(const row of rows.results){try{if(row.log_key)await env.LOGS_BUCKET.delete(row.log_key);await env.DB.prepare('DELETE FROM feedback WHERE id=?').bind(row.id).run();}catch{/* keep ledger until R2 deletion succeeds */}}
  await env.DB.batch([env.DB.prepare('DELETE FROM counters WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM challenges WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM pairings WHERE expires_at<?').bind(now)]);
  let cursor;
  do{const page=await env.LOGS_BUCKET.list({prefix:'logs/',limit:100,cursor});
    for(const obj of page.objects){if(+obj.uploaded>now-7200000)continue;const linked=await env.DB.prepare('SELECT id FROM feedback WHERE log_key=?').bind(obj.key).first();if(!linked)await env.LOGS_BUCKET.delete(obj.key);}
    cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
}
