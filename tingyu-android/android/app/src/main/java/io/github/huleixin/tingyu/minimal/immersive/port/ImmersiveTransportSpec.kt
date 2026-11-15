package io.github.huleixin.tingyu.minimal.immersive.port
import androidx.compose.animation.core.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.withTransform

// SPDX-License-Identifier: GPL-3.0-only
// Ported from lladlam/MeloX-Android 0.7.3, c04f36b9af540806b3bb185b347572e9ca12d87d.
// Tingyu: existing state, permitted system fonts and local artwork; no upstream business services.

internal fun DrawScope.drawChevronHalf(
    half: Path,
    originX: Float,
    baseline: Float,
    dx: Float = 0f,
    scale: Float = 1f,
    pivotX: Float = 0f,
    pivotY: Float = 0f,
    alpha: Float = 1f,
    // ⚠ 播放页恒白；迷你栏是 `onSurface` 色 ⇒ 必须可传（默认保持原行为不变）。
    color: Color = Color.White,
) {
    if (alpha <= 0.01f || scale <= 0.01f) return
    withTransform({
        translate(originX + dx, baseline)
        if (scale != 1f) scale(scale, scale, Offset(pivotX, pivotY))
    }) {
        drawPath(path = half, color = color, alpha = alpha.coerceIn(0f, 1f))
    }
}

// ════════════════════════════════════════════════════════════════════════════
// prev / next 传送带动画的三个标定常数（2026-10-21 Apple 参考视频逐帧实测）
// ════════════════════════════════════════════════════════════════════════════

/**
 * 驱动 prev/next 动画的弹簧。
 *
 * ⚠ 为什么用弹簧而不用 tween：Apple 的过冲**不是**额外叠一层缩放，而是后三角位移 /
 *   新三角生长**本身**就在过冲 —— 实测后三角 dx 冲到 1.12 pitch、新三角 scale 冲到 1.12，
 *   两条曲线逐帧重合（误差 <0.03）。要复现这个"Q 弹"，唯一的自然表达就是让同一个
 *   欠阻尼弹簧同时驱动 dx 与 scale。
 *
 * 参数由实测反解（30fps、12 帧 = 0.4s 那一轮）：
 *   · 首次到达 1.0 在 t≈0.18s，峰值 1.12 在 t≈0.25s，回落到 1.0 在 t≈0.40s
 *     ⇒ 半周期 ≈0.22s ⇒ ωd = 2π/0.44 ≈ 14.3 rad/s
 *   · 过冲量 0.12 = e^(−ζπ/√(1−ζ²)) ⇒ ζ ≈ 0.55
 *   · ω = ωd/√(1−ζ²) ≈ 17.2 ⇒ stiffness = ω² ≈ 296 → 取 **300**
 * Compose 的 `stiffness` 就是 k（质量 1），`dampingRatio` 就是 ζ，二者可直接对应。
 *
 * ⚠ `visibilityThreshold` 必须显式给：留 null 时 `getDurationNanos` 拿不到收敛门限，
 *   动画结束时机不可控（本项目 VRR 控制器对"动画该结束却不结束"极敏感，会钉住刷新率）。
 *   取 1e-3 —— 位移分辨率 0.1% 步距 ≈ 0.24px，肉眼不可见，却能让它干净收尾。
 */
internal val SCENE_TRANSPORT_SPRING: SpringSpec<Float> = spring(
    dampingRatio = 0.55f,
    // Apple 原版整段约 0.4s（30fps 下 12 帧）。
    stiffness = 300f,
    visibilityThreshold = 1e-3f,
)

/**
 * 前三角退出过程占 `sv` 的比例。
 *
 * 实测：sv=0.30 时前三角已缩到 0.19、sv≈0.55 时归零 ⇒ 退出窗口 ≈ [0, 0.55]。
 * 后三角与新三角要到 sv≈0.97 才就位，所以前三角必须在**前半段**就让出位置。
 */
internal const val SCENE_FRONT_EXIT_SPAN = 0.55f

/**
 * prev/next 画布相对墨迹外框的放大倍数。
 *
 * 过冲峰值时后三角会探出墨迹外缘 0.12 pitch（≈墨迹宽的 6%），新三角也会探出一点；
 * ×1.30 给上下左右各留 15% 富余，尖不会被画布边界切掉。
 * （按钮本身 64dp、墨迹仅 45.5×25.5dp，放大后仍稳稳落在圆形热区里。）
 */
internal const val SCENE_GLYPH_CANVAS_SCALE = 1.30f

/** 绘制时向外多让的像素数：和 [SCENE_GLYPH_CANVAS_SCALE] 同源的冗余，双保险。 */
internal val SCENE_TRANSPORT_OVERFLOW = 24f

