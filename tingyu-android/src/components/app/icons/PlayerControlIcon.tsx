import React from 'react';
import { PLAYER_ICON_GLYPHS } from './playerIconGlyphs';

// src/components/app/icons/PlayerControlIcon.tsx
//
// 播放控制图标（第 20 轮）：previous / play / pause / next / queue / audioBars，
// 几何来自听屿经典播放图标包（playerIconGlyphs.ts，与 Compose 侧 PlayerIcons.kt
// 同一套原始路径）。歌词舞台控制栏、WebView 回退传输条、队列菜单、音质徽章
// 都画这一套；颜色一律 currentColor，由调用方按主题 / 激活态 / 徽章金着色。
// 其余 props（data-* 等）原样透传给 svg，沿用既有的交叉淡入结构。

export type PlayerControlKind = keyof typeof PLAYER_ICON_GLYPHS;

export default function PlayerControlIcon({
    kind,
    size = 24,
    ...rest
}: {
    kind: string;
    size?: number;
} & Omit<React.SVGProps<SVGSVGElement>, 'viewBox'>) {
    const glyph = PLAYER_ICON_GLYPHS[kind] ?? PLAYER_ICON_GLYPHS.queue;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            {...rest}
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
