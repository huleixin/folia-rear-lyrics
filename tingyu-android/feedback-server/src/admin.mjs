import { STATUSES, scrubText } from '../../src/services/feedback/schema.mjs';
import { json, hash, limitedJson } from './security.mjs';

// feedback-server/src/admin.mjs: all rows are scoped by authentication in the router.
function filter(url){const parts=["phase='ready'","expires_at>?"],args=[Date.now()];
  for(const [param,col] of Object.entries({type:'category',version:'version',model:'model',os:'os',severity:'severity',status:'status',issue:'issue_id'})){const v=url.searchParams.get(param);if(v){parts.push(col+'=?');args.push(v.slice(0,160));}}
  for(const [param,op] of [['since','>='],['until','<=']]){const v=Number(url.searchParams.get(param));if(v>0){parts.push('created_at'+op+'?');args.push(v);}}
  const q=url.searchParams.get('q');if(q){parts.push("(id LIKE ? OR description LIKE ?)");args.push('%'+q.slice(0,100)+'%','%'+q.slice(0,100)+'%');}
  return {sql:parts.join(' AND '),args};}
export async function list(url,env){const f=filter(url),limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit'))||30));
  const cursor=url.searchParams.get('cursor');if(cursor){try{const [t,id]=JSON.parse(atob(cursor));if(!Number.isFinite(t)||typeof id!=='string')throw 0;f.sql+=' AND (created_at<? OR (created_at=? AND id<?))';f.args.push(t,t,id);}catch{return json({error:'invalid_cursor'},400);}}
  const r=await env.DB.prepare('SELECT id,created_at,category,version,model,os,severity,status,issue_id,description,log_bytes,fix_commit FROM feedback WHERE '+f.sql+' ORDER BY created_at DESC,id DESC LIMIT ?').bind(...f.args,limit+1).all();
  const items=r.results.slice(0,limit),last=items.at(-1);return json({items,nextCursor:r.results.length>limit?btoa(JSON.stringify([last.created_at,last.id])):null});}
export async function issues(url,env){const f=filter(url);const r=await env.DB.prepare('SELECT issue_id,count(*) feedback_count,count(DISTINCT model||char(0)||os) environment_count,min(created_at) first_seen,max(created_at) last_seen,group_concat(DISTINCT version) versions,max(CASE severity WHEN \'high\' THEN 3 WHEN \'medium\' THEN 2 ELSE 1 END) priority, min(category) category,min(metadata) example_metadata,sum(CASE status WHEN \'pending\' THEN 1 WHEN \'investigating\' THEN 1 ELSE 0 END) pending FROM feedback WHERE '+f.sql+' GROUP BY issue_id ORDER BY priority DESC,feedback_count DESC,last_seen DESC LIMIT 100').bind(...f.args).all();
  return json({items:r.results.map(r=>({...r,affected_devices:null,note:'反馈数量不等于独立用户；环境组合不等于独立设备'})),limited:100});}
export async function stats(env){const rows=await env.DB.prepare("SELECT count(*) total,sum(created_at>=?) today,count(DISTINCT issue_id) issues,sum(status IN ('pending','investigating')) pending,sum(severity='high' AND status NOT IN ('fixed','closed')) high FROM feedback WHERE phase='ready' AND expires_at>?").bind(Math.floor(Date.now()/86400000)*86400000,Date.now()).first();
  const dist={};for(const col of ['version','category','model','os'])dist[col]=(await env.DB.prepare('SELECT '+col+' label,count(*) count FROM feedback WHERE phase=? AND expires_at>? GROUP BY '+col+' ORDER BY count DESC LIMIT 40').bind('ready',Date.now()).all()).results;
  const lifetime=(await env.DB.prepare("SELECT value FROM metrics WHERE key='accepted_total'").first())?.value??0;
  const problemCounts=await env.DB.prepare("SELECT count(DISTINCT CASE WHEN status IN ('pending','investigating') THEN issue_id END) pending_issues,count(DISTINCT CASE WHEN severity='high' AND status NOT IN ('fixed','closed') THEN issue_id END) high_issues FROM feedback WHERE phase='ready' AND expires_at>?").bind(Date.now()).first();
  return json({...rows,...problemCounts,lifetime,distributions:dist,timezone:'UTC',roleNote:'个人数据保留30天；累计数量为匿名计数'});}
export async function detail(req,env,id,log,role){
  const row=await env.DB.prepare("SELECT * FROM feedback WHERE id=? AND phase='ready' AND expires_at>?").bind(id,Date.now()).first();if(!row)return json({error:'not_found'},404);
  if(req.method==='PATCH'){
    if(role!=='admin')return json({error:'admin_required'},403);const data=await limitedJson(req,8192);
    if(!STATUSES.includes(data.status)||!/^([a-f0-9]{7,40})?$/.test(data.commit??''))return json({error:'invalid_update'},400);
    if(Object.keys(data).some(k=>!['status','commit','note'].includes(k)))return json({error:'unknown_fields'},400);
    const now=Date.now(),note=scrubText(data.note);await env.DB.batch([
      env.DB.prepare('UPDATE feedback SET status=?,fix_commit=?,fix_note=?,updated_at=? WHERE id=?').bind(data.status,data.commit??'',note,now,id),
      env.DB.prepare('INSERT INTO fix_history(feedback_id,at,status,git_commit,note) VALUES(?,?,?,?,?)').bind(id,now,data.status,data.commit??'',note)]);return json({id,status:data.status});
  }
  if(log){if(!row.log_key)return json({error:'no_log'},404);const obj=await env.LOGS_BUCKET.get(row.log_key);if(!obj)return json({error:'log_unavailable'},503);
    const body=await obj.arrayBuffer();if(body.byteLength!==row.log_bytes||await hash(body)!==row.log_hash)return json({error:'integrity_failure'},503);
    return new Response(body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="'+row.id+'.json"','X-Log-SHA256':row.log_hash,'X-Log-Bytes':String(row.log_bytes)}});}
  const {status_hash,idempotency_hash,payload_hash,log_key,phase,...publicRow}=row;
  publicRow.history=(await env.DB.prepare('SELECT at,status,git_commit,note FROM fix_history WHERE feedback_id=? ORDER BY at DESC LIMIT 100').bind(id).all()).results;return json(publicRow);
}
