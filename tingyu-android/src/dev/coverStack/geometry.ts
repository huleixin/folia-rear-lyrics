import type { CoverStackParams } from './params';

// src/dev/coverStack/geometry.ts
// 三层静止姿态 + 小数层位插值。参考听屿播放器截图：后两张几乎与当前封面同尺寸，
// 靠 ±5° 的反向微旋和轻微错位露出边缘，不是"缩小后在下边留一条缝"。
// 只有平面内旋转 rotateZ，没有 perspective，没有 X/Y 轴翻转。

export interface SlotFrame {
    x: number;
    y: number;
    scale: number;
    /** 平面内旋转角，deg */
    rot: number;
}

/** 第四层藏在第二层后面：同角度、同中心、更小，保证完全被遮住 */
const WAITING_SCALE_RATIO = 0.96;

/**
 * slot: 0 当前 / 1 下一首 / 2 下下首 / 3 藏在后面待补入。
 * 后两层的 x/y/rot/scale 全部来自参数，静止姿态与调试面板完全一致。
 */
export const buildSlotFrames = (params: CoverStackParams): SlotFrame[] => {
    const third = {
        x: params.offsetThirdX,
        y: params.offsetThirdY,
        scale: params.scaleThird,
        rot: params.rotThird,
    };
    return [
        { x: 0, y: 0, scale: 1, rot: 0 },
        { x: params.offsetSecondX, y: params.offsetSecondY, scale: params.scaleSecond, rot: params.rotSecond },
        third,
        { ...third, scale: params.scaleThird * WAITING_SCALE_RATIO },
    ];
};

/** 按小数 slot 线性插值，让"补位"在任意进度下都连续（角度也一起插） */
export const frameAt = (frames: SlotFrame[], slot: number): SlotFrame => {
    const clamped = Math.max(0, Math.min(frames.length - 1, slot));
    const lower = Math.floor(clamped);
    const upper = Math.min(frames.length - 1, Math.ceil(clamped));
    if (lower === upper) return frames[lower]!;
    const t = clamped - lower;
    const a = frames[lower]!;
    const b = frames[upper]!;
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        rot: a.rot + (b.rot - a.rot) * t,
    };
};
