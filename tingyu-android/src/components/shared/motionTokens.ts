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
