package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.staticCompositionLocalOf
import kotlin.math.floor

enum class PadSizeClass {
    COMPACT,
    MEDIUM,
    EXPANDED,
    LARGE,
}

// Logical dp dimensions avoid per-device heuristics across phones, foldables, and tablets.
data class PadWindow(val width: Float = 0f, val height: Float = 0f) {
    val sizeClass: PadSizeClass
        get() = when {
            width >= 1200f -> PadSizeClass.LARGE
            width >= 840f -> PadSizeClass.EXPANDED
            width >= 600f -> PadSizeClass.MEDIUM
            else -> PadSizeClass.COMPACT
        }

    val tablet get() = minOf(width, height) >= 600f
    val expanded get() = width >= 840f && height >= 480f
    val splitPlayer get() = expanded && width > height
    val landscape get() = width > height
    val shortWindow get() = height > 0f && height < 520f
    val columns get() = (width / 220f).toInt().coerceIn(4, 5)
    val rail get() = if (expanded) 104f else 0f
    val contentWidth get() = (width - rail).coerceAtLeast(0f)

    val pageHorizontalMargin: Float
        get() = when (sizeClass) {
            PadSizeClass.COMPACT -> if (width >= 480f) 20f else 16f
            PadSizeClass.MEDIUM -> 22f
            PadSizeClass.EXPANDED -> 26f
            PadSizeClass.LARGE -> 32f
        }

    val cardSpacing: Float
        get() = when (sizeClass) {
            PadSizeClass.COMPACT -> 12f
            PadSizeClass.MEDIUM -> 16f
            PadSizeClass.EXPANDED -> 18f
            PadSizeClass.LARGE -> 20f
        }

    val homeDualHero: Boolean
        get() = contentWidth >= 700f && (landscape || sizeClass == PadSizeClass.LARGE) && height >= 480f

    val settingsDualPane: Boolean
        get() = contentWidth >= 680f && height >= 420f

    val settingsDirectoryWidth: Float
        get() = when {
            contentWidth >= 1100f -> 280f
            contentWidth >= 820f -> 260f
            else -> 236f
        }

    val settingsDetailMaxWidth: Float get() = 720f
    val homeMaxWidth: Float get() = 1440f

    fun adaptiveColumns(
        availableWidth: Float = contentWidth,
        minItemWidth: Float = 156f,
        gap: Float = cardSpacing,
        minColumns: Int = 2,
        maxColumns: Int = 6,
    ): Int {
        val usable = availableWidth.coerceAtLeast(0f)
        if (usable <= 0f || minItemWidth <= 0f) return minColumns
        val count = floor(((usable + gap) / (minItemWidth + gap)).toDouble()).toInt()
        return count.coerceIn(minColumns, maxColumns)
    }
}

val LocalPadWindow = staticCompositionLocalOf { PadWindow() }

// IME resize reduces Compose height without changing the device's tablet/rail layout class.
internal fun padLayoutWindow(width: Float, contentHeight: Float, windowHeight: Float) =
    PadWindow(width, windowHeight.takeIf { it.isFinite() && it > 0f }?.coerceAtLeast(contentHeight) ?: contentHeight)
