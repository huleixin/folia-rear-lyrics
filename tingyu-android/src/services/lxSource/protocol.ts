// src/services/lxSource/protocol.ts
// Shared mobile semantics. The native shim embeds this block; parity is tested.
export const lxProtocol = String.raw`
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
`;
