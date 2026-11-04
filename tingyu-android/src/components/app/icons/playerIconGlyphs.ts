// src/components/app/icons/playerIconGlyphs.ts
//
// 听屿经典播放图标包（10 枚）的**唯一几何来源**（第 20 轮）。
// 路径与描边宽度逐字取自图标包 svg/*.svg（与 android_vector/*.xml 完全一致，
// 见包内 manifest.json），不重绘、不改数字。
//
// 原始 SVG 里的固定色（#292929 / #6DBDAD / #D8B15C）只是样式示例 ——
// 组件一律用 currentColor 渲染：普通态随主题文字色，激活态由调用方给薄荷绿，
// 音质徽章用香槟金。control_audio_bars 只用于音频标识，不是随机播放图标。

export interface PlayerIconStrokeRun {
    /** 描边宽度（24 网格单位，与图标包 SVG 的 stroke-width 一致）。 */
    width: number;
    /** 同宽度的一组子路径（可以是一条 path 内多段 M 命令）。 */
    d: string;
}

export interface PlayerIconGlyph {
    fill: string[];
    stroke: PlayerIconStrokeRun[];
}

export const PLAYER_ICON_GLYPHS: Record<string, PlayerIconGlyph> = {
    // play_order 顺序播放
    order: {
        fill: ['M15.0 8.2 L21.5 12.0 L15.0 15.8 Z'],
        stroke: [{ width: 2.15, d: 'M3.2 5.1 H13.1 M3.2 11.2 H11.2 M3.2 17.3 H13.1' }],
    },
    // play_repeat_all 列表循环
    all: {
        fill: [],
        stroke: [
            { width: 2.35, d: 'M3.7 10.0 V8.5 C3.7 5.9 5.8 4.1 8.8 4.1 H19.8' },
            { width: 2.35, d: 'M16.3 0.9 L19.8 4.1 L16.3 7.4' },
            { width: 2.35, d: 'M20.3 14.0 V15.5 C20.3 18.1 18.2 19.9 15.2 19.9 H4.2' },
            { width: 2.35, d: 'M7.7 16.6 L4.2 19.9 L7.7 23.0' },
        ],
    },
    // play_repeat_one 单曲循环 = 列表循环 + 1
    one: {
        fill: [],
        stroke: [
            { width: 2.35, d: 'M3.7 10.0 V8.5 C3.7 5.9 5.8 4.1 8.8 4.1 H19.8' },
            { width: 2.35, d: 'M16.3 0.9 L19.8 4.1 L16.3 7.4' },
            { width: 2.35, d: 'M20.3 14.0 V15.5 C20.3 18.1 18.2 19.9 15.2 19.9 H4.2' },
            { width: 2.35, d: 'M7.7 16.6 L4.2 19.9 L7.7 23.0' },
            { width: 2.25, d: 'M10.8 10.0 L13.0 8.3 V15.8' },
        ],
    },
    // play_shuffle 随机播放
    shuffle: {
        fill: [],
        stroke: [
            { width: 2.3, d: 'M3.0 5.7 H5.9 C9.5 5.7 12.7 18.3 18.0 18.3 H20.5' },
            { width: 2.3, d: 'M17.5 15.4 L20.5 18.3 L17.5 21.1' },
            { width: 2.3, d: 'M3.0 18.3 H5.9 C9.5 18.3 12.7 5.7 18.0 5.7 H20.5' },
            { width: 2.3, d: 'M17.5 2.9 L20.5 5.7 L17.5 8.6' },
        ],
    },
    // control_previous 上一首
    previous: {
        fill: ['M18.8 4.8 Q19.8 4.2 19.8 5.7 V18.3 Q19.8 19.8 18.8 19.2 L7.4 12.9 Q6.0 12 7.4 11.1 Z'],
        stroke: [{ width: 2.75, d: 'M4.2 4.4 V19.6' }],
    },
    // control_next 下一首
    next: {
        fill: ['M5.2 4.8 Q4.2 4.2 4.2 5.7 V18.3 Q4.2 19.8 5.2 19.2 L16.6 12.9 Q18.0 12 16.6 11.1 Z'],
        stroke: [{ width: 2.75, d: 'M19.8 4.4 V19.6' }],
    },
    // control_play 播放
    play: {
        fill: ['M6.4 3.7 Q5.2 3.0 5.2 4.8 V19.2 Q5.2 21.0 6.4 20.3 L19.5 12.9 Q21.1 12.0 19.5 11.1 Z'],
        stroke: [],
    },
    // control_pause 暂停
    pause: {
        fill: [
            'M7.0 4.1 H9.4 Q10.5 4.1 10.5 5.4 V18.6 Q10.5 19.9 9.4 19.9 H7.0 Q5.9 19.9 5.9 18.6 V5.4 Q5.9 4.1 7.0 4.1 Z',
            'M14.6 4.1 H17.0 Q18.1 4.1 18.1 5.4 V18.6 Q18.1 19.9 17.0 19.9 H14.6 Q13.5 19.9 13.5 18.6 V5.4 Q13.5 4.1 14.6 4.1 Z',
        ],
        stroke: [],
    },
    // control_queue 播放列表（圆点 = 零长度线段 + 圆头端点，包内原始写法）
    queue: {
        fill: [],
        stroke: [
            { width: 2.55, d: 'M7.4 5.4 H20.1 M7.4 12.0 H20.1 M7.4 18.6 H20.1' },
            { width: 3.15, d: 'M3.2 5.4 L3.2 5.4 M3.2 12.0 L3.2 12.0 M3.2 18.6 L3.2 18.6' },
        ],
    },
    // control_audio_bars 音频柱标识 —— 只用于音质徽章，不是随机播放。
    audioBars: {
        fill: [],
        stroke: [{ width: 2.85, d: 'M3.7 17.2 V20.4 M7.85 12.4 V20.4 M12.0 6.2 V20.4 M16.15 12.4 V20.4 M20.3 17.2 V20.4' }],
    },
};

/** 图标包激活态薄荷绿（control_play 示例色）；浅色表面用加深一档。 */
export function mintActiveColor(light: boolean): string {
    return light ? '#3e9c88' : '#6dbdad';
}

/** 播放模式是否处于激活（非顺序 / 非 off）。 */
export function modeIsActive(mode: string): boolean {
    return mode !== 'order' && mode !== 'off';
}
