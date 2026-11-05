import type { CatalogAudioSpec } from '../../../../types/catalogAudioSpecs';

// src/components/app/overlays/minimal-stage/qualityBadgeSpecs.ts
//
// 全局音质标签的**唯一**视觉与语义来源。六枚标签的深色背景、描边、文字、图标与
// 三种尺寸的文案都定义在这里 —— Jetpack Compose（QualityBadge.kt）保持逐字段相同的值，
// 两端不可能各漂一个色相。
//
// 视觉参考：《听屿音质标签视觉规范图》六枚标签（石墨灰 / 雾蓝银 / 原版黑金 / 紫银 / 玫瑰铜 / 青绿）。
// 颜色是从规范图逐像素采样的：背景取 pill 内衬、描边取左右边缘、文字取字形主色。
// 不加发光、渐变、玻璃、阴影、动画。
//
// 语义（两条铁律，任何调用方不得绕过）：
//   · 真实播放音质只看**手里字节的容器** —— FLAC/APE/WAV/DSD 才是无损，MP3/AAC 永远是标准；
//     Hi-Res 必须是"目录声明 hires **且**容器确为无损"，二者缺一不可；
//   · 目录声明（dolby / dts / master）只描述平台提供什么，**永远不能**单独把播放页的
//     标签升级成空间音频或臻品母带 —— 那类标签只出现在"目录支持"语境（歌单/搜索的紧凑版）。

export type QualityLevel = 'standard' | 'hq' | 'flac' | 'hires' | 'master' | 'spatial';

export type QualityBadgeSize = 'full' | 'compact' | 'micro';

export type QualityBadgeIcon = 'none' | 'bars' | 'sparkle' | 'disc' | 'swirl';

export type QualityBadgeVisual = {
    /** 胶囊背景 */
    bg: string;
    /** 1px 描边 */
    border: string;
    /** 文字颜色（随标签有色相，不是纯白） */
    text: string;
    /** 图标颜色 */
    icon: QualityBadgeIcon;
    iconColor: string;
    /** 完整版文案（播放页） */
    label: string;
    /** 紧凑版文案（歌单 / 搜索行） */
    compactLabel: string;
    /** 微型版文案（最近播放等小卡片，无图标） */
    microLabel: string;
};

export const QUALITY_BADGE_PARAMS: Record<QualityLevel, QualityBadgeVisual> = {
    standard: {
        bg: '#34383D', border: '#747B82', text: '#E6E8E9', iconColor: '#E6E8E9',
        icon: 'none', label: '标准音质', compactLabel: '标准', microLabel: '标准',
    },
    hq: {
        bg: '#222E3C', border: '#7092B4', text: '#98AEC5', iconColor: '#98AEC5',
        icon: 'bars', label: 'HQ · 高品质', compactLabel: 'HQ', microLabel: 'HQ',
    },
    flac: {
        bg: '#282428', border: '#B99A66', text: '#E1BE85', iconColor: '#E1BE85',
        icon: 'bars', label: 'FLAC · 无损', compactLabel: 'FLAC', microLabel: 'FLAC',
    },
    hires: {
        bg: '#27273F', border: '#47476D', text: '#DBDAF1', iconColor: '#BCB9FF',
        icon: 'sparkle', label: 'Hi-Res', compactLabel: 'Hi-Res', microLabel: 'Hi-Res',
    },
    master: {
        bg: '#38252D', border: '#BE8B8E', text: '#F7F0F0', iconColor: '#D2B0B2',
        icon: 'disc', label: '臻品母带', compactLabel: '母带', microLabel: '母带',
    },
    spatial: {
        bg: '#1C3436', border: '#6EA9A7', text: '#ECF3F3', iconColor: '#9AD4CB',
        icon: 'swirl', label: '空间音频', compactLabel: '空间', microLabel: '空间',
    },
};

const LOSSLESS_CONTAINERS = new Set(['flac', 'ape', 'wav', 'dsf', 'dff']);
const LOSSY_CONTAINERS = new Set(['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wma']);

const extensionOf = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const withoutQuery = url.split(/[?#]/, 1)[0];
    const match = /\.([a-z0-9]{2,4})$/i.exec(withoutQuery);
    return match ? match[1].toLowerCase() : null;
};

/**
 * 真实播放音质：只描述**正在出声的这份字节**。
 *
 *   · 无损容器 → FLAC·无损；目录同时声明 hires → Hi-Res（原有铁律：hires 必须踩在无损容器上）；
 *   · 有损容器 → 标准音质。目录再说什么也不升级 —— 不能把 MP3 标成空间音频；
 *   · 容器未知（多数平台的流地址不带扩展名）→ 目录声明 `high` 时给标准音质，
 *     其余一律 null：宁可无标签，不可编造。
 */
export function resolvePlayingQualityLevel(
    specs: readonly CatalogAudioSpec[] | null | undefined,
    audioSrc: string | null | undefined,
): QualityLevel | null {
    const extension = extensionOf(audioSrc);
    if (extension && LOSSLESS_CONTAINERS.has(extension)) {
        return specs?.includes('hires') ? 'hires' : 'flac';
    }
    if (extension && LOSSY_CONTAINERS.has(extension)) {
        return 'standard';
    }
    return specs?.includes('high') ? 'standard' : null;
}

/**
 * 目录支持的音质（歌单 / 搜索等"这首歌有什么版本"的语境）。
 * 优先级：母带 > Hi-Res > 无损 > 空间 > 标准；dts 不属于这六枚里的任何一枚，不映射。
 */
export function resolveCatalogQualityLevel(
    specs: readonly CatalogAudioSpec[] | null | undefined,
): QualityLevel | null {
    if (!specs || specs.length === 0) return null;
    if ((specs as readonly string[]).includes('master')) return 'master';
    if (specs.includes('hires')) return 'hires';
    if (specs.includes('lossless')) return 'flac';
    if (specs.includes('dolby')) return 'spatial';
    if (specs.includes('high')) return 'standard';
    return null;
}
