import { TY_SCRIM } from './motionTokens';

export { TY_SCRIM };

// src/components/shared/topScrollScrim.ts
// TingYu Top Scroll Scrim —— WebView 侧公共能力（设计系统正式组成）。
//
// 职责：给「固定头部 + 滚动内容」结构的 WebView 面提供与 Compose 端同一套
// 顶部渐隐参数与进度计算。静止（scrollTop=0）返回 0 —— 遮罩完全不可见；
// 滚过 TY_SCRIM.rampPx 后返回 1 —— 内容完全消隐。曲线与 Compose TyScrollScrim.ease
// 同族（smoothstep，端点零斜率）。
//
// 使用方式：在滚动容器的固定头下方放一个 <div className="ty-top-scrim" aria-hidden />
// （样式见 styles/topScrollScrim.css），宿主容器加 .ty-top-scrim-host；
// MobileScrollFrame 会自动把进度写入宿主的 --ty-scrim-progress。
// 注意：这是内容透明度渐隐 + 主题背景融合，不是背景玻璃模糊 —— 与底栏
// Liquid Glass 分属不同视觉手段，不得混用或互相替代。

/** 滚动激活度 0..1：0 = 静止完全干净，1 = 完全消隐。 */
export function topScrimProgress(scrollTopPx: number): number {
    const t = Math.min(1, Math.max(0, scrollTopPx / TY_SCRIM.rampPx));
    return t * t * (3 - 2 * t);
}
