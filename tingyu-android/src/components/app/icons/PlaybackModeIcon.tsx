import React from 'react';

// src/components/app/icons/PlaybackModeIcon.tsx
//
// 四种播放模式的标准线性图标（第 18 轮）：全局唯一来源。
//
// WebView 回退的极简传输条、经典舞台的模式按钮都画这一套；Compose 侧的
// MinimalTransport / MinimalQueueSheet 由 `PlayModeGlyph.kt` 用**同一组坐标**镜像
// （14 单位网格、1.6 单位圆头描边）。顺序 = 短横带箭头 + 长横；列表循环 = 环 +
// 缺口箭头；单曲 = 环 + 1；随机 = 交叉双箭头。风格对齐 QQ 音乐经典线性图标：
// 细线、圆角、无多余装饰。不要再在组件里各自引 lucide 的 Repeat/Shuffle ——
// 那样顺序播放会错误地显示成循环图标。

const GLYPHS: Record<string, React.ReactNode> = {
    // 顺序播放：短横带右箭头 + 长横
    order: (
        <>
            <line x1="2.5" y1="4.2" x2="8.5" y2="4.2" />
            <line x1="2.5" y1="9.8" x2="11.5" y2="9.8" />
            <line x1="6.6" y1="2.4" x2="8.5" y2="4.2" />
            <line x1="6.6" y1="6" x2="8.5" y2="4.2" />
        </>
    ),
    // 列表循环：300° 圆环（顶部留缺口）+ 缺口处的落箭头
    all: (
        <>
            <path d="M 9.5 2.67 A 5 5 0 1 1 4.5 2.67" />
            <line x1="11" y1="2.6" x2="11" y2="6.4" />
        </>
    ),
    // 单曲循环：圆环 + 1
    one: (
        <>
            <circle cx="7" cy="7" r="5" />
            <line x1="7" y1="4.4" x2="7" y2="9.6" />
        </>
    ),
    // 随机播放：两条交叉线 + 两枚箭头
    shuffle: (
        <>
            <line x1="2.5" y1="4" x2="11.5" y2="10" />
            <line x1="2.5" y1="10" x2="11.5" y2="4" />
            <line x1="9.6" y1="2.6" x2="11.5" y2="4" />
            <line x1="9.6" y1="11.4" x2="11.5" y2="10" />
        </>
    ),
};

export type PlaybackMode = keyof typeof GLYPHS;

export default function PlaybackModeIcon({
    mode,
    size = 20,
    strokeWidth = 1.6,
    className,
}: {
    mode: string;
    size?: number;
    strokeWidth?: number;
    className?: string;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={className}
        >
            {GLYPHS[mode] ?? GLYPHS.order}
        </svg>
    );
}
