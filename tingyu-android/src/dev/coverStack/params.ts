// src/dev/coverStack/params.ts
// 所有可调参数集中在这里：静止姿态、模糊、惯性、阈值、时长。
// 调试面板直接改这个对象，组件里不再出现魔法数字。

export type BlurLevel = 'off' | 'soft' | 'strong';

export const BLUR_SCALE: Record<BlurLevel, number> = {
    off: 0,
    soft: 1,
    strong: 1.9,
};

export const BLUR_LABEL: Record<BlurLevel, string> = {
    off: '关闭',
    soft: '轻微',
    strong: '稍强',
};

export interface CoverStackParams {
    // ---- 静止姿态（后面两层都是"几乎同尺寸 + 反向微旋"，靠转角和错位露边）----
    /** 第二张旋转角，deg。负数 = 逆时针 */
    rotSecond: number;
    /** 第三张旋转角，deg */
    rotThird: number;
    offsetSecondX: number;
    offsetSecondY: number;
    offsetThirdX: number;
    offsetThirdY: number;
    scaleSecond: number;
    scaleThird: number;

    // ---- 运动 ----
    /** 拖到多少封面宽度算切歌 */
    commitDistance: number;
    /** 甩动速度阈值 px/s */
    flingVelocity: number;
    /** 甩动也必须满足的最低位移（封面宽度倍数） */
    flingMinDistance: number;
    /** 松手惯性：离场距离倍率 */
    inertia: number;
    /** 下一首离场时长 ms（上一首 = ×1.2） */
    exitDuration: number;
    /** 补位推进总时长 ms（拖动越深剩余越短） */
    promoteDuration: number;
    /** 拖动时顶层封面的最大倾角，0 = 完全不倾斜 */
    dragTilt: number;

    // ---- 运动残影 ----
    blur: BlurLevel;
    /** 残影强度倍率，叠在 blur 档位上 */
    blurStrength: number;
}

export const DEFAULT_PARAMS: CoverStackParams = {
    rotSecond: -4,
    rotThird: 4,
    offsetSecondX: -13,
    offsetSecondY: -5,
    offsetThirdX: 11,
    offsetThirdY: -7,
    scaleSecond: 0.985,
    scaleThird: 0.96,

    commitDistance: 0.25,
    flingVelocity: 850,
    flingMinDistance: 0.1,
    inertia: 1,
    exitDuration: 200,
    promoteDuration: 500,
    dragTilt: 0,

    blur: 'soft',
    blurStrength: 1,
};

/** 拖动时后方封面最多补位到这个比例，剩下的交给松手后的动画 */
export const DRAG_PROGRESS_LIMIT = 0.34;
/** 手势识别阈值 px */
export const GESTURE_SLOP = 8;
/**
 * 水平 / 垂直方向锁比例：|dx| 至少是 |dy| 的这个倍数才算"拖封面"。
 * 0.7 意味着约 55° 以内的斜拖都会跟随（抽封面的自然动作），更竖的手势交还页面滚动。
 */
export const AXIS_RATIO = 0.7;
