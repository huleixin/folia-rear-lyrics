import { Capacitor } from '@capacitor/core';
import { getTingyuPlayback } from '../../platform/tingyuPlayback';
import { parseLxScript, validateRemoteUrl, type LxScript } from './contract';
import { lxHttp } from './http';
import { LxRuntime } from './client';
import { classifyLx, noteLx } from './diagnostics';

// src/services/lxSource/management.ts
export async function loadLxScriptUrl(input:string) {
    const importUrl=validateRemoteUrl(input.trim());
    const response=await lxHttp(importUrl,{timeout:15000},new AbortController().signal);
    if(response.statusCode<200||response.statusCode>=300)throw Error(`音源下载失败：HTTP ${response.statusCode}`);
    if(typeof response.body!=='string')throw Error('地址没有返回 JavaScript 文本');
    return {...parseLxScript(response.body),importUrl};
}
/** Import must validate both playback runtimes before replacing the installed version. */
export async function checkLxScript(script:Omit<LxScript,'capabilities'>) {
    const runtime=new LxRuntime(script);
    try{
        const capabilities=await runtime.ready;
        if(Capacitor.isNativePlatform()){
            const native=getTingyuPlayback<{validateLxScript(value:typeof script):Promise<{valid:boolean;reason?:string}>}>();
            const result=await native.validateLxScript(script);
            if(!result.valid)throw Error(`原生 JS 初始化失败：${result.reason||'未知错误'}`);
        }
        return {capabilities,updateAlert:runtime.updateAlert};
    }catch(error){noteLx('import',classifyLx(error),error);throw error;}finally{runtime.stop();}
}
