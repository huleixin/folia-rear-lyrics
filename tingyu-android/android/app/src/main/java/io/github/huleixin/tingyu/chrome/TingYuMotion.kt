package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.CubicBezierEasing

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TingYuMotion.kt
//
// TingYu Motion Tokens —— Compose 侧动效参数的单一事实源。
//
// 背景（1.3.182 UI 统一工程审计）：此前至少 4 套 easing 字面量散落在
// ComposeChromeHost / NativeStageExit / MinimalSheetMotion / NativeMotionPolicy 里，
// 时长魔法数互相依赖却无单一出处。本对象把跨页面共享的曲线与时长收编到一处；
// 页面内部的角色动画（歌词逐字、可视化器）不在此列。
//
// 与 JS 侧 src/components/shared/motionTokens.ts、CSS 侧 src/styles/tingyuTokens.css
// 数值一一对应。修改任何曲线必须三处同步，并在 docs/ui-system/MOTION_SYSTEM.md 记录原因。
// 1.3.182 收编的基线参数继续保留；Liquid Motion 新增独立语义参数，
// 并调整页面 Emphasized 曲线。原导航流动弹簧、舞台收起节奏不变。
internal object TingYuMotion {
    // ---- Easing ----

    /** 标准转场曲线：PUSH/POP/TAB 页面进出场（原 ComposeChromeHost 内联值）。 */
    val Emphasized = CubicBezierEasing(.16f, 1f, .3f, 1f)

    /** 极简播放页入场：底部上滑，减速收尾（原 ComposeChromeHost 内联值）。 */
    val StageEnter = CubicBezierEasing(.2f, .72f, .16f, 1f)

    /** 极简播放页退场/舞台收起：加速离场（原 ComposeChromeHost 内联值）。 */
    val StageExit = CubicBezierEasing(.42f, 0f, .74f, .3f)

    /** 舞台收起动画（stageExit 进度驱动）的极简档曲线（原 NativeStageExit 内联值）。 */
    val Collapse = CubicBezierEasing(.4f, 0f, .7f, .3f)

    /** 底部 sheet 进场（原 MinimalSheetMotion.EaseIn）。 */
    val SheetIn = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)

    // ---- Duration (ms) ----

    /** 二级页推进/返回时长。 */
    const val PushMs = 240
    /** 一级页签进入时长。 */
    const val TabInMs = 200
    /** 一级页签退出时长。 */
    const val TabOutMs = 180
    /** 极简页入场（360ms；320~380ms 目标带，真机录屏专项）。 */
    const val MinimalEnterMs = 360
    /** 极简页滑出时长。 */
    const val MinimalExitMs = 300
    /** 极简页退场伴随淡出的时长。 */
    const val MinimalFadeMs = 200
    /** 舞台收起（stageExit）极简档时长；经典档 280ms（原 NativeStageExit 内联值）。 */
    const val StageCollapseMinimalMs = 360
    const val StageCollapseClassicMs = 280
    /** sheet 上滑进场时长（原 MinimalSheetMotion）。 */
    const val SheetInMs = 260

    const val PlayerMorphMs = 520
    const val CoverMs = 480
    const val ThemeMs = 320
    const val PanelExitMs = 190
    const val PopupExitMs = 160
    const val PanelDamping = .92f
    const val PanelStiffness = 420f

    // ---- Spring（原 NativeMotionPolicy 参数，收编到此，NativeMotionPolicy 保留别名） ----

    /** 临界阻尼弹簧：非线性减速、无过冲。 */
    const val SpringStiffness = 520f
    const val SpringDamping = 1f
}
