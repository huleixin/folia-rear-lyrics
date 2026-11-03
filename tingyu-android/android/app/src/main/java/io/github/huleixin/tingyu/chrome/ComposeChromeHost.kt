package io.github.huleixin.tingyu.chrome

import android.os.Build
import android.os.SystemClock
import android.view.ViewGroup
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
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
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.ui.Modifier
import androidx.compose.ui.zIndex
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.input.pointer.pointerInput
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import org.json.JSONObject
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt
// Stable WebView identity; native pages and the live stage use separate GPU backdrop sources.
class ComposeChromeHost(private val web: WebView, var listener: ChromeActionListener) {
    private var appearanceMode by mutableStateOf(InterfaceAppearance.mode(web.context))
    fun setAppearance(mode:String){InterfaceAppearance.save(web.context,mode);appearanceMode=mode}
    private val graphics=GraphicsProbe(web)
    private val webSamplingLayer=WebSamplingLayer(web)
    private var graphicsMarker:(()->Unit)?=null
    fun setGraphicsMarkerListener(listener:()->Unit){graphicsMarker=listener}
    fun graphicsSnapshot()=graphics.snapshot(destination,webOverlay)
    fun graphicsConfigure(mode:String)=graphics.configure(mode)
    private val surfaces = mutableStateMapOf<String, ChromeSurface>()
    private val clocks = mutableStateMapOf<String, ChromeTimeline>()
    private val pages = mutableStateMapOf<String, NativePage>()
    var pageListener: NativePageActionListener? = null
    // 「支持与交流」sheets: opened from settings page actions (support:coffee / support:group).
    private var sleepMenuOpen by mutableStateOf(false)
    private var sleepAnchor by mutableStateOf(androidx.compose.ui.geometry.Rect.Zero)
    private var supportSheet by mutableStateOf<String?>(null)
    private var supportCopyJson by mutableStateOf<String?>(null)
    private val cache=NativeShellCache(web.context)
    private val retained=NativePageRetention()
    private val routeMotion=NativeRouteMotion()
    private val startupNavigation=PendingStartupNavigation()
    private var startupSelected by mutableStateOf<Int?>(null)
    private var startupToast:android.widget.Toast?=null
    private var navigationActionSerial=0L
    private fun clearStartupNavigation(){startupNavigation.clear();startupSelected=null;startupToast?.cancel();startupToast=null}

