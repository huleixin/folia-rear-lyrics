import { Capacitor } from '@capacitor/core';
import { getTingyuPlayback } from '../../platform/tingyuPlayback';
import { parseLxScript, validateRemoteUrl, type LxScript } from './contract';
import { lxHttp } from './http';
import { LxRuntime } from './client';
import { classifyLx, noteLx } from './diagnostics';
import { assertLxImportPermit, useLxSourceStore, type LxImportPermit } from '../../stores/useLxSourceStore';

// src/services/lxSource/management.ts
export async function loadLxScriptUrl(input:string,signal?:AbortSignal) {
    const importUrl=validateRemoteUrl(input.trim());
    const response=await lxHttp(importUrl,{timeout:15000},signal??new AbortController().signal);
    if(response.statusCode<200||response.statusCode>=300)throw Error(`下载音源失败：服务器返回 HTTP ${response.statusCode}，请检查地址或稍后重试`);
    if(typeof response.body!=='string')throw Error('地址没有返回 JavaScript 文本');
    if(/^\s*<(?:!doctype|html|head|body)\b/i.test(response.body))throw Error('下载地址返回了网页内容而非 .js 音源脚本，请检查链接是否为直链');
    return {...parseLxScript(response.body),importUrl};
}
function raceAbort<T>(work:Promise<T>,signal?:AbortSignal):Promise<T> {
    if(!signal)return work;
    if(signal.aborted)return Promise.reject(new DOMException('已取消导入','AbortError'));
    return new Promise<T>((resolve,reject)=>{
        const onAbort=()=>reject(new DOMException('已取消导入','AbortError'));
        signal.addEventListener('abort',onAbort,{once:true});
        work.then(
            value=>{signal.removeEventListener('abort',onAbort);resolve(value);},
            error=>{signal.removeEventListener('abort',onAbort);reject(error);},
        );
    });
}
/** Import must validate both playback runtimes before replacing the installed version. */
export async function checkLxScript(script:Omit<LxScript,'capabilities'>,permit?:LxImportPermit,options?:{signal?:AbortSignal;timeoutMs?:number}) {
    const state=useLxSourceStore.getState();
    if(!state.extensionEnabled)throw Error('第三方音源扩展已关闭');
    if(options?.signal?.aborted)throw new DOMException('已取消导入','AbortError');
    const installed=state.scripts.some(s=>s.id===script.id&&s.code===script.code);
    if(!installed){if(!permit)throw Error('请先确认实验性功能风险');assertLxImportPermit(permit);}
    const timeoutMs=Math.max(1000,Math.min(60000,options?.timeoutMs??60000));
    const runtime=new LxRuntime(script,timeoutMs);
    const requestId=crypto.randomUUID();
    const native=Capacitor.isNativePlatform()?getTingyuPlayback<{
        validateLxScript(value:typeof script & {requestId:string;timeoutMs:number}):Promise<{valid:boolean;reason?:string}>;
        cancelLxValidation?(value:{requestId:string}):Promise<void>;
    }>():null;
    const cancelNative=()=>{void native?.cancelLxValidation?.({requestId}).catch(()=>{});};
    const onAbort=()=>{cancelNative();runtime.stop(new DOMException('已取消导入','AbortError'));};
    options?.signal?.addEventListener('abort',onAbort,{once:true});
    const unsubscribe=useLxSourceStore.subscribe(next=>{
        if(!next.extensionEnabled){runtime.stop();return;}
        if(permit)try{assertLxImportPermit(permit);}catch{runtime.stop();}
    });
    try{
        const workerCheck=runtime.ready;
        const nativeCheck=Capacitor.isNativePlatform()
            ?raceAbort(native!.validateLxScript({...script,requestId,timeoutMs}),options?.signal)
                .then(result=>{if(!result.valid)throw Error(`原生 JS 初始化失败：${result.reason||'未知错误'}`);})
            :Promise.resolve();
        const [capabilities]=await Promise.all([workerCheck,nativeCheck]);
        if(!useLxSourceStore.getState().extensionEnabled)throw Error('第三方音源扩展已关闭');
        if(options?.signal?.aborted)throw new DOMException('已取消导入','AbortError');
        if(permit)assertLxImportPermit(permit);
        return {capabilities,updateAlert:runtime.updateAlert};
    }catch(error){noteLx('import',classifyLx(error),error);throw error;}finally{cancelNative();options?.signal?.removeEventListener('abort',onAbort);unsubscribe();runtime.stop();}
}
