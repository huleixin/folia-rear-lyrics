import { useEffect, useState } from 'react';

// src/services/localLibraryHydration.ts
// 本地曲库「首次读取完成」信号（2026-11-06 启动与前后台切换专项）。
//
// 曲库不在持久 store 里：App 组件的 useState 初始为 []，进程或 WebView 渲染器
// 重建后，loadLocalSongs 的 Dexie 读取完成之前，空数组并不代表曲库为空。
// 这个窗口里发布的页面包是「专辑 0 张 / 还没有本地音乐」的空态包，而原生
// ComposeChromeHost 收到新包会直接顶掉 NativeShellCache 的缓存首页（上一
// 会话的完整首页快照），录屏 68710 在 2.62~3.02s 的空态闪现就是这么来的。
//
// 用法：loadLocalSongs 首次 settle（成功或失败都算）后 markLocalLibraryHydrated()；
// 首页组件用 useLocalLibraryHydrated() 决定「数据未就绪时暂不发包」，让原生
// 继续显示缓存页。真正空曲库的用户在读取完成后照样拿到空态页，行为不变。
// 模块级状态随 JS 会话存在：暖恢复（无重建）时天然已是 true，零影响。

let settled = false;
const waiters: Array<() => void> = [];

export const markLocalLibraryHydrated = (): void => {
    if (settled) return;
    settled = true;
    for (const notify of waiters.splice(0, waiters.length)) notify();
};

export const isLocalLibraryHydrated = (): boolean => settled;

export const useLocalLibraryHydrated = (): boolean => {
    const [value, setValue] = useState(settled);
    useEffect(() => {
        if (settled) { setValue(true); return; }
        const notify = () => setValue(true);
        waiters.push(notify);
        return () => {
            const index = waiters.indexOf(notify);
            if (index >= 0) waiters.splice(index, 1);
        };
    }, []);
    return value;
};
