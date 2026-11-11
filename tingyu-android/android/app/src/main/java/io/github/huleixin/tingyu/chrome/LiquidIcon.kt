package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidIcon.kt
/** Small state changes share one interruptible clock without affecting button hit bounds. */
@Composable internal fun <T> LiquidIcon(value:T, content:@Composable (T)->Unit) {
    val ms=if(LocalLiquidReduced.current)0 else 150
    AnimatedContent(value,transitionSpec={
        ((fadeIn(tween(ms))+scaleIn(tween(ms),initialScale=.92f)) togetherWith fadeOut(tween(ms))).using(null)
    },label="control-state") { content(it) }
}
