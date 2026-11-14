import { json, identity, limitedJson, equal, signed, ipKey, rate, challenge, globalAdmission, random, hash } from './security.mjs';
import { submit, status, cleanup } from './feedback.mjs';
import { list, issues, stats, detail } from './admin.mjs';
import { adminPage, adminScript, adminStyle } from './ui.mjs';
import { tracedEnvironment } from './trace.mjs';

// feedback-server/src/index.mjs: private logs; no payloads, credentials or exception objects logged.
async function route(req,env,trace){const url=new URL(req.url),p=url.pathname;
  if(p==='/health')return json({ok:true});
  if(!env.FEEDBACK_READ_TOKEN||!env.FEEDBACK_ADMIN_TOKEN)return json({error:'service_not_configured'},503);
  if(req.method==='OPTIONS')return new Response(null,{status:204});
  if(p==='/api/feedback/challenge'&&req.method==='GET')return challenge(req,env);
  if(p==='/api/feedback'&&req.method==='POST')return submit(req,env,trace);
  if(p==='/api/feedback/status'&&req.method==='GET')return status(req,env);
  if(p==='/admin'||p==='/admin/app.js'||p==='/admin/app.css')return new Response(p==='/admin'?adminPage:p.endsWith('.js')?adminScript:adminStyle,{headers:{'Content-Type':p==='/admin'?'text/html; charset=utf-8':p.endsWith('.js')?'text/javascript':'text/css','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
  if(p==='/api/admin/login'&&req.method==='POST'){
    if(req.headers.get('Origin')!==url.origin)return json({error:'origin_required'},403);
    if(!await globalAdmission(env,'login',500)||!await rate(env,'login:'+await ipKey(req,env)+':'+Math.floor(Date.now()/3600000),10,7200000))return json({error:'rate_limit'},429);
    const body=await limitedJson(req,4096);let role;
    if(typeof body.pairing==='string'&&/^[a-f0-9]{64}$/.test(body.pairing)){
      role=(await env.DB.prepare('DELETE FROM pairings WHERE hash=? AND expires_at>? RETURNING role').bind(await hash(body.pairing),Date.now()).first())?.role;
    }else role=await equal(body.token,env.FEEDBACK_ADMIN_TOKEN)?'admin':await equal(body.token,env.FEEDBACK_READ_TOKEN)?'read':null;
    if(!role)return json({error:'unauthorized'},401);
    return json({role},200,{'Set-Cookie':'ty_session='+await signed({kind:'session',role,exp:Date.now()+3600000},env.FEEDBACK_ADMIN_TOKEN)+'; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=3600'});
  }
  if(p.startsWith('/api/admin/')){const role=await identity(req,env);if(!role)return json({error:'unauthorized'},401);
    if(!['GET','HEAD'].includes(req.method)&&!req.headers.has('Authorization')&&req.headers.get('Origin')!==url.origin)return json({error:'origin_required'},403);
    if(p==='/api/admin/session'&&req.method==='GET')return json({role});
    if(p==='/api/admin/pairings'&&req.method==='POST'){
      if(role!=='admin')return json({error:'admin_required'},403);const body=await limitedJson(req,512);
      if(!['admin','read'].includes(body.role))return json({error:'invalid_role'},400);
      if(!await globalAdmission(env,'pairing',20))return json({error:'rate_limit'},429);
      const code=random();await env.DB.prepare('INSERT INTO pairings(hash,role,expires_at) VALUES(?,?,?)').bind(await hash(code),body.role,Date.now()+300000).run();
      return json({url:url.origin+'/admin#pairing='+code,expiresIn:300});
    }
    if(p==='/api/admin/logout'&&req.method==='POST')return json({ok:true},200,{'Set-Cookie':'ty_session=; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=0'});
    if(p==='/api/admin/settings'&&req.method==='PATCH'){
      if(role!=='admin')return json({error:'admin_required'},403);const d=await limitedJson(req,512);if(typeof d.uploadsEnabled!=='boolean'||Object.keys(d).length!==1)return json({error:'invalid_settings'},400);
      await env.DB.prepare("UPDATE settings SET value=? WHERE key='uploads_enabled'").bind(String(d.uploadsEnabled)).run();return json({uploadsEnabled:d.uploadsEnabled,configEnabled:env.UPLOADS_ENABLED==='true'});
    }
    if(p==='/api/admin/stats'&&req.method==='GET')return stats(env);
    if(p==='/api/admin/issues'&&req.method==='GET')return issues(url,env);
    if(p==='/api/admin/feedback'&&req.method==='GET')return list(url,env);
    const m=/^\/api\/admin\/feedback\/(TY-[a-f0-9-]{36})(\/log)?$/.exec(p);
    if(m&&['GET','PATCH'].includes(req.method)&&!(m[2]&&req.method==='PATCH'))return detail(req,env,m[1],!!m[2],role);
  }
  return json({error:'not_found'},404);
}
export default {async fetch(req,env){
  const started=Date.now(),url=new URL(req.url),tracked=['/api/feedback','/api/feedback/challenge'].includes(url.pathname);
  const trace={kind:'feedback-request',requestId:crypto.randomUUID(),stage:'admission',host:['feedback.20262000.xyz','tingyu-feedback-api.2473297053.workers.dev'].includes(url.hostname)?url.hostname:'other',route:url.pathname,bytes:0,d1Ms:0,r2Ms:0};
  let response;try{response=await route(req,tracked?tracedEnvironment(env,trace):env,trace);}catch(e){const safe=['invalid_category','unsafe_or_unknown_fields','description_required','log_too_large','body_too_large','json_only_archives_rejected','empty_body','invalid_json'];
    const code=safe.includes(e?.message)?e.message:['d1_unavailable','r2_unavailable'].includes(e?.message)?e.message:'request_failed';
    response=json({error:code},safe.includes(code)?400:503);}
  if(tracked){
    response.headers.set('X-Feedback-Request-ID',trace.requestId);response.headers.set('X-Feedback-Stage',trace.stage);
    if(response.status===429)response.headers.set('Retry-After','3600');
    trace.status=response.status;trace.elapsedMs=Date.now()-started;
    if(response.status>=400){try{trace.code=(await response.clone().json()).error??'request_failed';}catch{trace.code='request_failed';}}else trace.code='ok';
    console.log(JSON.stringify(trace));
  }
  const origin=req.headers.get('Origin');if(['https://localhost','http://localhost','capacitor://localhost'].includes(origin)){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin');response.headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');response.headers.set('Access-Control-Allow-Headers','Content-Type,Idempotency-Key,X-Feedback-Status-Token,X-Feedback-Challenge,X-Feedback-Proof');}
  response.headers.set('Access-Control-Expose-Headers','CF-Ray,X-Feedback-Request-ID,X-Feedback-Stage,Retry-After');
  return response;},async scheduled(controller,env){await cleanup(env);}};
