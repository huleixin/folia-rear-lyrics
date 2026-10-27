package io.github.huleixin.tingyu.chrome

import android.os.Build
import android.os.SystemClock
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.zIndex
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import org.json.JSONObject
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt
// One stable composition and one GPU backdrop for all three surfaces; never snapshot WebView pixels.
class ComposeChromeHost(private val web: WebView, var listener: ChromeActionListener) {
    private val surfaces = mutableStateMapOf<String, ChromeSurface>()
    private val clocks = mutableStateMapOf<String, ChromeTimeline>()
    private val pages = mutableStateMapOf<String, NativePage>()
    var pageListener: NativePageActionListener? = null
    private val cache=NativeShellCache(web.context)
    private var destination by mutableStateOf("home")
    private var webOverlay by mutableStateOf(false)
    private var selectedTab by mutableIntStateOf(0)
    private var shellGeneration=0L
    private var shellRevision=0L
    private var firstHomeFrame by mutableStateOf(true)
    fun bootstrap() { if(host==null)attach();web.setBackgroundColor(android.graphics.Color.TRANSPARENT) }
    fun shell(value:JSONObject) {
        val generation=value.optLong("generation");val revision=value.optLong("revision")
        if(generation<shellGeneration||generation==shellGeneration&&revision<shellRevision)return
        shellGeneration=generation;shellRevision=revision
        val next=value.optString("route","home")
        require(next in setOf("home","collection","search","settings","stage","web"))
        destination=next;webOverlay=value.optBoolean("webOverlay");selectedTab=value.optInt("selectedTab").coerceIn(0,1)
        if(next!="home")firstHomeFrame=false
    }
    private val frameOrder = ChromeFrameOrder()
    private var active by mutableStateOf(true)
    private var host: ComposeView? = null
    private var parent: ViewGroup? = null
    private var params: ViewGroup.LayoutParams? = null
    private var index = 0
    private var updates = 0L
    private val savedPageKeys=LinkedHashSet<String>()
    fun status() = JSONObject().put("supported", Build.VERSION.SDK_INT >= 24).put("engine", "compose-backdrop-1.0.6")
        .put("mounted",host != null).put("active",active).put("surfaces",surfaces.values.count { it.enabled && active }).put("updates",updates).put("pages",Build.VERSION.SDK_INT >= 24)
    fun pageUpdate(value: JSONObject, reply: (JSONObject) -> Unit) {
        check(Build.VERSION.SDK_INT >= 24)
        val next=NativePage.parse(value);val id="page:${next.id}"
        if(!frameOrder.accept(id,next.session,next.generation,next.revision)){reply(status().put("accepted",false));return}
        if(next.enabled&&host==null)attach()
        pages[next.id]=next
        if(next.enabled)cache.page(value)
        reply(status().put("accepted",true).put("session",next.session))
    }
    fun pageRemove(id: String, session: String) {
        frameOrder.retire("page:$id",session)
        if(pages[id]?.session==session)pages.remove(id)
    }
    fun update(value: JSONObject, reply: (JSONObject) -> Unit) {
        check(Build.VERSION.SDK_INT >= 24)
        val next = ChromeSurface.parse(value)
        if (!frameOrder.accept(next.id,next.session,next.generation,next.revision)) { reply(status().put("accepted",false)); return }
        if (next.enabled && host == null) attach()
        surfaces[next.id] = next
        clocks[next.id] = ChromeTimeline(next.position,next.duration,next.playing,SystemClock.elapsedRealtime())
        updates++
        if(next.enabled)cache.chrome(value)
        reply(status().put("session",next.session).put("accepted",true))
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
        val visible = if (active&&!webOverlay) surfaces.values.filter {
            it.enabled && it.rect.width > 0 && it.rect.height > 0 &&
                (if(it.id=="stage")destination=="stage" else destination in setOf("home","collection"))
        } else emptyList()
        val page=if(active)pages[destination]?.takeIf{it.enabled&&(destination!="home"||it.key.startsWith(if(selectedTab==1)"library:"else"home:"))}else null
        val savedPages=rememberSaveableStateHolder()
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val density=LocalDensity.current;val width=maxWidth.value;val height=maxHeight.value
            val safeTop=WindowInsets.statusBars.getTop(density)/density.density
            val safeBottom=WindowInsets.navigationBars.getBottom(density)/density.density
            val bootId=if(destination=="home"&&selectedTab==1)"library"else if(destination in setOf("home","collection","search","settings"))destination else "home"
            val bootPage=remember(bootId,width,height,safeTop,safeBottom){cache.page(bootId,width,height,safeTop).copy(safeBottom=safeBottom)}
            val seedHome=active&&firstHomeFrame&&destination=="home"&&!webOverlay
            Box(Modifier.fillMaxSize().then(if((visible.isNotEmpty()||seedHome)&&Build.VERSION.SDK_INT>=31)Modifier.layerBackdrop(backdrop).graphicsLayer{compositingStrategy=CompositingStrategy.Offscreen}else Modifier)) {
                AndroidView(factory = { web }, modifier = Modifier.fillMaxSize().zIndex(if(webOverlay||destination in setOf("stage","web"))2f else 0f))
                if(active&&page==null&&destination!="stage")NativePageView(bootPage,Modifier.fillMaxSize().zIndex(1f)){_,_,_->}
                if(page!=null) {
                    DisposableEffect(page.key){
                        savedPageKeys.remove(page.key);savedPageKeys.add(page.key)
                        while(savedPageKeys.size>12){val oldest=savedPageKeys.first();savedPageKeys.remove(oldest);savedPages.removeState(oldest)}
                        onDispose{}
                    }
                    val density=LocalDensity.current;val scale=web.width/page.viewport
                    if(scale.isFinite()&&scale>0) savedPages.SaveableStateProvider(page.key) {
                        val placement=Modifier.zIndex(1f).offset{IntOffset((page.rect.left*scale).roundToInt(),(page.rect.top*scale).roundToInt())}
                            .size(with(density){(page.rect.width*scale).toDp()},with(density){(page.rect.height*scale).toDp()})
                        NativePageView(page,placement,scale){action,text,value->
                            val current=pages[page.id]
                            if(active&&current?.enabled==true&&current.session==page.session&&current.key==page.key&&current.revision==page.revision)
                                pageListener?.onAction(page.id,page.session,page.key,action,text,value)
                        }
                    }
                }
            }
            if(active&&firstHomeFrame&&destination=="home"&&!webOverlay) {
                for(id in listOf("nav","mini"))if(!surfaces.containsKey(id)){
                    val seed=remember(id,width,height,selectedTab,safeBottom,safeTop){cache.chrome(id,width,height,safeBottom,safeTop).let{if(id=="nav")it.copy(selected=selectedTab)else it}}
                    val placement=Modifier.offset{IntOffset(with(density){seed.rect.left.dp.roundToPx()},with(density){seed.rect.top.dp.roundToPx()})}
                        .size(seed.rect.width.dp,seed.rect.height.dp)
                    if(id=="nav")ChromeNavigation(seed,backdrop,placement){_,_->}else ChromeMiniPlayer(seed,null,backdrop,placement){_,_->}
                }
            }
            visible.forEach { surface -> key(surface.id,surface.session) {
                val scale = web.width / surface.viewportWidth
                val rect = surface.rect
                if (scale.isFinite() && scale > 0) {
                    val placement = Modifier.offset { IntOffset((rect.left*scale).roundToInt(),(rect.top*scale).roundToInt()) }
                        .size(with(density){(rect.width*scale).toDp()},with(density){(rect.height*scale).toDp()})
                        .graphicsLayer { alpha = rect.alpha }
                    val actions: (String,Double)->Unit = { action,value ->
                        if (active && surfaces[surface.id]?.enabled==true && surfaces[surface.id]?.session == surface.session && (action !in setOf("next","previous","toggle","seek") || surfaces[surface.id]?.trackKey == surface.trackKey)) {
                            // Dismiss home chrome on the UI thread before the JS route transition starts.
                            if (surface.id=="mini" && action=="openStage") {
                                destination="stage";firstHomeFrame=false
                                for (id in listOf("nav","mini")) surfaces[id]?.let { surfaces[id]=it.copy(enabled=false) }
                            }
                            if(surface.id=="nav"&&action=="navigate"){
                                destination=when(value.toInt()){2->"search";3->"settings";else->"home"}
                                if(value.toInt() in 0..1)selectedTab=value.toInt()
                            }
                            listener.onAction(surface.id,surface.session,action,value)
                        }
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
        active = false; surfaces.clear(); clocks.clear();pages.clear()
        compose.disposeComposition()
        (web.parent as? ViewGroup)?.removeView(web)
        (compose.parent as? ViewGroup)?.removeView(compose)
        parent?.addView(web,index.coerceAtMost(parent?.childCount ?: 0),params)
        host = null; parent = null
    }
}
