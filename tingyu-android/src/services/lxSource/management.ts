import { Capacitor } from '@capacitor/core';
import { getTingyuPlayback } from '../../platform/tingyuPlayback';
import { parseLxScript, validateRemoteUrl, type LxScript } from './contract';
import { lxHttp } from './http';
import { LxRuntime } from './client';
import { classifyLx, noteLx } from './diagnostics';
import { assertLxImportPermit, useLxSourceStore, type LxImportPermit } from '../../stores/useLxSourceStore';

// src/services/lxSource/management.ts
export async function loadLxScriptUrl(input:string) {
    const importUrl=validateRemoteUrl(input.trim());
    const response=await lxHttp(importUrl,{timeout:15000},new AbortController().signal);
    if(response.statusCode<200||response.statusCode>=300)throw Error(`更新检查失败：服务器返回 HTTP ${response.statusCode}，请检查更新地址或稍后重试`);
    if(typeof response.body!=='string')throw Error('地址没有返回 JavaScript 文本');
    return {...parseLxScript(response.body),importUrl};
}
/** Import must validate both playback runtimes before replacing the installed version. */
export async function checkLxScript(script:Omit<LxScript,'capabilities'>,permit?:LxImportPermit) {
    const state=useLxSourceStore.getState();
    if(!state.extensionEnabled)throw Error('第三方音源扩展已关闭');
    const installed=state.scripts.some(s=>s.id===script.id&&s.code===script.code);
    if(!installed){if(!permit)throw Error('请先确认实验性功能风险');assertLxImportPermit(permit);}
    const runtime=new LxRuntime(script);
    const unsubscribe=useLxSourceStore.subscribe(next=>{
        if(!next.extensionEnabled){runtime.stop();return;}
        if(permit)try{assertLxImportPermit(permit);}catch{runtime.stop();}
    });
    try{
        const capabilities=await runtime.ready;
        if(!useLxSourceStore.getState().extensionEnabled)throw Error('第三方音源扩展已关闭');
        if(permit)assertLxImportPermit(permit);
        if(Capacitor.isNativePlatform()){
            const native=getTingyuPlayback<{validateLxScript(value:typeof script):Promise<{valid:boolean;reason?:string}>}>();
            const result=await native.validateLxScript(script);
            if(!result.valid)throw Error(`原生 JS 初始化失败：${result.reason||'未知错误'}`);
        }
        if(!useLxSourceStore.getState().extensionEnabled)throw Error('第三方音源扩展已关闭');
        if(permit)assertLxImportPermit(permit);
        return {capabilities,updateAlert:runtime.updateAlert};
    }catch(error){noteLx('import',classifyLx(error),error);throw error;}finally{unsubscribe();runtime.stop();}
}
