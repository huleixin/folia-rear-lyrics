package io.github.huleixin.tingyu.lx

// 原生侧重新实现的洛雪移动版宿主环境（对应 WebView 里的 src/services/lxSource/bootstrap.ts）。
//
// 与那一版的三处关键差异，都是为了能在**没有 WebView、不能重入引擎**的 Service 里跑：
// 1. HTTP 不再是"脚本发消息 → 宿主回投"的往返，而是原生 async 函数直接返回一个 Promise，
//    引擎会在 evaluate 内部等到它落地 —— 后台线程里不需要任何跨线程回投；
// 2. setTimeout 走同一个 async 函数，而不是宿主定时器表，脚本的 await/串行重试照旧可用；
// 3. 结果不再靠 evaluate 的返回值，而是脚本在 .then 里 emit 出来，宿主按 id 认领。
//
// 不提供给脚本：文件系统、进程、Android Context、反射、任意算法名、本应用的任何凭据。
object LxBootstrap {

    const val SHIM: String = """
(() => {
  const emit = globalThis.__emit; delete globalThis.__emit;
  const utility = globalThis.__utility; delete globalThis.__utility;
  const http = globalThis.__http; delete globalThis.__http;
  const sleep = globalThis.__sleep; delete globalThis.__sleep;
  const cancelTimer=globalThis.__cancelTimer;delete globalThis.__cancelTimer;
  const callbacks = new Map();
  let serial = 0;
  let handler = null;
  const nextId = () => ++serial;
  const callUtility = (op, ...args) => {
    const raw = utility(JSON.stringify({ op, args }));
    const parsed = JSON.parse(raw);
    if (parsed.error) throw Error(parsed.error);
    return parsed.value;
  };
  const encode = value => Array.from(value || []);
  globalThis.console = { log(){}, warn(){}, error(){}, info(){}, debug(){}, trace(){} };
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = nextId();
    callbacks.set(id, () => fn(...args));
    const delay = Math.max(0, Math.min(2147483647, Number(ms) || 0));
    if(callbacks.size>32)throw Error('音源定时器过多');
    sleep(delay,id).then(() => {
      const callback = callbacks.get(id);
      if (!callback) return;
      callbacks.delete(id);
      callback();
    }, () => {});
    return id;
  };
  globalThis.clearTimeout = id => { if (callbacks.delete(id)) cancelTimer(id); };
  globalThis.setInterval = (fn, ms) => {
    let stopped = false;
    const tick = () => globalThis.setTimeout(() => { if (!stopped) { fn(); tick(); } }, ms || 10);
    tick();
    const id = nextId();
    callbacks.set(id, () => { stopped = true; });
    return id;
  };
  globalThis.clearInterval = id => {
    const stop = callbacks.get(id);
    if (stop) { stop(); callbacks.delete(id); }
  };
  globalThis.btoa = value => callUtility('btoa', String(value));
  globalThis.atob = value => callUtility('atob', String(value));
  const cancelHttp=globalThis.__cancelHttp;delete globalThis.__cancelHttp;
  const requestHttp=(url,options,callback)=>{
    if(typeof options==='function'){callback=options;options={};}
    const id=nextId();let cancelled=false,settled=false;
    // Serialize the entire options object: QuickJS binding objects are not JSONObject.
    const promise=http(String(url),JSON.stringify(options||{}),id).then(text=>{
      const response=JSON.parse(text);
      if(response.binary)response.body=new Uint8Array(response.body);
      return response;
    });
    if(typeof callback==='function'){
      promise.then(response=>{settled=true;if(!cancelled)callback(null,response,response.body);},error=>{settled=true;if(!cancelled)callback(error instanceof Error?error:Error(String(error)),null,null);});
      return ()=>{if(!cancelled&&!settled){cancelled=true;cancelHttp(id);}};
    }
    return promise;
  };
  // BEGIN SHARED MOBILE PROTOCOL

 const bytes = data => typeof data === 'string' ? callUtility('buffer',data,'utf8') : Array.from(data || []);
 const buffer = {from:(data,format='utf8')=>new Uint8Array(callUtility('buffer',ArrayBuffer.isView(data)?Array.from(data):data,format)),bufToString:(data,format='utf8')=>callUtility('string',bytes(data),format)};
 let initialized=false, alerted=false;
 globalThis.lx = {
  version:'2.0.0', env:'mobile', currentScriptInfo:{},
  EVENT_NAMES:{request:'request',inited:'inited',updateAlert:'updateAlert'},
  on(name,fn){if(name!=='request'||typeof fn!=='function')return Promise.reject(Error('The event is not supported: '+name));handler=fn;return Promise.resolve();},
  send(name,data){return new Promise((resolve,reject)=>{
   if(name==='inited'){
    if(initialized)return reject(Error('Script is inited'));
    initialized=true;emit(JSON.stringify({kind:name,data}));
   }else if(name==='updateAlert'){
    if(alerted)return reject(Error('The update alert can only be called once.'));
    alerted=true;
    if(!data||typeof data.log!=='string'||!data.log)return reject(Error('log is required.'));
    const updateUrl=typeof data.updateUrl==='string'&&data.updateUrl.length<=1024&&/^https?:\/\//.test(data.updateUrl)?data.updateUrl:undefined;
    emit(JSON.stringify({kind:name,data:{log:data.log.slice(0,1024),updateUrl}}));
   }else return reject(Error('The event is not supported: '+name));
   resolve();
  });},
  request:requestHttp,
  utils:{buffer,crypto:{
   md5(data){if(typeof data!=='string')throw Error('param required a string');return callUtility('md5',data);},
   randomBytes:size=>new Uint8Array(callUtility('random',size)),
   aesEncrypt:(data,mode,key,iv)=>new Uint8Array(callUtility('aes',bytes(data),mode,bytes(key),bytes(iv))),
   rsaEncrypt:(data,key)=>new Uint8Array(callUtility('rsa',bytes(data),key))
  }}
 };
 globalThis.__request = data => Promise.resolve().then(()=>{
  if(!handler)throw Error('Request event is not defined');
  const result=handler.call(lx,data.payload);
  if(!result||typeof result.then!=='function')throw Error('Request handler must return a Promise');
  return result;
 }).then(value=>{
  const action=data.payload.action;
  if(action==='musicUrl'||action==='pic'){
   if(typeof value!=='string'||value.length>2048||!/^https?:\/\//.test(value))throw Error('No valid HTTP URL');
  }else if(action==='lyric'){
   if(!value||typeof value.lyric!=='string'||value.lyric.length>51200)throw Error('Invalid lyric response');
   value={lyric:value.lyric,tlyric:typeof value.tlyric==='string'&&value.tlyric.length<5120?value.tlyric:null,rlyric:typeof value.rlyric==='string'&&value.rlyric.length<5120?value.rlyric:null,lxlyric:typeof value.lxlyric==='string'&&value.lxlyric.length<8192?value.lxlyric:null};
  }
  emit(JSON.stringify({kind:'result',id:data.id,value}));
 }).catch(error=>emit(JSON.stringify({kind:'result',id:data.id,error:String(error&&error.message||error)})));
 // Preserve built-in extension points, but protect existing members as on mobile.
 globalThis.__seal = () => {
  const seen=new Set();
  const protect=obj=>{
   if(obj===null||!['object','function'].includes(typeof obj)||seen.has(obj))return;
   seen.add(obj);
   for(const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(obj))){
    if((obj===Function.prototype&&['toString','toLocaleString'].includes(key))||(obj===Object.prototype&&key==='toString'))continue;
    if('writable' in descriptor)descriptor.writable=false;
    descriptor.configurable=false;
    try{Object.defineProperty(obj,key,descriptor);}catch{}
    protect(descriptor.value);
   }
  };
  const disabled=()=>{throw Error('Dynamic code execution is not allowed.');};
  globalThis.eval=disabled;
  const constructors=[Function,(async()=>{}).constructor,(function*(){}).constructor,(async function*(){}).constructor];
  for(const ctor of constructors)Object.defineProperty(ctor.prototype,'constructor',{value:disabled,writable:false,configurable:false});
  globalThis.Function=disabled;
  protect(globalThis);
  protect(lx);Object.freeze(lx);Object.freeze(lx.utils);Object.freeze(lx.utils.buffer);Object.freeze(lx.utils.crypto);Object.freeze(lx.EVENT_NAMES);Object.freeze(lx.currentScriptInfo);
  for(const name of ['lx','__request','__deliver','__seal','setTimeout','clearTimeout','eval','Function'])if(name in globalThis)Object.defineProperty(globalThis,name,{writable:false,configurable:false});
 };
  // END SHARED MOBILE PROTOCOL
})();
"""
}
