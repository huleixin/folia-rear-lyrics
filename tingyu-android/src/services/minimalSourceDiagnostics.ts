// src/services/minimalSourceDiagnostics.ts
//
// 「这一屏到底是谁画的」诊断开关。
//
// 背景：1.3.131 / 1.3.132 两次构建都把 `COMPOSE_MINIMAL_PLAYER` 编成了 false，
// 手机上的极简页一直是 WebView，而外观上和 Compose 几乎分辨不出来。
// 这个模块让渲染来源变成一个**显式声明**：极简封面/歌词页上出现
// `WebView` 或 `Compose` 角标，不靠猜。
//
// 临时手段，真机验收后随回滚路径一起清理。

const KEY = 'tingyu-minimal-source-badge';
export const MINIMAL_SOURCE_EVENT = 'tingyu-minimal-source-badge';

export function minimalSourceBadgeEnabled(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
        return localStorage.getItem(KEY) === '1';
    } catch {
        return false;
    }
}

export function setMinimalSourceBadge(on: boolean): void {
    try {
        if (on) localStorage.setItem(KEY, '1');
        else localStorage.removeItem(KEY);
    } catch {
        /* 隐私模式等场景写不进去就算了 —— 角标只是诊断。 */
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(MINIMAL_SOURCE_EVENT));
}

export function subscribeMinimalSourceBadge(listener: () => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener(MINIMAL_SOURCE_EVENT, listener);
    return () => window.removeEventListener(MINIMAL_SOURCE_EVENT, listener);
}

type MinimalSourceWindow = Window & { __tingyuMinimalSource?: (on?: boolean) => string };

/** 控制台开关：`__tingyuMinimalSource()` 翻转，`__tingyuMinimalSource(true/false)` 指定。 */
export function installMinimalSourceToggle(): void {
    if (typeof window === 'undefined') return;
    const target = window as MinimalSourceWindow;
    if (target.__tingyuMinimalSource) return;
    target.__tingyuMinimalSource = (on?: boolean) => {
        const next = on ?? !minimalSourceBadgeEnabled();
        setMinimalSourceBadge(next);
        return next ? 'on：极简页角标显示渲染来源（Compose / WebView）' : 'off';
    };
}

installMinimalSourceToggle();
