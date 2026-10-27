package io.github.huleixin.tingyu.chrome

import android.os.Build
import android.os.SystemClock
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.viewinterop.AndroidView
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import org.json.JSONObject
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt
// One stable composition and one GPU backdrop for all three surfaces; never snapshot WebView pixels.
class ComposeChromeHost(private val web: WebView, private val listener: ChromeActionListener) {
    private val surfaces = mutableStateMapOf<String, ChromeSurface>()
    private val clocks = mutableStateMapOf<String, ChromeTimeline>()
    private val frameOrder = ChromeFrameOrder()
    private var active by mutableStateOf(true)
    private var host: ComposeView? = null
    private var parent: ViewGroup? = null
    private var params: ViewGroup.LayoutParams? = null
    private var index = 0
    private var updates = 0L
    fun status() = JSONObject().put("supported", Build.VERSION.SDK_INT >= 31).put("engine", "compose-backdrop-1.0.6")
        .put("mounted",host != null).put("active",active).put("surfaces",surfaces.values.count { it.enabled && active }).put("updates",updates)
    fun update(value: JSONObject): JSONObject {
        check(Build.VERSION.SDK_INT >= 31) { "Native chrome needs Android 12+" }
        val next = ChromeSurface.parse(value)
        if (!frameOrder.accept(next.id,next.session,next.generation,next.revision)) return status()
        if (next.enabled && host == null) attach()
        surfaces[next.id] = next
        clocks[next.id] = ChromeTimeline(next.position,next.duration,next.playing,SystemClock.elapsedRealtime())
        updates++
        return status().put("session",next.session).put("accepted",true)
    }
    fun clock(value: JSONObject) {
        val current = surfaces[value.optString("id")] ?: return
        if (current.session != value.optString("session") || current.trackKey != value.optString("trackKey")) return
        val position = value.optDouble("position",0.0)
        if (position.isFinite()) clocks[current.id] = ChromeTimeline(position.coerceAtLeast(0.0), current.duration,current.playing,SystemClock.elapsedRealtime())
    }
    fun remove(id: String, session: String) {
        frameOrder.retire(id,session)
        if (surfaces[id]?.session == session) { surfaces.remove(id); clocks.remove(id) }
    }
    fun suspend() { active = false }
    fun resume() { active = true }
    private fun attach() {
        val original = web.parent as? ViewGroup ?: error("WebView has no parent")
        parent = original; params = web.layoutParams; index = original.indexOfChild(web)
        original.removeView(web)
        val compose = ComposeView(web.context)
        compose.setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        original.addView(compose,index,params)
        host = compose
        compose.setContent { Scene() }
    }
    @Composable private fun Scene() {
        val backdrop = rememberLayerBackdrop()
        val visible = if (active) surfaces.values.filter { it.enabled && it.rect.width > 0 && it.rect.height > 0 } else emptyList()
        Box(Modifier.fillMaxSize()) {
            AndroidView(factory = { web }, modifier = Modifier.fillMaxSize()
                .then(if (visible.isNotEmpty()) Modifier.layerBackdrop(backdrop).graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen } else Modifier))
            val density = LocalDensity.current
            visible.forEach { surface -> key(surface.id,surface.session) {
                val scale = web.width / surface.viewportWidth
                val rect = surface.rect
                if (scale.isFinite() && scale > 0) {
                    val placement = Modifier.offset { IntOffset((rect.left*scale).roundToInt(),(rect.top*scale).roundToInt()) }
                        .size(with(density){(rect.width*scale).toDp()},with(density){(rect.height*scale).toDp()})
                        .graphicsLayer { alpha = rect.alpha }
                    val actions: (String,Double)->Unit = { action,value ->
                        if (active && surfaces[surface.id]?.session == surface.session && (action !in setOf("next","previous","toggle","seek") || surfaces[surface.id]?.trackKey == surface.trackKey)) listener.onAction(surface.id,surface.session,action,value)
                    }
                    val interactivePlacement = placement.chromeInteraction(actions)
                    when(surface.id) {
                        "nav" -> ChromeNavigation(surface,backdrop,interactivePlacement,actions)
                        "mini" -> ChromeMiniPlayer(surface,clocks[surface.id],backdrop,interactivePlacement,actions)
                        "stage" -> ChromeStagePlayer(surface,clocks[surface.id],backdrop,interactivePlacement,actions)
                    }
                }
            } }
        }
    }
    fun destroy() {
        val compose = host ?: return
        active = false; surfaces.clear(); clocks.clear()
        compose.disposeComposition()
        (web.parent as? ViewGroup)?.removeView(web)
        (compose.parent as? ViewGroup)?.removeView(compose)
        parent?.addView(web,index.coerceAtMost(parent?.childCount ?: 0),params)
        host = null; parent = null
    }
}
