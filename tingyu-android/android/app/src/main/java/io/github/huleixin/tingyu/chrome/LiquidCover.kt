package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateDp
import androidx.compose.animation.core.snap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.util.UUID

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidCover.kt
// Saveable card identity distinguishes duplicates and survives route/scroll restoration.
internal data class CoverBinding(val key: String, val radius: Dp)
internal class CoverSelection {
    private data class Pending(val source: String, val action: String, val binding: CoverBinding)
    private var pending: Pending? = null
    private val destinations = linkedMapOf<String, CoverBinding?>()
    fun select(source: String, action: String, binding: CoverBinding) { pending = Pending(source, action, binding) }
    fun acceptAction(source: String, action: String) {
        if (pending?.source != source || pending?.action != action) pending = null
    }
    // Capture once per route entry. Data requests cannot steal a delayed detail's cover;
    // unrelated navigation cannot reuse a previous click. Keep nested Back bindings bounded.
    fun enter(route: String, back: Boolean): CoverBinding? {
        if (back) { pending = null; return destinations[route] }
        val binding = pending?.takeIf { it.source != route }?.binding
        pending = null
        destinations.remove(route)
        destinations[route] = binding
        while (destinations.size > 12) destinations.remove(destinations.keys.first())
        return binding
    }
}
internal class CoverSource(val key: String, private val radius: Dp, private val action: String, private val context: CoverScope?) {
    fun select() { context?.selection?.select(context.route, action, CoverBinding(key, radius)) }
}
@Composable internal fun rememberCoverSource(action: String, radius: Dp): CoverSource {
    val context=LocalCoverScope.current
    val id=rememberSaveable(action) { UUID.randomUUID().toString() }
    return remember(context, id, radius, action) { CoverSource("${context?.route}/$id", radius, action, context) }
}
internal data class CoverScope(val shared: SharedTransitionScope, val visibility: AnimatedVisibilityScope,
    val route: String, val selection: CoverSelection, val destination: CoverBinding? = null)
internal val LocalCoverScope = staticCompositionLocalOf<CoverScope?> { null }

@Composable internal fun Modifier.liquidCover(action: String, radius: Dp, destination: Boolean = false): Modifier {
    val context = LocalCoverScope.current ?: return clip(RoundedCornerShape(radius))
    if (LocalLiquidReduced.current) return clip(RoundedCornerShape(radius))
    val key = if (destination) context.destination?.key
        else action.takeIf { it.isNotBlank() }
    if (key == null) return clip(RoundedCornerShape(radius))
    val sourceRadius=remember(key) { if(destination) context.destination?.radius ?: radius else radius }
    val rounded by context.visibility.transition.animateDp(
        transitionSpec={tween(TingYuMotion.CoverMs,easing=TingYuMotion.Emphasized)}, label="cover-corner") {
        if ((it==EnterExitState.Visible)==destination) 12.dp else sourceRadius
    }
    val shape=RoundedCornerShape(rounded)
    return with(context.shared) {
        sharedElement(rememberSharedContentState(key), context.visibility,
            boundsTransform = { _, _ -> tween(TingYuMotion.CoverMs, easing = TingYuMotion.Emphasized) },
            clipInOverlayDuringTransition = OverlayClip(shape)).clip(shape)
    }
}

internal val LocalDetailReveal = compositionLocalOf<State<Float>> { mutableStateOf(1f) }
@Composable internal fun rememberDetailReveal(scope: AnimatedVisibilityScope): State<Float> {
    val reduced = LocalLiquidReduced.current
    return scope.transition.animateFloat(transitionSpec = { if (reduced) snap() else tween(TingYuMotion.CoverMs) }, label = "detail-content") {
        if (it == EnterExitState.Visible) 1f else 0f
    }
}
@Composable internal fun Modifier.liquidDetailContent(start: Float = .18f): Modifier {
    val progress = LocalDetailReveal.current
    return graphicsLayer {
        val p = liquidReveal(progress.value, start)
        alpha = p
        translationY = (1f - p) * 12f * density
    }
}