// ⚠⚠ 历史：这里曾有一个 `SCENE_SHARD_SEAM_SOFT_PX = 1f` 的「接缝 1px alpha 软边」，
//   配合 `drawChevronShard` 的裁剪框使用。2026-10-22 已**整段删除**，原因是它与
//   「顶点不能被削平」在原理上不可兼得 —— 那一版自己的注释就写着：
//     · 硬裁剪对不齐亚像素（实测接缝 258.5、框按整列取整到 258）⇒ 平边最亮那列被带进框里，
//       后三角平移走后没人压着，就成了一条孤立白竖线（录屏 f=1013/1015：该列 n=86、邻列 0）；
//     · 靠「把裁剪框往里缩」挡平边，缩掉的正是本三角自己的圆角尖
//       （实测离尖 1px 已高 8px、每 1px 长 2px，内缩 1.5px 就留下 9px 高的竖直切口）。
//   当时的折中是「1px 软边」，但它只能挡住 1px，而这两个三角在 x 上重叠 6 单位，
//   所以削平问题一直存在（用户 2026-10-22 再次报障「左顶点会变平」）。
//   ⇒ 现在的做法是从根上绕开：**不再切字形**，直接按轮廓画两个三角（见 [drawChevronHalf]）。

// ───────────────────────── 播放/暂停形变（ScenePlayPauseButton） ─────────────────────────

/**
 * 收缩段缓动：`cubic-bezier(0.28, 0.06, 0.55, 0.86)`。
 *
 * 三个端点约束都是量出来的，换曲线前请先算一遍：
 *   · **起手斜率 ≠ 0**（= 0.214）—— 点下去第一帧就要看得见在动。
 *     `(0.4,0,0.2,1)` 这类 Material 曲线起手斜率也是 0，会白等一帧「没反应」。
 *   · **末斜率 ≠ 0**（= 0.311 → 末速 −2.1/s）—— 这是关键。末速度为 0 的曲线会让
 *     收缩在谷底前先**停死**，再靠弹簧重新起步 ⇒ 那不是一次形变，是两次。
 *   · **全程单调**（已验证 2001 点采样无回退）—— 收缩里绝不能出现反向帧。
 */
internal val SCENE_MORPH_SHRINK_EASE = CubicBezierEasing(0.28f, 0.06f, 0.55f, 0.86f)

/** 收缩段时长（ms）。1 → 0.215 大约 7 帧@60fps，短到不拖、长到看得清「缩」。 */
internal const val SCENE_MORPH_SHRINK_MS = 115

/** 谷底缩放：明显小于一半（用户口径「缩到一半换字，接着继续缩」）。 */
internal const val SCENE_MORPH_VALLEY = 0.22f

/** 换字阈值：旧字形缩到一半时换成目标字形。 */
internal const val SCENE_MORPH_SWAP_SCALE = 0.50f

/**
 * 回弹弹簧：ζ=0.55 ⇒ 过冲 ≈1.10（与 prev/next 同一套观感），k=520。
 *
 * 为什么不用原来的 720：k 越大掉头越"折"，视觉上从 V 形弹起而不是从碗底滑出。
 * 520 时 ωd≈21，掉头处速度符号只翻转一次、无二次抖动，谷底实测 0.215（不是 0）。
 * 起步速度由 `Animatable` 从收缩段末速自动继承（−2.1/s），所以谷底不会停顿。
 */
internal val SCENE_MORPH_REBOUND: SpringSpec<Float> = spring(
    dampingRatio = 0.55f,
    stiffness = 520f,
    visibilityThreshold = 1e-3f,
)

/**
 * 连点判定窗口（ms）。略短于一整拍形变的实测收敛时间（≈370ms）：
 * 只要上一次点击的形变还没走完，这一次就算「连点」，改走浅谷底那条轻路径。
 */
internal const val SCENE_MORPH_RAPID_WINDOW_MS = 300L

/**
 * 连点时的浅谷底。**必须显著高于 [SCENE_MORPH_VALLEY]**（0.22）：
 * 连点每次都会把上一拍截断在当前 scale，若目标仍是 0.22，多按几下就单调收敛到 0.22
 * 并停在那儿 —— 正是用户报的「一直按会把按钮压到最小」。0.80 给了下界，
 * 观感是「字形在翻、按钮轻轻呼吸」，不会塌。
 */
internal const val SCENE_MORPH_RAPID_VALLEY = 0.80f

/** 连点浅谷底的下沉时长（ms）：短到只够「点一下」，不参与任何减速停留。 */
internal const val SCENE_MORPH_RAPID_DIP_MS = 60

/**
 * 连点回弹：ζ=0.78 / k=900 —— 比主回弹（ζ=0.55 / k=520）更硬更浅，
 * 只带 ~1.03 的过冲。连点时人眼看到的是字形翻转，多余的弹跳反而显吵。
 */
internal val SCENE_MORPH_RAPID_RECOVER: SpringSpec<Float> = spring(
    dampingRatio = 0.78f,
    stiffness = 900f,
    visibilityThreshold = 1e-3f,
)
