import { validateRemoteUrl } from './contract';
import { Capacitor } from '@capacitor/core';
import { getTingyuPlayback } from '../../platform/tingyuPlayback';
import { noteLx } from './diagnostics';

// src/services/lxSource/http.ts
export async function lxHttp(url: string, options: Record<string, unknown>, signal: AbortSignal): Promise<{statusCode:number;statusMessage?:string;headers:Record<string,string>;body:unknown;binary?:boolean}> {
    validateRemoteUrl(url);
    if (signal.aborted) throw Error('Cancelled');
    if (Capacitor.isNativePlatform()) {
        const native=getTingyuPlayback<{lxHttp(options:{id:string;url:string;options:Record<string,unknown>}):Promise<{response:string}>;cancelLxHttp(options:{id:string}):Promise<void>}>();
        const id=crypto.randomUUID();
        const cancel=()=>{void native.cancelLxHttp({id}).catch(()=>{});};
        signal.addEventListener('abort',cancel,{once:true});
        try {
            const response=await native.lxHttp({id,url,options});
            if(signal.aborted)throw Error('Cancelled');
            const result=JSON.parse(response.response);noteLx('http','http',`method=${String(options.method||'GET')} status=${result.statusCode}`);return result;
        }finally{signal.removeEventListener('abort',cancel);}
    }
    const headers:Record<string,string>={};
    for(const [key,value] of Object.entries(options.headers||{}))if(!/^(cookie|host|origin)$/i.test(key))headers[key]=String(value);
    const method=String(options.method||'GET').toUpperCase();
    if(!['GET','POST','PUT','DELETE','PATCH','HEAD'].includes(method))throw Error('HTTP method unsupported');
    let body:BodyInit|undefined=options.body==null?undefined:typeof options.body==='string'?options.body:JSON.stringify(options.body);
    if(options.form){body=new URLSearchParams(options.form as Record<string,string>);headers['Content-Type']='application/x-www-form-urlencoded';}
    if(options.formData){
        const form=new FormData();
        for(const [key,value] of Object.entries(options.formData as Record<string,unknown>)){
            if(!['string','number','boolean'].includes(typeof value))throw Error('Multipart fields must be scalar values');
            form.append(key,String(value));
        }
        body=form;for(const key of Object.keys(headers))if(key.toLowerCase()==='content-type')delete headers[key];
    }
    if(typeof body==='string'&&new TextEncoder().encode(body).length>1048576)throw Error('Request too large');
    const controller=new AbortController(),relay=()=>controller.abort();
    const timeout=typeof options.timeout==='number'&&options.timeout>0?Math.min(60000,options.timeout):13000;
    const timer=setTimeout(()=>controller.abort(),timeout);signal.addEventListener('abort',relay,{once:true});
    try {
    const response = await fetch(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body, signal:controller.signal, credentials: 'omit', redirect: 'error' });
    if(options.binary===true){const data=new Uint8Array(await response.arrayBuffer());if(data.length>2097152)throw Error('Response too large');return {statusCode:response.status,statusMessage:response.statusText,headers:Object.fromEntries(response.headers.entries()),body:Array.from(data),binary:true};}
    const text = await response.text();
    if (text.length > 2097152) throw Error('Response too large');
    let result: unknown = text; try { result = JSON.parse(text); } catch { /* text */ }
    return { statusCode: response.status, statusMessage:response.statusText, headers: Object.fromEntries(response.headers.entries()), body: result };
    }finally{clearTimeout(timer);signal.removeEventListener('abort',relay);}
}
