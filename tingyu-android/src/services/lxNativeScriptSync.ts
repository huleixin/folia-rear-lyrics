import { useLxSourceStore } from '../stores/useLxSourceStore';
import { getTingyuPlayback } from '../platform/tingyuPlayback';

// src/services/lxNativeScriptSync.ts
// 把用户启用的洛雪脚本交给原生。
//
// 脚本原本只存在于 WebView 的 localStorage 里，而 WebView 在后台会被冻结 —— 冻结后
// 原生既拿不到脚本，也拿不到它取回来的地址。这里把**脚本本身**交给播放进程，
// 原生在自己的 QuickJS 里执行它（见 LxRuntimeHost / LxScriptEngine）。
//
// 只传脚本正文与头信息，不传任何凭据；原生侧同样不落任何用户凭据。

interface TingyuPlaybackLx {
    setLxScript(options: {
        id: string;
        name: string;
        version: string;
        description: string;
        author: string;
        homepage: string;
        code: string;
        policy?: string;
    }): Promise<{ installed: boolean }>;
}

let queuedSignature = '';
let syncQueue: Promise<void> = Promise.resolve();

/** 最近一次下发的结果。诊断里能回答"脚本到底有没有交到播放进程"。 */
let lastSync: { at: number; installed: boolean | null; error: string | null } =
    { at: 0, installed: null, error: null };

export const readLxNativeSyncState = () => ({ ...lastSync });

export const syncLxScriptToNative = (): Promise<void> => {
    const {scripts,activeId,policy}=useLxSourceStore.getState();
    const active=scripts.find(script=>script.id===activeId)??null;
    const payload={id:active?.id??'',name:active?.name??'',version:active?.version??'',description:active?.description??'',author:active?.author??'',homepage:active?.homepage??'',code:active?.code??'',policy:JSON.stringify(policy)};
    const signature=JSON.stringify(payload);
    if(signature===queuedSignature)return syncQueue;
    queuedSignature=signature;
    // Serialize mutations so a slow old install can never overwrite the new selection.
    syncQueue=syncQueue.then(async()=>{
        try {
            const result=await getTingyuPlayback<TingyuPlaybackLx>().setLxScript(payload);
            lastSync={at:Date.now(),installed:result?.installed===true,error:null};
            if(active&&result?.installed!==true&&queuedSignature===signature)queuedSignature='';
        }catch(error){
            lastSync={at:Date.now(),installed:false,error:error instanceof Error?error.name:'unknown'};
            if(queuedSignature===signature)queuedSignature='';
        }
    });
    return syncQueue;
};

// 用户在设置里启用/切换/删除脚本时立刻同步，不等下一次播放。
useLxSourceStore.subscribe(() => { void syncLxScriptToNative(); });

/** 测试用：忘掉上次同步的内容，强制下一次真的下发。 */
export const resetLxScriptSyncForTest = (): void => {
    queuedSignature = '';
    syncQueue = Promise.resolve();
};
