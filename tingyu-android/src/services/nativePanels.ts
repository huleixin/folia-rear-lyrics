import { COMPOSE_CHROME, chromeNative, composeChromeCapabilities } from './nativeChrome';
import type { NativePanelEvent, NativePanelFrame } from '../types/nativePanels';
import { diagnosticEvent } from './diagnostics/diagnosticLog';

// src/services/nativePanels.ts
//
// 二级操作面板的 JS↔Compose 通道（原生化专项·第 21 轮）。
//
// 与 nativePages 的关系：同一个 Capacitor 插件、同一套"JS 出模型 / Compose 出像素"，
// 但通道独立 —— 页面包描述"一整页内容"，面板包描述"一张二级面板"。分开的好处是
// 面板开合不会改动页面包的 revision，反之亦然；两条流的乱序各管各的。
//
// 失败语义：**不允许静默降级**。面板包被拒（乱序 / 路由不匹配）时 accepted=false，
// 调用方保持 WebView 版本可见；桥直接抛错时同样回落到 DOM —— 用户永远看得见菜单，
// 只是这一次由谁画。

export const NATIVE_PANELS = COMPOSE_CHROME;

let capability: Promise<boolean> | undefined;

/** 原生面板是否可用。旧包没有 panels 能力位 → false → 继续走 WebView .ml-sheet。 */
export function canUseNativePanels(): Promise<boolean> {
    if (!NATIVE_PANELS) return Promise.resolve(false);
    return (capability ??= composeChromeCapabilities()
        .then(value => value.supported && value.pages === true && value.panels === true)
        .catch(() => false));
}

/** 已经在本次会话里确认过可用（同步布尔，供渲染分支使用）。 */
let confirmed = false;
export function nativePanelsReady(): boolean {
    return confirmed;
}
export function markNativePanels(value: boolean): void {
    confirmed = value;
}

export function pushNativePanel(frame: NativePanelFrame): Promise<{ accepted: boolean; session: string }> {
    return chromeNative.panelUpdate(frame).catch(error => {
        diagnosticEvent('nav', 'warn', 'panel-update-failed', { message: String(error).slice(0, 200) });
        return { accepted: false, session: frame.session };
    });
}

export function removeNativePanel(id: string, session: string): Promise<void> {
    return chromeNative.panelRemove({ id, session }).catch(() => undefined);
}

export function onNativePanelAction(listener: (event: NativePanelEvent) => void): Promise<{ remove(): Promise<void> }> {
    return chromeNative.addListener('panelAction', listener);
}

/**
 * 把原生动作名还原成调用方能懂的形式。
 *
 * 命名空间（与 Kotlin 侧 TyPanelEvent 一一对应）：
 *   `act:<rowId>`      —— 动作行被点
 *   `set:<blockId>`    —— 下拉选择，值在 text
 *   `toggle:<blockId>` —— 开关，值在 text（"1"/"0"）
 *   `submit:<blockId>` —— 输入确认，文本在 text
 *   `confirm:<blockId>`—— 二次确认通过
 *   `dismiss`          —— 用户关掉了面板（遮罩 / 返回 / 关闭键 / 宿主收起）
 */
export type DecodedPanelAction =
    | { kind: 'action'; id: string }
    | { kind: 'value'; id: string; text: string }
    | { kind: 'dismiss' };

export function decodePanelAction(event: NativePanelEvent): DecodedPanelAction {
    const action = event.action ?? '';
    if (action === 'dismiss') return { kind: 'dismiss' };
    const text = event.text ?? '';
    for (const prefix of ['act:', 'set:', 'toggle:', 'submit:', 'confirm:'] as const) {
        if (action.startsWith(prefix)) {
            const id = action.slice(prefix.length);
            return prefix === 'act:' ? { kind: 'action', id } : { kind: 'value', id, text };
        }
    }
    // 未知动作名：当作普通动作 id 处理，宁可多一次无操作，也不要吞掉用户的点击。
    return { kind: 'action', id: action };
}
