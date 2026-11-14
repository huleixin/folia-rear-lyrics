// src/services/feedback/schema.mjs: closed cloud schema, shared by client and Worker.
export const MAX_LOG_BYTES = 5 * 1024 * 1024;
export const CATEGORIES = ['playback','stutter','crash','lyrics','display','rear','pad','local','other'];
export const STATUSES = ['pending','investigating','verification','fixed','unreproduced','closed'];
const MODULES = ['lifecycle','nav','ui','playback','audio','source','lyrics','rear','island','lsp','shizuku','webview','js','perf','feedback','storage','media3','native'];
const NUMBERS = ['durationMs','elapsedMs','latencyMs','bufferMs','positionMs','count','sdk','width','height','fps','dropped','code','errorCode','retries','statusCode','httpStatus','bytes','epoch','attempt','ms','frameCount','jankCount'];
const FLAGS = ['playing','buffering','ready','enabled','visible','native','pad','connected','success','owns'];
const SYMBOLS = ['state','status','phase','channel','engine','mode','reason','type','errorType','quality','provider','route','stage','deviceClass'];
const SECRET = /(?:cookie|bearer|authorization|password|secret|token|api[_-]?key|access[_-]?key)\s*[:=]|\bBearer\s+\S+|\b[A-Za-z0-9_-]{48,}\b/i;
export function scrubText(value, max = 2000) {
  return String(value ?? '').slice(0,max).split('\n').map(line => SECRET.test(line) ? '[credential-redacted]' : line
    .replace(/(?:https?|wss?|file|content):\/\/[^\s<>"']+/gi,'[url-redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email-redacted]')
    .replace(/(?:[A-Za-z]:\\|\/(?:storage|sdcard|data|home|Users)\/)[^\s<>"']+/g,'[path-redacted]')
    .replace(/\b(?:\+?\d[ -]?){10,15}\b/g,'[number-redacted]')).join('\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
}
export function symbol(value,max=100) {
  const s=String(value??'');
  return s.length<=max && /^[a-zA-Z0-9_.: +()-]*$/.test(s) && !SECRET.test(s) ? s : '';
}
function fields(input={}) {
  const out={};
  for(const key of NUMBERS) if(Number.isFinite(input[key]) && Math.abs(input[key])<=1e12) out[key]=input[key];
  for(const key of FLAGS) if(typeof input[key]==='boolean') out[key]=input[key];
  for(const key of SYMBOLS) {const s=symbol(input[key]);if(s) out[key]=s;}
  return out;
}
// Keep stack locations; arbitrary exception messages, URLs and private paths are removed.
export function safeStack(stack) {
  return String(stack??'').split('\n').slice(0,512).flatMap(line=>{
    const cause=/^(?:Caused by:|Suppressed:)\s+([\w.$]+)(?::|$)/.exec(line.trim());
    if(cause)return [line.trim().split(':')[0]+': '+cause[1]];
    const java=/^\s*at\s+([\w.$<>/]+)\((([\w.$-]+\.(?:java|kt)):\d+|Native Method|Unknown Source)\)\s*$/.exec(line);
    if(java)return [' at '+java[1]+'('+java[2]+')'];
    // JS filenames and line numbers survive, URL origin/query and private directories do not.
    const js=/^\s*(?:at\s+(?:([\w.$<>]+)\s+\(?)?)?((?:https?:\/\/|capacitor:\/\/|file:\/\/|\/)[^\s)]+):(\d+):(\d+)\)?\s*$/.exec(line);
    if(js){const file=js[2].split(/[?#]/)[0].split('/').at(-1);if(/^[\w.-]+\.(?:m?js|tsx?)$/.test(file))return [' at '+(js[1]||'anonymous')+' ('+file+':'+js[3]+':'+js[4]+')'];}
    const clean=/^\s*at\s+([\w.$<>]+)\s+\(([\w.-]+\.(?:m?js|tsx?)):(\d+):(\d+)\)\s*$/.exec(line);
    return clean?[' at '+clean[1]+' ('+clean[2]+':'+clean[3]+':'+clean[4]+')']:[];
  }).slice(0,256).join('\n').slice(0,64000);
}
export function sanitizeDiagnostics(input) {
  if(!input) return null;
  return {schema:'tingyu-cloud-diagnostic/1',
    events:(Array.isArray(input.events)?input.events:[]).slice(-500).flatMap(event=>{
      if(!MODULES.includes(event?.m))return [];const e=symbol(event.e,80);if(!e)return [];
      return [{t:Number.isFinite(event.t)?event.t:0,m:event.m,l:['debug','info','warn','error','fatal'].includes(event.l)?event.l:'info',e,f:fields(event.f)}];}),
    crashes:(Array.isArray(input.crashes)?input.crashes:[]).slice(-10).map(c=>({at:Number.isFinite(c.at)?c.at:0,
      source:symbol(c.source,80),type:symbol(c.type,180),version:symbol(c.version,40),versionCode:Number.isInteger(c.versionCode)?c.versionCode:0,
      commit:/^[a-f0-9]{7,40}$/.test(c.commit??'')?c.commit:'',stack:safeStack(c.stack)})).filter(c=>c.stack||/crash|error|exception|anr|uncaught|renderer/i.test(c.source+' '+c.type)),
    performance:fields(input.performance)};
}
export function sanitizeFeedback(input) {
  if(!CATEGORIES.includes(input?.category))throw new Error('invalid_category');const m=input.metadata??{};
  return {category:input.category,description:scrubText(input.description),steps:scrubText(input.steps),metadata:{
    version:symbol(m.version,40),versionCode:Number.isInteger(m.versionCode)&&m.versionCode>0?m.versionCode:0,
    commit:/^[a-f0-9]{7,40}$/.test(m.commit??'')?m.commit:'',buildDirty:m.buildDirty===true,model:scrubText(m.model,120),manufacturer:scrubText(m.manufacturer,80),
    os:symbol(m.os,40),sdk:Number.isInteger(m.sdk)?m.sdk:0,webview:symbol(m.webview,120),
    width:Number.isInteger(m.width)?m.width:0,height:Number.isInteger(m.height)?m.height:0,pad:m.pad===true},
    diagnostics:sanitizeDiagnostics(input.diagnostics)};
}
export function canonical(v) {
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
// Reject unknown keys/unsanitized values. No archives or raw report files are accepted.
export function validateFeedback(input) {
  const clean=sanitizeFeedback(input);if(canonical(clean)!==canonical(input))throw new Error('unsafe_or_unknown_fields');
  if(!clean.description.trim())throw new Error('description_required');
  if(new TextEncoder().encode(JSON.stringify(clean.diagnostics)).length>MAX_LOG_BYTES)throw new Error('log_too_large');return clean;
}
export function evidence(input) {
  const c=[...(input.diagnostics?.crashes??[])].reverse().find(c=>c.stack&&c.type);
  const e=[...(input.diagnostics?.events??[])].reverse().find(e=>['error','fatal','warn'].includes(e.l)&&
    (e.f.errorCode!==undefined||e.f.code!==undefined||/stutter|stall|buffer|failure|timeout|error/.test(e.e)));
  if(c)return {key:['stack-v1',input.category,c.source,c.type,c.stack.split('\n').slice(0,8).join('\n'),c.version||input.metadata.version].join('|'),severity:'high',feature:c.type};
  if(e)return {key:['event-v1',input.category,e.m,e.e,e.f.errorCode??e.f.code??'',e.f.channel??'',input.metadata.version].join('|'),severity:input.category==='playback'?'high':'medium',feature:e.m+':'+e.e};
  return {key:null,severity:input.category==='crash'?'high':'low',feature:'insufficient-evidence'};
}