    private val stageExit=NativeStageExit()
    fun collapseStage(reply:()->Unit){if(destination!="stage"||webOverlay){reply();return};stageExit.begin(retained.lastBrowsing(),reply)}
    private var presented by mutableStateOf<NativePage?>(null)
    private var pageTarget=""
    private var entryKey=""
    private var navigation=""
    private var backwards by mutableStateOf(false)
    private var reducedMotion by mutableStateOf(false)
    private var motionKey=""
    private var nativeTop by mutableFloatStateOf(-1f)
    private var nativeBottom by mutableFloatStateOf(-1f)
    fun setSafeInsets(top:Float,bottom:Float){nativeTop=top.coerceAtLeast(0f);nativeBottom=bottom.coerceAtLeast(0f)}
    private fun recordMotion(key:String){if(motionKey!=key){motionKey=key;backwards=routeMotion.visit(key)}}
    private fun resolvePage(){
        if(destination in setOf("stage","web")){
            recordMotion(destination);presented=null;return
        }
        retained.find(destination,selectedTab,entryKey.ifEmpty{pageTarget})?.let{next->
            recordMotion(next.key)
            presented=next
        }
        // A first visit keeps its outgoing native composition until the incoming
        // model arrives; never replay a boot/index screen during ordinary navigation.
    }
    private var destination by mutableStateOf("home")
    private var webOverlay by mutableStateOf(false)
    private var selectedTab by mutableIntStateOf(0)
    private var playlistDetail by mutableStateOf(false)
    private val routeFence=NativeRouteFence()
    private var playerPresentation by mutableStateOf("stage")
    private var pendingStageEntry by mutableStateOf(false)
    private var stageEntryRequest=0L
    private var firstHomeFrame by mutableStateOf(true)
    private var webStageBackground: Boolean? = null
    // A stage is a full-window destination, not a transparent preview island. Clearing its
    // WebView backing prevents native outgoing pages surviving behind canvas damage regions.
    private fun syncWebBackground() {
        val stage = destination == "stage"
        if (webStageBackground == stage) return
        webStageBackground = stage
        web.setBackgroundColor(if (stage) android.graphics.Color.rgb(3,10,9) else android.graphics.Color.TRANSPARENT)
        web.invalidate()
    }
    fun bootstrap() { NativeArtworkCache.install(web.context);if(host==null)attach();syncWebBackground() }
    fun shell(value:JSONObject) {
        val generation=value.optLong("generation");val revision=value.optLong("revision")
        val ticket=routeFence.request(generation,revision)?:return
        stageEntryRequest++
        val next=value.optString("route","home")
        require(next in setOf("home","collection","search","settings","stage","web"))
        if(next=="stage"&&destination!="stage") {
            pendingStageEntry=true
            // The JS DOM commit precedes this request. Keep the outgoing native page in
            // place until Chromium can draw that commit, instead of exposing its old frame.
            web.postVisualStateCallback(revision,object:WebView.VisualStateCallback(){
                override fun onComplete(requestId:Long){if(routeFence.current(ticket))commitShell(value)}
            })
        } else commitShell(value)
    }
    private fun commitShell(value:JSONObject) {
        navigationTrace("route-native-commit")
        pendingStageEntry=false;stageEntryRequest++
        val next=value.optString("route","home")
        if(next!="stage")stageExit.clear()
        else if(destination!="stage")stageExit.suppressReturnMotion=false
        require(next in setOf("home","collection","search","settings","stage","web"))
        val routeChanged=next!=destination||value.optString("pageTarget")!=pageTarget||value.optString("entryKey")!=entryKey||value.optInt("selectedTab").coerceIn(0,1)!=selectedTab
        playerPresentation=if(value.optString("playerPresentation")=="minimal")"minimal"else"stage"
        destination=next;webOverlay=value.optBoolean("webOverlay");selectedTab=value.optInt("selectedTab").coerceIn(0,1)
        syncWebBackground()
        pageTarget=value.optString("pageTarget");entryKey=value.optString("entryKey");reducedMotion=value.optBoolean("reducedMotion")
        navigation=value.optString("navigation")
        playlistDetail=value.optBoolean("playlistDetail")
        if(routeChanged||webOverlay)sleepMenuOpen=false
        if(routeChanged||presented==null)resolvePage()
        if(next!="home")firstHomeFrame=false
    }
    private val frameOrder = ChromeFrameOrder()
    private var active by mutableStateOf(true)
    private var focused by mutableStateOf(true)
    fun windowFocusChanged(value:Boolean){focused=value;if(!value)sleepMenuOpen=false;host?.invalidate()}
    fun requiresWebBack():Boolean=pendingStageEntry||destination!="home"||selectedTab!=0||webOverlay||stageExit.active
    private var host: ComposeView? = null
    private var parent: ViewGroup? = null
    private var params: ViewGroup.LayoutParams? = null
    private var index = 0
    private var updates = 0L
    private val savedPageKeys=LinkedHashSet<String>()
    fun status() = JSONObject().put("supported", Build.VERSION.SDK_INT >= 24).put("engine", "compose-backdrop-1.0.6")
        .put("mounted",host != null).put("active",active).put("surfaces",surfaces.values.count { it.enabled && active }).put("updates",updates).put("pages",Build.VERSION.SDK_INT >= 24)
    fun pageUpdate(value: PreparedNativePage, reply: (JSONObject) -> Unit) {
        check(Build.VERSION.SDK_INT >= 24)
        val next=value.page;val id="page:${next.id}"
        if(!frameOrder.accept(id,next.session,next.generation,next.revision)){reply(status().put("accepted",false));return}
        if(next.enabled&&host==null)attach()
        pages[next.id]=next
        // Do not poison retained geometry with an enabled packet from a route being
        // retired (e.g. the home DOM acquiring the stage's safe-area coordinates).
        val ownsPresentation=retained.updateForRoute(next,destination,selectedTab,pageTarget,value.navigation,navigation)
        if(ownsPresentation){
            navigationTrace("page-native-commit:${next.id}")
            recordMotion(next.key)
            presented=next
        }
        if(ownsPresentation)cache.commit(value.cache)
        reply(status().put("accepted",true).put("session",next.session))
    }
    fun pageRemove(id: String, session: String) {
        frameOrder.retire("page:$id",session)
        if(pages[id]?.session==session)pages.remove(id)
    }
    fun update(value: PreparedChromeSurface, reply: (JSONObject) -> Unit) {
        check(Build.VERSION.SDK_INT >= 24)
        val next = value.surface
        if (!frameOrder.accept(next.id,next.session,next.generation,next.revision)) { reply(status().put("accepted",false)); return }
        if (next.enabled && host == null) attach()
        surfaces[next.id] = next
        clocks[next.id] = ChromeTimeline(next.position,next.duration,next.playing,SystemClock.elapsedRealtime())
        updates++
        cache.commit(value.cache)
        reply(status().put("session",next.session).put("accepted",true).put("pendingNavigation",startupNavigation.selected!=null))
        if(next.enabled&&next.id=="nav"&&!next.disabled){
            NavigationTiming.mark("nav-live-surface-accepted")
            val pending=startupNavigation.take()
            if(pending!=null){val serial=navigationActionSerial
                web.post{
                    if(serial==navigationActionSerial&&active&&surfaces["nav"]?.session==next.session&&surfaces["nav"]?.enabled==true){
                        NavigationTiming.mark("startup-navigation-replayed")
                        listener.onAction("nav",next.session,"navigate",pending.toDouble())
                    }
                    clearStartupNavigation()
                }
            }
        }
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
    fun suspend() { navigationActionSerial++;clearStartupNavigation();active = false;sleepMenuOpen=false;stageExit.clear() }
    fun resume() { active = true }
    private fun attach() {
        val original = web.parent as? ViewGroup ?: error("WebView has no parent")
        parent = original; params = web.layoutParams; index = original.indexOfChild(web)
        original.removeView(web)
        val compose = ComposeView(web.context)
        compose.setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        original.addView(compose,index,params)
        host = compose
        if(graphics.enabled)graphics.compositions++
        compose.setContent { Scene() }
    }
    @Composable private fun Scene() {
        val configuration=androidx.compose.ui.platform.LocalConfiguration.current
        val interfaceLight=InterfaceAppearance.resolve(appearanceMode,(configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_NO)
        val palette=remember(interfaceLight){InterfacePalette(interfaceLight)}
        val activity=web.context as? android.app.Activity
        DisposableEffect(interfaceLight,destination,surfaces["stage"]?.light) {activity?.let{InterfaceAppearance.route(it,destination=="stage",surfaces["stage"]?.light?:false)};onDispose{}}
        val sleepUi=rememberMiniSleepUi(active&&focused)
        val backdrop = rememberLayerBackdrop()
        val stageBackdrop = rememberLayerBackdrop()
        val exitProgress=rememberStageExitProgress(stageExit,reducedMotion)
        val visible = if (!webOverlay&&!pendingStageEntry) surfaces.values.filter {
            it.enabled && NativeFooterLayout.visible(it.id,destination,playlistDetail,it.viewportWidth,
                pageTarget.startsWith("collection:artist:")) &&
                (it.id!="stage"||it.rect.width>0&&it.rect.height>0)
        } else emptyList()
        // Reuse the route's one retained composition beneath the collapsing stage.
        // Creating a second underlay would duplicate saveable keys during a quick Back.
        val page=presented?:if(stageExit.active)stageExit.returning else null
        val legacySampling=graphics.enabled
        val sampleWeb=ChromeSamplingPolicy.webReader(destination,stageExit.active,webOverlay,active,focused,visible.size)
        SideEffect{if(!legacySampling)webSamplingLayer.update(Build.VERSION.SDK_INT>=31&&sampleWeb)}
        val savedPages=rememberSaveableStateHolder()
        BoxWithConstraints(Modifier.fillMaxSize()) {
            CompositionLocalProvider(LocalChromeRendering provides (active&&focused),LocalInterfacePalette provides palette) {
            val density=LocalDensity.current;val width=maxWidth.value;val height=maxHeight.value
            val safeTop=if(nativeTop>=0)nativeTop else WindowInsets.statusBars.getTop(density)/density.density
            val safeBottom=if(nativeBottom>=0)nativeBottom else WindowInsets.navigationBars.getBottom(density)/density.density
            val bootId=if(destination=="home"&&selectedTab==1)"library"else if(destination in setOf("home","collection","search","settings"))destination else "home"
            val bootPage=remember(bootId,width,height,safeTop,safeBottom){cache.page(bootId,width,height,safeTop).copy(safeBottom=safeBottom)}
            // Historical diagnostic groups retain the original whole-scene sampling path.
            // Normal builds exclude WebView from native-page sampling and gate stage recording.
            Box(Modifier.fillMaxSize().then(if(legacySampling&&Build.VERSION.SDK_INT>=31&&graphics.sampleStage(destination))Modifier.layerBackdrop(backdrop)else Modifier)) {
                // A reproduces the unverified 1.3.32 isolation hypothesis; a TextureView
                // workaround is not evidence that this fixes WebView. C31 removes only
                // this modifier. Neither path changes lyric effects or global frame rate.
                if(graphics.enabled&&graphics.mode!=GraphicsProbeMode.C31)DisposableEffect(Unit){graphics.layerMounts++;onDispose{graphics.layerDisposals++}}
                // This wrapper/AndroidView keeps the same identity across routes and auto-hide.
                // A live reader uses the tested C2 texture only for the reader's lifetime.
                Box(Modifier.fillMaxSize().zIndex(if(destination=="stage"||webOverlay||stageExit.active)2f else 0f)
                    .then(if(!legacySampling&&Build.VERSION.SDK_INT>=31&&sampleWeb)Modifier.layerBackdrop(stageBackdrop)else Modifier)) {
                AndroidView(factory = { web }, modifier = Modifier.fillMaxSize()
                    .then(if(legacySampling&&graphics.mode!=GraphicsProbeMode.C31)Modifier.graphicsLayer { alpha = if(Build.VERSION.SDK_INT>=31).999f else 1f }else Modifier)
                    .stageExitTransform(stageExit,exitProgress,webOwnsRoutePixels(destination,webOverlay,stageExit.active))
                    .playerEntryTransform(destination=="stage"&&playerPresentation=="minimal",reducedMotion,height*density.density))
                }
                Box(Modifier.fillMaxSize().zIndex(1f).then(if(!legacySampling&&Build.VERSION.SDK_INT>=31)Modifier.layerBackdrop(backdrop)else Modifier)) {
                if(page==null&&firstHomeFrame&&destination=="home")NativePageView(bootPage,Modifier.fillMaxSize().zIndex(1f)){_,_,_->}
                // One route-level animation, with no HTML exit animation or full-screen blur.
                // Data/clock revisions keep the same content key and do not restart it.
                AnimatedContent(if(destination=="stage"&&!stageExit.active)null else page,modifier=Modifier.fillMaxSize().zIndex(1f),contentKey={it?.key?:"stage"},
                    transitionSpec={
                        val from=initialState?.key?:if(firstHomeFrame)""else"stage"
                        val to=targetState?.key?:"stage"
                        val ease=CubicBezierEasing(.16f,1f,.3f,1f)
                        val travel=with(density){28.dp.roundToPx()}
                        val tabTravel=with(density){8.dp.roundToPx()}
                        val position=tween<IntOffset>(240,easing=ease)
                        when(NativeMotionPolicy.kind(from,to,backwards,!focused||!active||reducedMotion||stageExit.suppressReturnMotion&&from=="stage")){
                            NativeMotionKind.NONE->EnterTransition.None togetherWith ExitTransition.None
                            NativeMotionKind.STAGE->fadeIn(tween(140,easing=ease)) togetherWith fadeOut(tween(if(to=="stage"&&playerPresentation=="minimal")1 else 100,delayMillis=if(to=="stage"&&playerPresentation=="minimal")420 else 0,easing=ease))
                            NativeMotionKind.TAB->(slideInHorizontally(tween(200,easing=ease)){tabTravel}+fadeIn(tween(200,easing=ease))) togetherWith (slideOutHorizontally(tween(180,easing=ease)){-tabTravel}+fadeOut(tween(180,easing=ease)))
                            NativeMotionKind.PUSH->(slideInHorizontally(position){travel}+fadeIn(tween(240,easing=ease))) togetherWith (slideOutHorizontally(position){-travel/3}+fadeOut(tween(200,easing=ease)))
                            NativeMotionKind.POP->((slideInHorizontally(tween(220,easing=ease)){-travel/3}+fadeIn(tween(220,easing=ease))) togetherWith (slideOutHorizontally(tween(220,easing=ease)){travel}+fadeOut(tween(200,easing=ease)))).apply{targetContentZIndex=-1f}
                        }
                    },label="native-route") { shown ->
                if(shown!=null) {
                    LaunchedEffect(shown.key){withFrameNanos{navigationTrace("compose-frame-boundary")}}
                    DisposableEffect(shown.key){
                        savedPageKeys.remove(shown.key);savedPageKeys.add(shown.key)
                        while(savedPageKeys.size>12){val oldest=savedPageKeys.first();savedPageKeys.remove(oldest);savedPages.removeState(oldest)}
                        onDispose{}
                    }
                    val density=LocalDensity.current;val scale=web.width/shown.viewport
                    if(scale.isFinite()&&scale>0) savedPages.SaveableStateProvider(shown.key) {
                        val placement=Modifier.offset{IntOffset((shown.rect.left*scale).roundToInt(),(shown.rect.top*scale).roundToInt())}
                            .size(with(density){(shown.rect.width*scale).toDp()},with(density){(shown.rect.height*scale).toDp()})
                        NativePageView(shown,placement,scale){action,text,value->
                            // Support sheets are fully native: intercept before the JS action bus.
                            if(action.startsWith("support:")){
                                supportCopyJson=pages[shown.id]?.sections?.firstOrNull{it.id=="support"}?.text
                                supportSheet=action.removePrefix("support:");return@NativePageView
                            }
                            val current=pages[shown.id]
                            if(active&&destination==shown.id&&presented?.key==shown.key&&current?.enabled==true&&pageInteractionIsCurrent(current,shown))
                                pageListener?.onAction(shown.id,shown.session,shown.key,action,text,value)
                        }
                    }
                }
                }
                }
            }
            if(firstHomeFrame&&destination=="home"&&!webOverlay) {
                LaunchedEffect(Unit){withFrameNanos{NavigationTiming.mark("cached-shell-frame-boundary")}}
                for(id in listOf("nav","mini"))if(!surfaces.containsKey(id)){
                    val seed=remember(id,width,height,selectedTab,safeBottom,safeTop){cache.chrome(id,width,height,safeBottom,safeTop).let{if(id=="nav")it.copy(selected=selectedTab)else it}}
                    val placement=Modifier.offset{IntOffset(with(density){seed.rect.left.dp.roundToPx()},with(density){seed.rect.top.dp.roundToPx()})}
                        .size(seed.rect.width.dp,seed.rect.height.dp)
                    if(id=="nav")ChromeNavigation(seed.interfacePaint(interfaceLight).copy(disabled=false,selected=startupSelected?:selectedTab),backdrop,placement.chromeInteraction{action,_->
                        if(action=="interactionStart")NavigationTiming.markGesture("startup-nav-press",-1.0)
                        else if(action=="interactionEnd")NavigationTiming.markGesture("startup-nav-release",-1.0)
                    }){action,value->
                        if(active&&action=="navigate"&&startupNavigation.request(value.toInt())){
                            navigationActionSerial++;startupSelected=value.toInt();NavigationTiming.mark("startup-navigation-requested")
                            startupToast?.cancel();startupToast=android.widget.Toast.makeText(web.context,"正在准备${listOf("推荐","资料库","搜索","设置")[value.toInt()]}，就绪后自动打开",android.widget.Toast.LENGTH_SHORT).also{it.show()}
                        }
                    }else ChromeMiniPlayer(seed.interfacePaint(interfaceLight),null,backdrop,placement,sleepUi,{sleepAnchor=it}){name,_->if(name=="sleep")sleepMenuOpen=!sleepMenuOpen}
                }
            }
            visible.forEach { original -> key(original.id,original.session) {
                val surface=remember(original,interfaceLight){original.interfacePaint(interfaceLight)}
                val scale = web.width / surface.viewportWidth
                if (scale.isFinite() && scale > 0) {
                    val rect=NativeFooterLayout.rect(surface.id,
                        width*density.density/scale,height*density.density/scale,safeTop*density.density/scale,safeBottom*density.density/scale,playlistDetail)
                    val y=rect.top
                    val animatedY by animateFloatAsState(y,if(surface.id=="stage"||!focused||!active||surface.reducedMotion||reducedMotion)snap()else spring(dampingRatio=NativeMotionPolicy.Damping,stiffness=NativeMotionPolicy.Stiffness),label="native-chrome-y")
                    val placement = Modifier.offset { IntOffset((rect.left*scale).roundToInt(),(animatedY*scale).roundToInt()) }
                        .size(with(density){(rect.width*scale).toDp()},with(density){(rect.height*scale).toDp()})
                        .graphicsLayer { alpha = rect.alpha }
                    val actions: (String,Double)->Unit = actions@ { action,value ->
                        if (active && surfaces[surface.id]?.enabled==true && surfaces[surface.id]?.session == surface.session && (action !in setOf("next","previous","toggle","seek") || surfaces[surface.id]?.trackKey == surface.trackKey)) {
                            if(surface.id=="mini"&&action=="sleep"){sleepMenuOpen=!sleepMenuOpen;return@actions}
                            if(action=="navigate"||action=="openStage"||action=="queue"||action=="quality")sleepMenuOpen=false
                            // Dismiss home chrome on the UI thread before the JS route transition starts.
                            if (surface.id=="mini" && action=="openStage") {
                                pendingStageEntry=true
                                val request=++stageEntryRequest
                                // Hide the footer immediately, but do not promote an old WebView
                                // frame over the outgoing native page before React commits stage.
                                web.postDelayed({if(request==stageEntryRequest&&destination!="stage")pendingStageEntry=false},900)
                            }
                            if(surface.id=="nav"&&action=="navigate"){
                                navigationActionSerial++;clearStartupNavigation()
                                destination=when(value.toInt()){2->"search";3->"settings";else->"home"}
                                syncWebBackground()
                                if(value.toInt() in 0..1)selectedTab=value.toInt()
                                pageTarget=if(destination=="settings")"settings:index"else"";entryKey=pageTarget;resolvePage()
                            }
                            listener.onAction(surface.id,surface.session,action,value)
                        }
                    }
                    val interactivePlacement = placement.chromeInteraction(actions)
                    when(surface.id) {
                        "nav" -> ChromeNavigation(surface,backdrop,interactivePlacement,actions)
                        "mini" -> ChromeMiniPlayer(surface,clocks[surface.id],backdrop,interactivePlacement,sleepUi,{sleepAnchor=it},actions)
                        "stage" -> Box(Modifier.fillMaxSize().stageExitTransform(stageExit,exitProgress).playerDetourTransform(surface.playerTransition,reducedMotion||surface.reducedMotion,height*density.density)){ChromeStagePlayer(surface,clocks[surface.id],if(legacySampling)backdrop else stageBackdrop,interactivePlacement,actions)}
                    }
                }
            } }
            if(stageExit.active)Box(Modifier.fillMaxSize().zIndex(4f).pointerInput(Unit){awaitPointerEventScope{while(true)awaitPointerEvent().changes.forEach{it.consume()}}})
            if(graphics.enabled)Text("N · 记闪烁",color=Color(0xFFB8FFE3),fontSize=10.sp,
                modifier=Modifier.zIndex(20f).offset(12.dp,(safeTop+3).dp).background(Color(0xDD09251C))
                    .clickable{graphicsMarker?.invoke()}.padding(horizontal=5.dp,vertical=3.dp))
            if(sleepMenuOpen&&!webOverlay&&active&&destination in setOf("home","collection"))Box(Modifier.fillMaxSize().zIndex(6f)) {
                MiniSleepMenu(sleepUi,sleepAnchor,safeTop,interfaceLight,backdrop,
                    preferredMinutes=surfaces["mini"]?.sleepPreferredMinutes?:30,reduced=reducedMotion){sleepMenuOpen=false}
            }
            supportSheet?.let{kind->SupportSheets(kind,supportCopyJson){supportSheet=null}}
            }
        }
    }
    fun destroy() {
        routeFence.close()
        webSamplingLayer.close()
        graphics.close()
        val compose = host ?: return
        active = false;navigationActionSerial++;clearStartupNavigation();stageExit.clear(); surfaces.clear(); clocks.clear();pages.clear();retained.clear();presented=null
        compose.disposeComposition()
        (web.parent as? ViewGroup)?.removeView(web)
        (compose.parent as? ViewGroup)?.removeView(compose)
        parent?.addView(web,index.coerceAtMost(parent?.childCount ?: 0),params)
        host = null; parent = null
    }
}

private fun navigationTrace(phase:String){NavigationTiming.mark(phase);if(android.util.Log.isLoggable("TingyuNavigation",android.util.Log.DEBUG))android.util.Log.d("TingyuNavigation","$phase at=${System.currentTimeMillis()}")}
