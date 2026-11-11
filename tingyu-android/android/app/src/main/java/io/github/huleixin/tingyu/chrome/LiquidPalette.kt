package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidPalette.kt
/** Read animated colors only at their consumers; keep glass and page identities intact. */
@Composable internal fun rememberLiquidPalette(light: Boolean, style: String, reduced: Boolean): InterfacePalette {
    val progress = remember { Animatable(1f) }
    var displayed by remember { mutableStateOf(InterfacePalette(light, style)) }
    LaunchedEffect(light, style, reduced) {
        val target = InterfacePalette(light, style)
        if (reduced || displayed.snapshotColors() == target.snapshotColors() && displayed.snapshotGradients() == target.snapshotGradients()) { displayed = target; progress.snapTo(1f); return@LaunchedEffect }
        // Snapshot the currently visible blend before cancelling/reversing a theme change.
        val from = displayed.snapshotColors(); val to = target.snapshotColors()
        val fromGradients = displayed.snapshotGradients(); val toGradients = target.snapshotGradients()
        progress.snapTo(0f)
        displayed = InterfacePalette(light, style,
            { i -> lerp(from[i], to[i], progress.value) },
            { i -> blendGradient(fromGradients[i], toGradients[i], progress.value) })
        progress.animateTo(1f, tween(TingYuMotion.ThemeMs, easing = TingYuMotion.Emphasized))
        displayed = target
    }
    return displayed
}

/** Common uniform stops preserve both original piecewise gradients, including interrupted blends. */
internal fun blendGradient(from: List<Color>, to: List<Color>, fraction: Float): List<Color> {
    require(from.isNotEmpty() && to.isNotEmpty())
    fun gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)
    val a = (from.size - 1).coerceAtLeast(1)
    val b = (to.size - 1).coerceAtLeast(1)
    val segments = a / gcd(a, b) * b
    fun sample(colors: List<Color>, position: Float): Color {
        val at = position * (colors.size - 1)
        val left = at.toInt().coerceIn(0, colors.lastIndex)
        val right = colors[(left + 1).coerceAtMost(colors.lastIndex)]
        val first = colors[left]; val t = at - left
        if (t == 0f) return first
        fun channel(a: Float, b: Float) = a + (b - a) * t
        return Color(channel(first.red, right.red), channel(first.green, right.green),
            channel(first.blue, right.blue), channel(first.alpha, right.alpha))
    }
    return List(segments + 1) { i ->
        val at = i.toFloat() / segments
        val source = sample(from, at); val target = sample(to, at)
        when { fraction <= 0f -> source; fraction >= 1f -> target; else -> lerp(source, target, fraction) }
    }
}
