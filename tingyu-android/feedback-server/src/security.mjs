// feedback-server/src/security.mjs: capabilities, input bounds and expiring proof-of-work.
export const json=(v,status=200,extra={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
export const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof v==='string'?new TextEncoder().encode(v):v))).map(b=>b.toString(16).padStart(2,'0')).join('');
export const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function equal(a,b){return !!a&&!!b&&await hash(a)===await hash(b);}
async function hmac(v,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(v)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function signed(d,secret){const p=btoa(JSON.stringify(d));return p+'.'+await hmac(p,secret);}
export async function verified(token,secret){try{if(typeof token!=='string'||token.length>2048)return null;const parts=token.split('.');if(parts.length!==2)return null;const [p,s]=parts;if(!await equal(s,await hmac(p,secret)))return null;const d=JSON.parse(atob(p));return d.exp>Date.now()?d:null;}catch{return null;}}
export async function identity(req,env){const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(await equal(token,env.FEEDBACK_ADMIN_TOKEN))return 'admin';if(await equal(token,env.FEEDBACK_READ_TOKEN))return 'read';
  const session=/(?:^|; )ty_session=([^;]+)/.exec(req.headers.get('Cookie')??'')?.[1];const c=await verified(session??'',env.FEEDBACK_ADMIN_TOKEN);
  return c?.kind==='session'&&['read','admin'].includes(c.role)?c.role:null;}
export async function limitedJson(req,limit){if(!req.headers.get('Content-Type')?.startsWith('application/json'))throw new Error('json_only_archives_rejected');
  const reader=req.body?.getReader();if(!reader)throw new Error('empty_body');let n=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>limit){await reader.cancel();throw new Error('body_too_large');}chunks.push(value);}
    const buf=new Uint8Array(n);let offset=0;for(const c of chunks){buf.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf));}catch{throw Error('invalid_json');}}finally{reader.releaseLock();}}
export async function ipKey(req,env){return (await hmac((req.headers.get('CF-Connecting-IP')??'local')+'|'+Math.floor(Date.now()/86400000),env.FEEDBACK_READ_TOKEN)).slice(0,32);}
export async function rate(env,key,limit,ttl){return !!await env.DB.prepare('INSERT INTO counters(key,value,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET value=value+1 WHERE value < ? RETURNING value').bind(key,Date.now()+ttl,limit).first();}
export async function globalAdmission(env,kind,limit){return rate(env,'global:'+kind+':'+Math.floor(Date.now()/86400000),limit,172800000);}
export async function challenge(req,env){if(env.UPLOADS_ENABLED!=='true'||(await env.DB.prepare("SELECT value FROM settings WHERE key='uploads_enabled'").first())?.value!=='true')return json({error:'uploads_paused'},503);
  if(!await globalAdmission(env,'challenge',2000)||!await rate(env,'challenge:'+await ipKey(req,env)+':'+Math.floor(Date.now()/3600000),30,7200000))return json({error:'rate_limit'},429);
  const bits=Math.max(16,Math.min(22,Number(env.POW_BITS)||18));return json({token:await signed({kind:'pow',nonce:random(),bits,exp:Date.now()+600000},env.FEEDBACK_ADMIN_TOKEN),bits,expiresIn:600});}
export async function checkProof(req,env){const token=req.headers.get('X-Feedback-Challenge')??'',proof=req.headers.get('X-Feedback-Proof')??'';const c=await verified(token,env.FEEDBACK_ADMIN_TOKEN);
  if(c?.kind!=='pow'||!/^\d{1,12}$/.test(proof))return false;const d=await hash(token+':'+proof),z=Math.floor(c.bits/4),r=c.bits%4;
  return d.startsWith('0'.repeat(z))&&(!r||parseInt(d[z],16)<2**(4-r));}
