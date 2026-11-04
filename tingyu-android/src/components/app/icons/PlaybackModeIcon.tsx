import React from 'react';

// src/components/app/icons/PlaybackModeIcon.tsx
//
// 四种播放模式的标准矢量图标（第 19 轮）：全局唯一来源。
//
// WebView 回退的极简传输条、经典舞台的模式按钮都画这一套；Compose 侧
// `PlayerIcons.kt` 用**同一组路径数字**（24 网格、2 单位线宽、圆头圆角）。
// 几何取自 lucide 的标准线性图标（ISC 许可）——顺序 = 双横线带右箭头，
// 循环 = 标准 repeat，单曲 = repeat-1，随机 = 标准 shuffle。四个模式同一
// 网格同一线宽，天然成套；不要再在组件里各自引 lucide 的 Repeat/Shuffle 拼。

const GLYPHS: Record<string, string[]> = {
    // 顺序播放：短横带右箭头 + 长横带右箭头
    order: [
        'M4 8h9',
        'M10 5l3 3-3 3',
        'M4 16h13',
        'M14 13l3 3-3 3',
    ],
    // 列表循环：标准 repeat（两枚箭头 + 两条圆角轨道）
    all: [
        'M17 2 21 6 17 10',
        'M3 11v-1a4 4 0 0 1 4-4h14',
        'M7 22 3 18 7 14',
        'M21 13v1a4 4 0 0 1-4 4H3',
    ],
    // 单曲循环：repeat + 1
    one: [
        'M17 2 21 6 17 10',
        'M3 11v-1a4 4 0 0 1 4-4h14',
        'M7 22 3 18 7 14',
        'M21 13v1a4 4 0 0 1-4 4H3',
        'M11 10h1v4',
    ],
    // 随机播放：标准 shuffle（交叉轨道 + 两枚箭头）
    shuffle: [
        'M18 14 22 18 18 22',
        'M18 2 22 6 18 10',
        'M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22',
        'M2 6h1.972a4 4 0 0 1 3.6 2.2',
        'M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.358-.452',
    ],
};

export type PlaybackMode = keyof typeof GLYPHS;

export default function PlaybackModeIcon({
    mode,
    size = 24,
    strokeWidth = 2,
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
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={className}
        >
            {(GLYPHS[mode] ?? GLYPHS.order).map((d, index) => <path key={index} d={d} />)}
        </svg>
    );
}
