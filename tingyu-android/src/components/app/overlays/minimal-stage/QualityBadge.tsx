import {
    QUALITY_BADGE_PARAMS,
    type QualityBadgeSize,
    type QualityLevel,
} from './qualityBadgeSpecs';

// src/components/app/overlays/minimal-stage/QualityBadge.tsx
//
// 全局音质标签（React 侧）。视觉参数全部来自 `qualityBadgeSpecs.ts`，
// 与原生 Compose 的 QualityBadge.kt 逐字段一致；内联样式保证不经过任何
// 主题/皮肤层再加工。规范图里"石墨灰、雾蓝银"等说明文字不属于标签内容。
// 不加发光、渐变、玻璃、阴影、动画。

const GEOMETRY: Record<QualityBadgeSize, {
    height: number; fontSize: number; icon: number; padH: number; gap: number;
    showIcon: boolean; labelKey: 'label' | 'compactLabel' | 'microLabel';
}> = {
    // 几何按规范图比例（pill 高 35px：文字 em≈13px、图标 12px、内边距≈5px、图标-文字间距≈3px），
    // FULL 以 27/35 缩放落在播放页 28dp 槽位内。
    full: { height: 27, fontSize: 10, icon: 10, padH: 6, gap: 5, showIcon: true, labelKey: 'label' },
    compact: { height: 21, fontSize: 10, icon: 10, padH: 7, gap: 4, showIcon: true, labelKey: 'compactLabel' },
    micro: { height: 17, fontSize: 9, icon: 0, padH: 6, gap: 0, showIcon: false, labelKey: 'microLabel' },
};

function BadgeIcon({ kind, color, size }: { kind: string; color: string; size: number }) {
    if (kind === 'none' || size <= 0) return null;
    // 音频柱（HQ / FLAC）：AUDIO_BARS 的对称五柱节奏，**垂直居中** —— 参考图是居中小音浪。
    if (kind === 'bars') {
        const heights = [3.2, 8, 14.2, 8, 3.2];
        const columns = [3.7, 7.85, 12.0, 16.15, 20.3];
        return (
            <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
                {columns.map((cx, index) => {
                    const x = 12 + (cx - 12) * 0.8; // 柱群向内收 20%，右侧留呼吸空隙
                    const half = heights[index] / 2;
                    return (
                        <line
                            key={index}
                            x1={x}
                            y1={8 - half}
                            x2={x}
                            y2={8 + half}
                            stroke={color}
                            strokeWidth={1.9}
                            strokeLinecap="round"
                        />
                    );
                })}
            </svg>
        );
    }
    // 四角星（Hi-Res）
    if (kind === 'sparkle') {
        return (
            <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
                <path
                    d="M8 1.4 C8.8 4.6 9.9 5.8 14.4 8 C9.9 10.2 8.8 11.4 8 14.6 C7.2 11.4 6.1 10.2 1.6 8 C6.1 5.8 7.2 4.6 8 1.4 Z"
                    fill={color}
                />
            </svg>
        );
    }
    // 圆环 + 内芯（臻品母带）
    if (kind === 'disc') {
        return (
            <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="5.9" fill="none" stroke={color} strokeWidth="1.5" />
                <circle cx="8" cy="8" r="2.2" fill={color} />
            </svg>
        );
    }
    // 同心弧 + 中点（空间音频）
    if (kind === 'swirl') {
        return (
            <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="5.9" fill="none" stroke={color} strokeWidth="1.4" opacity="0.55" />
                <circle cx="8" cy="8" r="3.1" fill="none" stroke={color} strokeWidth="1.4" />
                <circle cx="8" cy="8" r="1.15" fill={color} />
            </svg>
        );
    }
    return null;
}

export function QualityBadge({
    level,
    size = 'full',
    className,
    labelOverride,
}: {
    level: QualityLevel;
    size?: QualityBadgeSize;
    className?: string;
    /** 真实格式文案（Media3 确认了 APE/WAV/DSD/ALAC 等非 FLAC 无损时），只在无损层级生效。 */
    labelOverride?: string;
}) {
    const visual = QUALITY_BADGE_PARAMS[level];
    const geometry = GEOMETRY[size];
    const label = level === 'flac' && labelOverride ? labelOverride : visual[geometry.labelKey];
    return (
        <span
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: geometry.gap,
                height: geometry.height,
                padding: `0 ${geometry.padH}px`,
                borderRadius: geometry.height / 2,
                background: visual.bg,
                border: `1px solid ${visual.border}`,
                color: visual.text,
                fontSize: geometry.fontSize,
                lineHeight: 1,
                whiteSpace: 'nowrap',
            }}
        >
            {geometry.showIcon && <BadgeIcon kind={visual.icon} color={visual.iconColor} size={geometry.icon} />}
            {label}
        </span>
    );
}
