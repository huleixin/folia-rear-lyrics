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

/** 无损源 Format 的真实格式文案 —— 不能把所有无损文件都冒充 FLAC。 */
const LOSSLESS_MIME_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
    [/^audio\/flac/, 'FLAC · 无损'],
    [/^audio\/ape/, 'APE · 无损'],
    [/^audio\/(x-)?wav|audio\/wave/, 'WAV · 无损'],
    [/^audio\/(x-)?dsf|^audio\/dsd/, 'DSD · 无损'],
    [/^audio\/mp4.*alac|alac/, 'ALAC · 无损'],
];

/** 杜比系编解码：E-AC-3 (ec-3) / AC-3 (dec3) / AC-4 —— 空间音频的"明确音轨证据"。 */
const DOLBY_CODEC = /ec-3|dec3|ac-4|^audio\/e-?ac3/;

const extensionOf = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const withoutQuery = url.split(/[?#]/, 1)[0];
    const match = /\.([a-z0-9]{2,4})$/i.exec(withoutQuery);
    return match ? match[1].toLowerCase() : null;
};

/** Media3 音轨规格快照（见 nativeAudioElement.nativeAudioSpecStore）。 */
export type PlayingAudioSpecInput = {
    mime?: string;
    codecs?: string;
    sampleRate?: number;
    bitrate?: number;
    bitsPerSample?: number;
    confirmed?: boolean;
};

/**
 * 真实播放音质：**Media3 所选音轨的源 Format 优先**（`audioSpec`），URL 容器只是
 * 兼容播放通道的兜底 —— 兼容通道读不到规格时按扩展名如实判断，绝不套用 Media3 数据。
 *
 * 判定（从上到下，命中即停）：
 *   1. Dolby 系编解码（ec-3/dec3/ac-4）→ 空间音频 —— 有真实音轨证据；
 *   2. 无损编码（FLAC/APE/WAV/DSD/ALAC）→ 对应真实格式文案；采样率 >48kHz 或
 *      原始位深 >16bit → Hi-Res（**必须有规格证据**，目录声明和 FLAC 后缀都不算）；
 *   3. 有损编码：bitrate ≥320kbps → HQ，否则标准；
 *   4. 兼容通道：URL 扩展名无损 → FLAC（目录 hires 不升级 —— 没有规格证据）；
 *      有损 → 标准；未知 → 目录只有 high 时给标准，否则 null（宁可隐藏，不可推测）。
 *
 * 臻品母带**永远不能**从这里产出 —— 没有平台版本标识就没有证据；它只出现在
 * "目录支持"语境（列表紧凑版），且需要平台解析器真的提供 master 档位。
 */
export function resolvePlayingQualityLevel(
    specs: readonly CatalogAudioSpec[] | null | undefined,
    audioSrc: string | null | undefined,
    audioSpec?: PlayingAudioSpecInput | null,
): { level: QualityLevel; labelOverride?: string } | null {
    const mime = (audioSpec?.mime ?? '').toLowerCase();
    if (audioSpec?.confirmed && mime.startsWith('audio/')) {
        const codecs = (audioSpec.codecs ?? '').toLowerCase();
        const bitrate = audioSpec.bitrate ?? 0;
        if (DOLBY_CODEC.test(codecs) || DOLBY_CODEC.test(mime)) {
            return { level: 'spatial' };
        }
        const losslessLabel = LOSSLESS_MIME_LABELS.find(([pattern]) => pattern.test(mime));
        if (losslessLabel) {
            // DSD 的采样率天然是 MHz 级（2.8MHz 等），那是它的本质而不是"高解析度证据"：
            // DSD 永远按真实格式显示，不参与下面的 Hi-Res 判定。
            const isDsd = /dsf|dsd/.test(mime);
            const hiRes = !isDsd && (audioSpec.sampleRate ?? 44100) > 48000;
            if (hiRes) return { level: 'hires' };
            return { level: 'flac', labelOverride: losslessLabel[1] };
        }
        if (bitrate >= 320000) return { level: 'hq' };
        return { level: 'standard' };
    }
    // ---- 兼容播放通道：没有 Media3 规格，URL 扩展名是仅存的真实容器信息 ----
    const extension = extensionOf(audioSrc);
    if (extension && LOSSLESS_CONTAINERS.has(extension)) {
        return { level: 'flac' };
    }
    if (extension && LOSSY_CONTAINERS.has(extension)) {
        return { level: 'standard' };
    }
    return specs?.includes('high') ? { level: 'standard' } : null;
}

/**
 * 目录支持的音质（歌单 / 搜索等"这首歌有什么版本"的语境）。
 * 平台档位 → 标签：master → 臻品母带、hires → Hi-Res、lossless → 无损类、
 * **dolby → 空间音频、high → HQ**（high 是平台的高品质档，不是标准档）。
 * 不同平台的档位各自解析后归一化，绝不靠歌名猜测；平台没给的档位不存在。
 *
 * @param cap 播放语境的**设置上限**（用户音质偏好）。队列抽屉是播放上下文：
 *            目录有 Hi-Res 但设置是无损时，行标签显示 FLAC 而不是 Hi-Res——
 *            否则"列表 Hi-Res、播放 FLAC"在用户眼里就是自相矛盾。歌单/搜索
 *            等目录浏览语境不传 cap，保留"这首歌有什么版本"的语义。
 */
export function resolveCatalogQualityLevel(
    specs: readonly CatalogAudioSpec[] | null | undefined,
    cap?: QualityLevel | null,
): QualityLevel | null {
    if (!specs || specs.length === 0) return null;
    let level: QualityLevel | null = null;
    if ((specs as readonly string[]).includes('master')) level = 'master';
    else if (specs.includes('hires')) level = 'hires';
    else if (specs.includes('lossless')) level = 'flac';
    else if (specs.includes('dolby')) level = 'spatial';
    else if (specs.includes('high')) level = 'hq';
    else return null;
    if (cap && QUALITY_LEVEL_RANK[level] > QUALITY_LEVEL_RANK[cap]) return cap;
    return level;
}

/** 层级序：standard < hq < flac < hires < master（空间音频与无损不可比，单列）。 */
export const QUALITY_LEVEL_RANK: Record<QualityLevel, number> = {
    standard: 0, hq: 1, flac: 2, spatial: 2, hires: 3, master: 4,
};

/** 用户音质偏好 → 标签层级上限（队列抽屉的播放语境封顶）。 */
export function qualityCapForPreference(preference: 'standard' | 'high' | 'lossless' | 'hires' | undefined): QualityLevel {
    switch (preference) {
        case 'standard': return 'standard';
        case 'high': return 'hq';
        case 'hires': return 'hires';
        case 'lossless':
        default: return 'flac';
    }
}
