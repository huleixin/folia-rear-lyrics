// src/components/shared/motionTokens.ts
// TingYu Motion Tokens —— WebView 侧动效参数的单一事实源。
//
// 背景（1.3.182 审计）：framer-motion 的 duration/ease 以魔数散落在 148 个文件里
// （20+ 种 duration、9 种 easing）。本文件收编「跨页面共享」的那部分语义：
// 一级页签切换、覆盖层进出、底部 sheet、按压微反馈。页面内部的角色动画
// （可视化器、歌词逐字）保留自有节奏，不强制收编。
//
// 与 CSS 侧 src/styles/tingyuTokens.css、Compose 侧 TingYuMotion.kt 数值一一对应。
// 修改任何曲线必须三处同步，并在 docs/ui-system/MOTION_SYSTEM.md 记录原因。

export const TY_DURATION = {
    /** 微反馈：按压、hover、图标微动 */
    fast: 0.12,
    /** 颜色/透明度过渡 */
    base: 0.18,
    /** 覆盖层与页面级进出场 */
    slow: 0.28,
    /** 极简页 ↔ 舞台往返（对齐 Compose 360ms） */
    stage: 0.36,
} as const;

export const TY_EASE = {
    /** 位移类通用（底栏、卡片位移） */
    standard: [0.2, 0.8, 0.2, 1] as const,
    /** 进入：减速收尾（覆盖层托起） */
    enter: [0.22, 1, 0.36, 1] as const,
    /** 退出：加速离场 */
    exit: [0.42, 0, 0.74, 0.3] as const,
} as const;

export const TY_SPRING = {
    /** 列表重排 / 拖拽回弹 */
    snappy: { type: 'spring', stiffness: 520, damping: 1 },
    /** 轻量位移反馈 */
    gentle: { type: 'spring', stiffness: 320, damping: 26 },
} as const;

/**
 * Top Glass Bar 沉浸式毛玻璃顶栏 —— 与 CSS --ty-glass-top-*、Compose TyTopGlass 三端对齐。
 * 玻璃是固定顶栏的材质（不是内容侧特效）：blurPx = 顶栏玻璃模糊半径；tailPx = 底部强度
 * 衰减距离；decayPositions/decayAlphas 是玻璃强度在 tail 内的平滑衰减采样（端点零斜率）。
 */
export const TY_GLASS_TOP = {
    blurPx: 14,
    tailPx: 32,
    tintAlphaDark: 0.55,
    tintAlphaLight: 0.68,
    lightInk: '#122e24',
    lightMuted: '#173629',
    lightAccent: '#0a3020',
    // 32dp 内按 1dp 等距采样 1 - smoothstep；与 Kotlin 的实际 mask 色标逐项一致。
    decaySteps: 32,
    decayPositions: [
        0, 0.03125, 0.0625, 0.09375, 0.125, 0.15625, 0.1875, 0.21875,
        0.25, 0.28125, 0.3125, 0.34375, 0.375, 0.40625, 0.4375, 0.46875,
        0.5, 0.53125, 0.5625, 0.59375, 0.625, 0.65625, 0.6875, 0.71875,
        0.75, 0.78125, 0.8125, 0.84375, 0.875, 0.90625, 0.9375, 0.96875,
        1,
    ],
    decayAlphas: [
        1, 0.997131, 0.98877, 0.975281, 0.957031, 0.934387, 0.907715, 0.87738,
        0.84375, 0.80719, 0.768066, 0.726746, 0.683594, 0.638977, 0.593262, 0.546814,
        0.5, 0.453186, 0.406738, 0.361023, 0.316406, 0.273254, 0.231934, 0.19281,
        0.15625, 0.12262, 0.092285, 0.065613, 0.042969, 0.024719, 0.01123, 0.002869,
        0,
    ],
} as const;

/**
 * 语义化动效矩阵：什么层级的东西进出场，用哪一组参数。
 * 新代码按语义取用，不再手写 duration/ease。
 */
export const TY_MOTION = {
    /** 一级导航切换：轻微淡变，不做大幅位移 */
    tabSwitch: { duration: TY_DURATION.base, ease: TY_EASE.standard },
    /** 底部浮层（队列/睡眠/音源 sheet）：向上出现，向下收回 */
    sheetUp: {
        enter: { duration: TY_DURATION.slow, ease: TY_EASE.enter },
        exit: { duration: TY_DURATION.base, ease: TY_EASE.exit },
    },
    /** 居中弹窗：轻微缩放 + 渐变 */
    modal: {
        enter: { duration: TY_DURATION.slow, ease: TY_EASE.enter },
        exit: { duration: TY_DURATION.fast + 0.06, ease: TY_EASE.exit },
    },
    /** 二级页面推进/返回（WebView 侧可感知的覆盖层型页面） */
    push: {
        enter: { duration: TY_DURATION.slow, ease: TY_EASE.enter },
        exit: { duration: TY_DURATION.base, ease: TY_EASE.exit },
    },
} as const;
