// src/services/lxSource/bootstrap.ts
// This code executes inside QuickJS. No WebView, storage or native bridge objects are exposed.
export const lxBootstrap = `
(() => {
 const emit = globalThis.__emit; delete globalThis.__emit;
 const utility = globalThis.__utility; delete globalThis.__utility;
 const callbacks = new Map(); let serial = 0; let handler;
 const callUtility = (op,...args) => { const r=JSON.parse(utility(JSON.stringify({op,args}))); if(r.error) throw Error(r.error); return r.value; };
 const encode = (v) => Array.from(v || []);
 globalThis.console = {log(){},warn(){},error(){},info(){},debug(){}};
 globalThis.setTimeout = (fn,ms,...args) => { const id=++serial; callbacks.set(id,()=>fn(...args)); emit(JSON.stringify({kind:'timer',id,ms})); return id; };
 globalThis.clearTimeout = id => { callbacks.delete(id); emit(JSON.stringify({kind:'cancel',id})); };
 globalThis.__deliver = data => { const cb=callbacks.get(data.id); if(!cb)return; callbacks.delete(data.id); if(data.timer)cb(); else cb(data.error ? Error(data.error) : null,data.response,data.response?.body); };
 const buffer = {from:(data,format='utf8')=>new Uint8Array(callUtility('buffer',data,format)),bufToString:(data,format='utf8')=>callUtility('string',encode(data),format)};
 globalThis.lx = {
 version:'2.0.0', env:'mobile', currentScriptInfo: {},
 EVENT_NAMES:{request:'request',inited:'inited',updateAlert:'updateAlert'},
 on:(name,fn)=>{if(name==='request')handler=fn;},
 send:(name,data)=>{emit(JSON.stringify({kind:name,data}));return Promise.resolve();},
 request:(url,options,callback)=>{if(typeof options==='function'){callback=options;options={};}const id=++serial;callbacks.set(id,callback);emit(JSON.stringify({kind:'http',id,url,options:options||{}}));return ()=>{callbacks.delete(id);emit(JSON.stringify({kind:'cancel',id}));};},
 utils:{buffer,crypto:{
 md5: data=>callUtility('md5',data), randomBytes:size=>new Uint8Array(callUtility('random',size)),
 aesEncrypt:(data,mode,key,iv)=>new Uint8Array(callUtility('aes',encode(data),mode,encode(key),encode(iv))),
 rsaEncrypt:()=>{throw Error('此版本不支持 RSA 工具，请使用兼容移动端的音源');}
 }}
 };
 globalThis.__request = data => Promise.resolve().then(()=>{if(!handler)throw Error('音源未注册请求处理器');return handler(data.payload);}).then(value=>emit(JSON.stringify({kind:'result',id:data.id,value})),error=>emit(JSON.stringify({kind:'result',id:data.id,error:String(error?.message||error)})));
})();
`;
