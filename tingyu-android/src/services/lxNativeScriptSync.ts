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
    }): Promise<{ installed: boolean }>;
}

let lastCode = '';
let lastActiveId: string | null = null;

export const syncLxScriptToNative = async (): Promise<void> => {
    const { scripts, activeId } = useLxSourceStore.getState();
    const active = scripts.find(script => script.id === activeId) ?? null;
    const code = active?.code ?? '';
    if (activeId === lastActiveId && code === lastCode) return;
    lastActiveId = activeId;
    lastCode = code;
    try {
        const native = getTingyuPlayback<TingyuPlaybackLx>();
        await native.setLxScript({
            id: active?.id ?? '',
            name: active?.name ?? '',
            version: active?.version ?? '',
            description: active?.description ?? '',
            author: active?.author ?? '',
            homepage: active?.homepage ?? '',
            code,
        });
    } catch {
        // 同步是增强：失败时原生只是跑不了脚本，前台那条 JS 通道照旧。
    }
};

// 用户在设置里启用/切换/删除脚本时立刻同步，不等下一次播放。
useLxSourceStore.subscribe(() => { void syncLxScriptToNative(); });

/** 测试用：忘掉上次同步的内容，强制下一次真的下发。 */
export const resetLxScriptSyncForTest = (): void => {
    lastCode = '';
    lastActiveId = null;
};
