import { lxProtocol } from './protocol';

// src/services/lxSource/bootstrap.ts
// This code executes inside QuickJS. No WebView, storage or native bridge objects are exposed.
export const lxBootstrap = `
(() => {
 const emit=globalThis.__emit;delete globalThis.__emit;
 const utility=globalThis.__utility;delete globalThis.__utility;
 const callbacks=new Map();let serial=0,handler;
 const callUtility=(op,...args)=>{const r=JSON.parse(utility(JSON.stringify({op,args})));if(r.error)throw Error(r.error);return r.value;};
 globalThis.console={log(){},warn(){},error(){},info(){},debug(){}};
 globalThis.setTimeout=(fn,ms=0,...args)=>{if(typeof fn!=='function')throw Error('callback required a function');const id=++serial;callbacks.set(id,()=>fn(...args));emit(JSON.stringify({kind:'timer',id,ms}));return id;};
 globalThis.clearTimeout=id=>{if(callbacks.delete(id))emit(JSON.stringify({kind:'cancel',id}));};
 globalThis.__deliver=data=>{const cb=callbacks.get(data.id);if(!cb)return;callbacks.delete(data.id);if(data.timer)cb();else{const response=data.response;if(response&&response.binary)response.body=new Uint8Array(response.body);cb(data.error?Error(data.error):null,response||null,response?response.body:null);}};
 const requestHttp=(url,options,callback)=>{if(typeof options==='function'){callback=options;options={};}if(typeof callback!=='function')throw Error('callback required a function');const id=++serial;callbacks.set(id,callback);emit(JSON.stringify({kind:'http',id,url,options:options||{}}));return ()=>{callbacks.delete(id);emit(JSON.stringify({kind:'cancel',id}));};};
 ${lxProtocol}
})();
`;
