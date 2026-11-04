import React from 'react';
import { PLAYER_ICON_GLYPHS } from './playerIconGlyphs';

// src/components/app/icons/PlaybackModeIcon.tsx
//
// 四种播放模式的图标（第 20 轮）：几何来自听屿经典播放图标包（playerIconGlyphs.ts，
// 与 Compose 侧 PlayerIcons.kt 同一套原始路径）。每枚图标使用包内固有的描边宽度
// （2.15 ~ 2.35），不再接受外部覆盖 —— 这保证四个入口（封面传输条、歌词舞台、
// 队列抽屉、歌曲工具）永远一张脸。

export type PlaybackMode = keyof typeof PLAYER_ICON_GLYPHS;

export default function PlaybackModeIcon({
    mode,
    size = 24,
    className,
}: {
    mode: string;
    size?: number;
    className?: string;
}) {
    const glyph = PLAYER_ICON_GLYPHS[mode] ?? PLAYER_ICON_GLYPHS.order;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={className}
        >
            {glyph.stroke.map((run, index) => (
                <path
                    key={`s${index}`}
                    d={run.d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={run.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ))}
            {glyph.fill.map((d, index) => (
                <path key={`f${index}`} d={d} fill="currentColor" />
            ))}
        </svg>
    );
}
