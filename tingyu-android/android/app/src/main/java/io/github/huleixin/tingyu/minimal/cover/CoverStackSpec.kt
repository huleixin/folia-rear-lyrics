package io.github.huleixin.tingyu.minimal.cover

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/cover/CoverStackSpec.kt
//
// 相册堆叠的全部可调参数与静止姿态。
//
// 数值来自已验收的 Demo（`src/dev/coverStack/params.ts` + `geometry.ts`），一个都没有重新设计：
// 后两层几乎与当前封面同尺寸，靠 ±4° 的反向微旋和轻微错位露出连续边缘，不是"缩小后在下边留一条缝"。
// 只有平面内 rotateZ，没有 perspective，没有绕 X/Y 轴翻转。
//
// 单位：位移用 dp（与 Demo 的 px@390dp 视觉一致，且能在任意密度下等比还原）。

/** 残影档位。默认 SOFT，与 Demo 的默认值一致。 */
enum class CoverTrailLevel {
    OFF,
    SOFT,
    STRONG;

    /** 倍率叠在基础强度上。 */
    fun scale(strength: Float): Float = when (this) {
        OFF -> 0f
        SOFT -> strength
        STRONG -> strength * 1.9f
    }
}

data class CoverStackSpec(
    // ---- 静止姿态 ----
    /** 第二张旋转角，deg。负数 = 逆时针。 */
    val rotSecond: Float = -4f,
    /** 第三张旋转角，deg。 */
    val rotThird: Float = 4f,
    val offsetSecondX: Float = -13f,
    val offsetSecondY: Float = -5f,
    val offsetThirdX: Float = 11f,
    val offsetThirdY: Float = -7f,
    // 缩放分级比验收版（0.985 / 0.96）再拉开一点：配合分级阴影与透明度落差，
    // 三张卡读起来是"悬浮叠放"而不是平面贴合。位移与角度全部不动。
    val scaleSecond: Float = 0.975f,
    val scaleThird: Float = 0.943f,
    // ---- 运动 ----
    /** 拖到多少封面宽度算切歌。 */
    val commitDistance: Float = 0.25f,
    /** 甩动速度阈值 px/s。 */
    val flingVelocity: Float = 850f,
    /** 甩动也必须满足的最低位移（封面宽度倍数）。 */
    val flingMinDistance: Float = 0.1f,
    /** 松手惯性：离场距离倍率。 */
    val inertia: Float = 1f,
    /** 下一首离场时长 ms；上一首 = ×1.2。 */
    val exitDurationMs: Float = 200f,
    /** 补位推进总时长 ms（拖动越深，剩余越短）。 */
    val promoteDurationMs: Float = 500f,
    /** 拖动时顶层封面的最大倾角，0 = 完全不倾斜（默认关）。 */
    val dragTilt: Float = 0f,
    // ---- 运动残影 ----
    val trail: CoverTrailLevel = CoverTrailLevel.SOFT,
    val trailStrength: Float = 1f,
) {
    companion object {
        /** 拖动时后方封面最多补位到这个比例，剩下的交给松手后的动画。 */
        const val DRAG_PROGRESS_LIMIT = 0.34f

        /** 手势识别阈值，dp。 */
        const val GESTURE_SLOP_DP = 8f

        /**
         * 水平 / 垂直方向锁比例：|dx| 至少是 |dy| 的这个倍数才算"拖封面"。
         * 0.7 意味着约 55° 以内的斜拖都会跟随（抽封面的自然动作），更竖的手势交还页面滚动。
         */
        const val AXIS_RATIO = 0.7f

        /** 拖到这个宽度的倍数时，拖动进度走满 DRAG_PROGRESS_LIMIT。 */
        const val DRAG_SPAN_RATIO = 0.45f
    }
}

/**
 * 一层封面的静止姿态。
 *
 * @param x 相对堆叠中心的水平位移（px）
 * @param y 相对堆叠中心的垂直位移（px）
 * @param scale 相对封面边长的缩放
 * @param rot 平面内旋转角（deg）
 */
data class SlotFrame(val x: Float, val y: Float, val scale: Float, val rot: Float)

/** 第四层（藏在第二层后面等待补入）的缩放比：同角度、同中心、更小，保证完全被遮住。 */
private const val WAITING_SCALE_RATIO = 0.96f

/**
 * slot: 0 当前 / 1 下一首 / 2 下下首 / 3 藏在后面待补入。
 *
 * @param pxPerDp 把 dp 参数换算成 px 的密度
 */
fun buildSlotFrames(spec: CoverStackSpec, pxPerDp: Float): List<SlotFrame> {
    val third = SlotFrame(
        x = spec.offsetThirdX * pxPerDp,
        y = spec.offsetThirdY * pxPerDp,
        scale = spec.scaleThird,
        rot = spec.rotThird,
    )
    return listOf(
        SlotFrame(0f, 0f, 1f, 0f),
        SlotFrame(
            x = spec.offsetSecondX * pxPerDp,
            y = spec.offsetSecondY * pxPerDp,
            scale = spec.scaleSecond,
            rot = spec.rotSecond,
        ),
        third,
        SlotFrame(third.x, third.y, third.scale * WAITING_SCALE_RATIO, third.rot),
    )
}

/**
 * 层位 → 压暗强度。
 *
 * 真实堆放里越靠后越吃不到光，压暗是"叠放感"的主要来源（Demo 实测 15% / 28%）。
 * 这里按**小数层位**插值：第二张升起接替当前封面时，压暗跟着一起退到 0，
 * 不会在动画结束的那一帧突然变亮。
 */
fun dimAt(slot: Float): Float = when {
    slot <= 0f -> 0f
    slot < 1f -> 0.15f * slot
    slot < 2f -> 0.15f + 0.13f * (slot - 1f)
    else -> (0.28f + 0.06f * (slot - 2f)).coerceAtMost(0.34f)
}

/**
 * 按小数 slot 线性插值，让"补位"在任意进度下都连续（角度也一起插）。
 *
 * 写进 [out]（长度 ≥ 4）以避免每帧为四层封面各分配一个对象：60fps 下这就是每秒
 * 两三百次分配，ART 上足够让 GC 在一个手势里插一脚。
 */
fun frameAt(frames: List<SlotFrame>, slot: Float, out: FloatArray) {
    val last = frames.size - 1
    val clamped = slot.coerceIn(0f, last.toFloat())
    val lower = clamped.toInt().coerceIn(0, last)
    val upper = if (lower >= last) last else lower + 1
    if (lower == upper) {
        val only = frames[lower]
        out[0] = only.x
        out[1] = only.y
        out[2] = only.scale
        out[3] = only.rot
        return
    }
    val t = clamped - lower
    val a = frames[lower]
    val b = frames[upper]
    out[0] = a.x + (b.x - a.x) * t
    out[1] = a.y + (b.y - a.y) * t
    out[2] = a.scale + (b.scale - a.scale) * t
    out[3] = a.rot + (b.rot - a.rot) * t
}
