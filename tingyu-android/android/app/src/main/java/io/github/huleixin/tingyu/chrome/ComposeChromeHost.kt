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
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
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
import io.github.huleixin.tingyu.minimal.ui.MinimalQueueSheet
import kotlinx.coroutines.delay
import io.github.huleixin.tingyu.minimal.ui.MinimalSheetScrim
import io.github.huleixin.tingyu.minimal.ui.minimalSheetEnter
import io.github.huleixin.tingyu.minimal.ui.minimalSheetExit
import org.json.JSONObject
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ComposeChromeHost.kt
// Stable WebView identity; native pages and the live stage use separate GPU backdrop sources.
class ComposeChromeHost(private val web: WebView, var listener: ChromeActionListener) {
    private var appearanceMode by mutableStateOf(InterfaceAppearance.mode(web.context))
    // 极简播放页第一阶段：数据全部来自既有播放器与统一歌词交付点，命令走同一条动作总线。
    private val minimal = io.github.huleixin.tingyu.minimal.MinimalPlayerRuntime.get(web.context)
    private val minimalCommands = io.github.huleixin.tingyu.minimal.BridgeMinimalCommands(
        { action, value ->
            val session = minimal.session()
            if (session.isEmpty()) return@BridgeMinimalCommands false
            listener.onAction("minimal", session, action, value)
            true
        },
        { minimal.bridgeLive() },
    )
    /**
     * 队列的**宿主级**命令出口（2026-11-05 队列专项）。
     *
     * 队列抽屉可以从推荐首页、歌单、舞台、极简页任意一处打开，它不属于极简播放页；
     * 因此这里**不能**用 minimal.bridgeLive() 当可用性 —— 那是"桥帧还新鲜"的判定，
     * 只在极简页正在推帧时才成立。从首页打开队列时极简页没有帧，20 秒后 bridgeLive()
     * 恒为 false，`BridgeMinimalCommands.send()` 第一行就会 return false，点歌/播放模式/
     * 删除/排序全部静默丢弃（真机表现：按钮无反应、点歌永远停在"正在切换…"）。
     *
     * 队列动作由 JS 的模块级监听者接收（nativeMinimalQueue.onQueueActionEvent，按 id 过滤），
     * 极简页从未打开时 session 为空也照样送达；这里只要求宿主还在组合里（suspend 期间不再假装能发）。
     */
    private val queueCommands = io.github.huleixin.tingyu.minimal.BridgeMinimalCommands(
        { action, value ->
            listener.onAction("minimal", minimal.session(), action, value)
            // 日志证据：bridgeLive 为 false 时旧实现会在这里之前就 return，真机可据此对照。
            android.util.Log.i("TingyuQueue", "send $action=${value.toInt()} bridgeLive=${minimal.bridgeLive()} session=${minimal.session().take(8)}")
            true
        },
        { active },
    )
    init { minimal.start()
        if (!minimalPlayerEnabled()) android.util.Log.w("TingyuMinimal",
            "COMPOSE_MINIMAL_PLAYER=false — 极简页停在 WebView（回滚开关 TINGYU_COMPOSE_MINIMAL）")
    }
    /** JS 侧只在 probe 说 true 时才让出极简页；这里是唯一的判定点。 */
    private fun minimalPlayerEnabled(): Boolean =
        io.github.huleixin.tingyu.BuildConfig.COMPOSE_MINIMAL_PLAYER && Build.VERSION.SDK_INT >= 24

    /**
     * 桥帧：只带 Compose 页没法从原生拿到的部分（模式、可用性、浏览器音频通道的位置）。
     *
     * <p>返回"我现在能不能真的画这一页"。JS 只在这个回答为 true 之后才卸掉 WebView 极简页 ——
     * 于是"原生拿不出页面"永远不会变成一块空白，最多是晚一秒让出。
     */
    fun minimalQueue(value: JSONObject): Boolean = minimal.onQueueSnapshot(value)

    fun minimalQueueCurrent(value: JSONObject) {
        minimal.onQueueCurrent(value)
    }

    /** 工具页快照。版本倒退丢弃，与队列同一套乱序保护。 */
    fun minimalTools(value: JSONObject): Boolean = minimal.onToolsSnapshot(value)

    /** WebView 侧入口要的工具页编号 → 宿主页面名。 */
    fun openNativeTools(page: Int) {
        when (page) {
            1 -> openNativeTools("quality")
            2 -> openNativeTools("effects")
            3 -> openNativeTools("lyrics")
            4 -> openNativeTools("lx")
        }
    }

    /** 上一次桥帧接受状态的日志去重：只在状态或原因变化时打一条。 */
    private var lastFrameAccept: Boolean? = null

    fun minimalFrame(value: JSONObject): Boolean {
        minimal.onBridgeFrame(value)
        val flagOn = minimalPlayerEnabled()
        val routeMatch = destination == "stage" && playerPresentation == "minimal"
        val accept = flagOn && routeMatch && !webOverlay
        if (accept != lastFrameAccept) {
            lastFrameAccept = accept
            val reason = when {
                accept -> "accept: Compose 绘制极简页"
                !flagOn -> "reject: COMPOSE_MINIMAL_PLAYER=false → WebView 极简页"
                !routeMatch -> "reject: 路由不在极简页（destination=$destination presentation=$playerPresentation）"
                else -> "reject: WebView 弹层打开 → 暂时让位"
            }
            android.util.Log.i("TingyuMinimal", "$reason at=${System.currentTimeMillis()}")
        }
        return accept
    }

    fun minimalDiagnostics(): JSONObject = minimal.diagnostics()
        .put("enabled", minimalPlayerEnabled())
        .put("bound", minimal.bridgeLive())

    /** 交还极简页：JS 侧还有必须由 WebView 画的面板（如队列）时调用，原生立刻停画。 */
    fun minimalRelease(session: String) {
        minimal.releaseSession(session)
    }
    fun setAppearance(mode:String){InterfaceAppearance.save(web.context,mode);appearanceMode=mode}
    private val graphics=GraphicsProbe(web)
    private val webSamplingLayer=WebSamplingLayer(web)
    private var graphicsMarker:(()->Unit)?=null
    fun setGraphicsMarkerListener(listener:()->Unit){graphicsMarker=listener}
    fun graphicsSnapshot()=graphics.snapshot(destination,webOverlay)
    fun graphicsConfigure(mode:String)=graphics.configure(mode)
    private val surfaces = mutableStateMapOf<String, ChromeSurface>()
    // 冷启动缓存 seed 的存活依据：哪些 surface 已经收到过 enabled 包（见 ChromeBootSeed）。
    private val liveChrome = mutableStateMapOf<String, Boolean>()
    private val clocks = mutableStateMapOf<String, ChromeTimeline>()
    private val pages = mutableStateMapOf<String, NativePage>()
    private val pageNavigations=mutableMapOf<String,String>()
    var pageListener: NativePageActionListener? = null
    // 「支持与交流」sheets: opened from settings page actions (support:coffee / support:group).
    private var sleepMenuOpen by mutableStateOf(false)
    private var sleepAnchor by mutableStateOf(androidx.compose.ui.geometry.Rect.Zero)
    private var supportSheet by mutableStateOf<String?>(null)
    private var supportCopyJson by mutableStateOf<String?>(null)
    /**
     * 二级操作面板（原生化专项·第 21 轮）：歌曲 ⋯ / 歌单 ⋯ / 音源选择 / 本地文件操作等
     * 统一由这里承载。React 只下发声明式模型，Compose 负责绘制与命中 —— 见 TyPanelHost.kt。
     */
    private val panelHost = TyPanelHost()
    /** 面板动作与关闭事件的回传通道（JS 侧监听 panelAction）。 */
    var panelListener: NativePanelActionListener? = null
        set(value) {
            field = value
            panelHost.onAction = value?.let { sink ->
                { id, session, key, action, text, v -> sink.onAction(id, session, key, action, text, v) }
            }
            panelHost.onDismiss = value?.let { sink ->
                { id, session, key -> sink.onAction(id, session, key, TyPanelEvent.DISMISS, "", 0.0) }
            }
        }
    private val cache=NativeShellCache(web.context)
    private val retained=NativePageRetention()
    private val routeMotion=NativeRouteMotion()
    private val startupNavigation=PendingStartupNavigation()
    private var startupSelected by mutableStateOf<Int?>(null)
    private var startupToast:android.widget.Toast?=null
    private var navigationActionSerial=0L
    private fun clearStartupNavigation(){startupNavigation.clear();startupSelected=null;startupToast?.cancel();startupToast=null}

    private val stageExit=NativeStageExit()
    /** 原生队列抽屉的开合。它是**宿主**的状态：任何页面都能打开同一张表。 */
    private var queueOpen by mutableStateOf(false)
    /** 队列列表滚动状态：宿主持有，抽屉关开（去极简页再回来）不换实例、浏览位置不跳。 */
    private val queueListState = androidx.compose.foundation.lazy.LazyListState()
    /** JS 说抽屉关了（返回键、点击遮罩），宿主跟着收。 */
    fun closeNativeQueue(){queueOpen=false}
    fun openNativeQueue(){
        queueOpen=true
        // 打开时立刻要一份新快照。走宿主级通道：从首页/歌单/舞台打开时极简页的桥帧
        // 可能早已过期，旧实现在这里同样发不出去，抽屉会拿到过期队列。
        queueCommands.requestQueue()
    }

    /**
     * 原生工具页（音质/效果器/歌词工具/洛雪音源）的开合。第 11 轮。
     * 与队列同模式：宿主级状态，任何页面都能打开同一张页；这些页**不走 WebView**，
     * 所以极简页不再因为打开它们而让位/回退 —— 打开前先把上一个工具页收起来。
     */
    private var toolsPage by mutableStateOf("")
    /** 工具页打开时的路由；路由变了就收（从歌曲工具进播放设置的场景）。 */
    private var toolsRoute by mutableStateOf("stage")
    /**
     * 极简页当前停留的 pager 页（0 封面 / 1 歌词）。挂在宿主而不是页面组合里：
     * 进设置时页面会离开组合，回来时 pager 用这个值重建 ——
     * 不再重置到封面，也不再丢失用户停留的位置。
     */
    private var minimalLastPage by mutableIntStateOf(0)
    /** 极简页**当前**停留页（0 封面 / 1 歌词）。与 minimalLastPage 分开：
     *  lastPage 只用于「进设置再回来」的恢复，currentPage 用于「歌词页常亮」这类即时状态。 */
    private var minimalCurrentPage by mutableIntStateOf(0)
    /** 新会话令牌：每次从浏览页进入播放器 +1。pager 状态按它重建 → 每次打开都从封面开始。 */
    private var minimalSessionToken by mutableIntStateOf(0)
    /** 「极简歌词页常亮」开关（JS 设置随 shell 包下发，默认关）。 */
    private var minimalLyricsKeepOnEnabled by mutableStateOf(false)
    private val toolActions = io.github.huleixin.tingyu.minimal.BridgeToolActions(
        sender = { action, value ->
            val session = minimal.session()
            if (session.isEmpty()) false
            else { listener.onAction("minimal", session, action, value); true }
        },
        availability = { minimal.bridgeLive() },
    )
    fun openNativeTools(page: String) {
        if (toolsPage == page) return
        // 一次只叠一个工具页；从音质进效果器/洛雪是替换，不是叠加。
        toolsPage = page
        toolsRoute = destination
        val index = when (page) { "quality" -> 1; "effects" -> 2; "lyrics" -> 3; "lx" -> 4; else -> 0 }
        if (index > 0) minimalCommands.notifyToolsOpened(index)
    }
    fun closeNativeTools() {
        if (toolsPage.isEmpty()) return
        toolsPage = ""
        minimalCommands.notifyToolsClosed()
    }
    fun collapseStage(reply:()->Unit){
        if(destination!="stage"||webOverlay){reply();return}
        val nativeMinimal=minimalPlayerEnabled()&&playerPresentation=="minimal"&&minimal.bridgeLive()&&!minimal.state.value.controls.detour
        stageExit.begin(retained.lastBrowsing(),nativeMinimal,reply)
    }
    private var presented by mutableStateOf<NativePage?>(null)
    private var pageTarget=""
    private var entryKey=""
    private var navigation=""
    private var backwards by mutableStateOf(false)
    private var reducedMotion by mutableStateOf(false)
    private var motionKey=""
    private var nativeTop by mutableFloatStateOf(-1f)
    private var nativeBottom by mutableFloatStateOf(-1f)
    fun setSafeInsets(top:Float,bottom:Float){
        val nextTop=top.coerceAtLeast(0f);val nextBottom=bottom.coerceAtLeast(0f)
        // 首帧诊断：安全区是底栏纵向位置的唯一输入，任何一次迟到 / 抖动都要留痕。
        if(nextTop!=nativeTop||nextBottom!=nativeBottom)StartupTrace.detail("insets"){
            put("top",nextTop);put("bottom",nextBottom);put("previousBottom",nativeBottom)
        }
        nativeTop=nextTop;nativeBottom=nextBottom
    }
    private fun recordMotion(key:String){if(motionKey!=key){motionKey=key;backwards=routeMotion.visit(key)}}
    private fun resolvePage(){
        if(destination in setOf("stage","web")){
            recordMotion(destination);presented=null;return
        }
        val found=retained.find(destination,selectedTab,entryKey.ifEmpty{pageTarget})
        if(found!=null){recordMotion(found.key);presented=found;return}
        // 兜底（2026-11-05 68567）：retained.find 是按 key 前缀/选中 tab 的启发式查找，
        // 与本次会话刚受理的包不一致时会返回 null —— presented 一旦留下空值，屏幕就只剩
        // WebView 副本，用户看到的就是「原生页没上屏、整页还是 WebView」。pages[destination]
        // 是当前路由刚被受理的权威包，直接用它，绝不让当前路由的页面缺席。
        val live=pages[destination]
        if(live!=null&&live.enabled){recordMotion(live.key);presented=live}
        // A first visit keeps its outgoing native composition until the incoming
        // model arrives; never replay a boot/index screen during ordinary navigation.
    }
    private var destination by mutableStateOf("home")
    private var webOverlay by mutableStateOf(false)
    private var selectedTab by mutableIntStateOf(0)
    private var collectionDetail by mutableStateOf(false)
    private val routeFence=NativeRouteFence()
    private var playerPresentation by mutableStateOf("stage")
    private var returningFromSettings by mutableStateOf(false)
    private var minimalResumePending by mutableStateOf(false)
    /** 离开播放页去集合页时"举着"播放页：原地保持不透明，等新页面盖上来再摘。见 MinimalPlayerExitPolicy。 */
    private var minimalCoverHold by mutableStateOf(false)
    private var minimalCollapseCommitted by mutableStateOf(false)
    private var pendingStageEntry by mutableStateOf(false)
    /** 入场诊断：最近一次首页包被拒的原因（正常会话应为空串）。 */
    var lastHomeReject by mutableStateOf("")
    private var stageEntryRequest=0L
    private var firstHomeFrame by mutableStateOf(true)
    /** 启动底色是否已经交还透明（首个页面包落地时置位）。 */
    private var bootTintSettled=false
    private var webStageBackground: Boolean? = null
    // Classic stage keeps its opaque backing. A stage sheet over the native minimal player
    // needs a transparent WebView behind the moving visual surface to reveal that underlay.
    private fun syncWebBackground() {
        val stage = destination == "stage" && !(minimalPlayerEnabled() && playerPresentation == "minimal")
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
        val nativeMinimalReady=minimalPlayerEnabled()&&value.optString("playerPresentation")=="minimal"&&minimal.bridgeLive()&&!minimal.state.value.controls.detour
        // 第 16 轮：极简入场不再等 Chromium 的 visualStateCallback。进来的页面是一整块
        // 不透明的原生图层，Chromium 那边画什么都被盖住；这一等就是真机上点击后
        // 100~200ms 的死等（录屏 f17→f21）。WebView 回退和经典舞台入场仍照旧等待。
        val minimalComposeEntry=minimalPlayerEnabled()&&value.optString("playerPresentation")=="minimal"
        if(next=="stage"&&destination!="stage"&&!nativeMinimalReady&&!minimalComposeEntry) {
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
        val from=destination
        val next=value.optString("route","home")
        if(next!=destination)minimalCollapseCommitted=stageExit.active&&stageExit.minimal&&stageExit.completed&&next!="stage"
        if(next!=destination){returningFromSettings=destination=="settings"&&next=="stage";minimalResumePending=returningFromSettings}
        if(next!="stage")stageExit.clear()
        else if(destination!="stage")stageExit.suppressReturnMotion=false
        require(next in setOf("home","collection","search","settings","stage","web"))
        val routeChanged=next!=destination||value.optString("pageTarget")!=pageTarget||value.optString("entryKey")!=entryKey||value.optInt("selectedTab").coerceIn(0,1)!=selectedTab
        playerPresentation=if(value.optString("playerPresentation")=="minimal")"minimal"else"stage"
        // 从浏览页（home/collection/search/…）进入播放器 = 一次**新会话**：令牌 +1，
        // pager 状态随之重建，首次组合就落在封面页（需求二）。设置页返回与完整舞台往返
        // 不算新会话（前者 destination=="settings"，后者 from 已是 stage），页面状态保持。
        if(next=="stage"&&from!="stage"&&from!="settings"){
            minimalSessionToken++
            minimalLastPage=0;minimalCurrentPage=0
        } else if(next=="stage"&&from=="settings"&&value.has("minimalPage")){
            // 从设置返回：沿用 JS 记下的页，进出设置不重置。
            minimalLastPage=if(value.optString("minimalPage")=="lyrics")1 else 0
            minimalCurrentPage=minimalLastPage
        }
        minimalLyricsKeepOnEnabled=value.optBoolean("minimalLyricsKeepOn")
        destination=next;webOverlay=value.optBoolean("webOverlay");selectedTab=value.optInt("selectedTab").coerceIn(0,1)
        StartupTrace.detail("route-commit"){
            put("from",from);put("to",next);put("overlay",webOverlay);put("tab",selectedTab)
            put("presentation",playerPresentation);put("pendingStageEntry",pendingStageEntry)
        }
        if(next=="stage"&&playerPresentation=="minimal"){
            val stagePhase=surfaces["stage"]?.playerTransition?:"idle"
            val shownKey=presented?.key?:"-"
            android.util.Log.i("TingyuEntry",
                "commit stage/minimal from=$from webOverlay=$webOverlay stagePhase=$stagePhase presentedKey=$shownKey")
        }
        // 去集合页时不要自己淡出/滑走：路由一离开 stage，WebView 那份极简页就可能又挂回来，
        // 播放页一透明就会把它透出来（3~4 层叠影的来源）。改为原地保持不透明，让页面压上来盖住。
        if(MinimalPlayerExitPolicy.holdForCover(from,next,playerPresentation,minimalPlayerEnabled(),minimalCollapseCommitted)){minimalCoverHold=true
            android.util.Log.i("TingyuNavigation","cover-hold on: $from → $next（播放页原地保持，等页面盖住）")}
        else if(next=="stage"||minimalCollapseCommitted){minimalCoverHold=false}
        // 工具页跟着打开它的路由走：路由一变（比如从歌曲工具进"播放设置"）就收起来，
        // 返回时再由用户重新打开 —— 工具页绝不叠在别的原生页上面。
        if(toolsPage.isNotEmpty()&&next!="stage"&&toolsRoute=="stage")closeNativeTools()
        if(toolsPage.isNotEmpty())toolsRoute=next
        // 二级面板跟着它所属的页面走：路由一变就收起。面板里的动作对象（歌曲、集合）
        // 属于上一页的上下文，继续挂着只会让用户点到一个已经失效的目标。
        if(routeChanged && panelHost.panel != null) panelHost.dismissFromHost()
        syncWebBackground()
        pageTarget=value.optString("pageTarget");entryKey=value.optString("entryKey");reducedMotion=value.optBoolean("reducedMotion")
        navigation=value.optString("navigation")
        collectionDetail=value.optBoolean("collectionDetail")
        if(routeChanged||webOverlay)sleepMenuOpen=false
        if(routeChanged||presented==null)resolvePage()
        settingsTrace("route-commit","route" to destination,"navigation" to navigation,"key" to presented?.key,"session" to presented?.session)
        if(destination=="settings"&&presented?.let{pageNavigations[it.id]!=navigation||pages[it.id]?.session!=it.session}!=false)
            pageListener?.onAction("settings",presented?.session?:"",presented?.key?:"","__refresh","route-commit",0.0)
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
        // 玻璃专项：把编辑期预设与实际生效参数一起报给 JS，真机上不必拆包就能核对装的是哪一组。
        .put("glass", ChromeGlassPresets.active().key)
        .put("glassParams", JSONObject()
            .put("blur", ChromeGlassPresets.active().blur.value.toDouble())
            .put("lensHeight", ChromeGlassPresets.active().lensHeight.value.toDouble())
            .put("lensAmount", ChromeGlassPresets.active().lensAmount.value.toDouble())
            .put("lightAlpha", ChromeGlassPresets.active().surface(true, ChromeGlassPresets.NavFill).alpha.toDouble())
            .put("darkAlpha", ChromeGlassPresets.active().surface(false, ChromeGlassPresets.NavFill).alpha.toDouble())
            .put("miniLightAlpha", ChromeGlassPresets.active().surface(true, ChromeGlassPresets.MiniFill).alpha.toDouble()))
        .put("mounted",host != null).put("active",active).put("surfaces",surfaces.values.count { it.enabled && active }).put("updates",updates).put("pages",Build.VERSION.SDK_INT >= 24)
        // 二级操作面板能力位（原生化专项·第 21 轮）：JS 只有拿到 true 才把 ⋯ 面板交给原生，
        // 否则继续用 WebView 的 .ml-sheet —— 旧包/回滚构建因此不会出现"点了没反应"。
        .put("panels", true)
        // 极简页的能力位：JS 侧只有拿到 true 才让出 WebView 极简页。回滚只需它变 false。
        .put("minimalPlayer", minimalPlayerEnabled()).put("minimal", minimalDiagnostics())
        // 首帧取证（进程启动后 3 秒内的路由 / 底栏 / 安全区 / 交接点）。诊断包直接读这一段。
        .put("startup", StartupTrace.snapshot())
    fun pageUpdate(value: PreparedNativePage, reply: (JSONObject) -> Unit) {
        val started=SystemClock.elapsedRealtime()
        check(Build.VERSION.SDK_INT >= 24)
        val next=value.page;val id="page:${next.id}"
        if(!frameOrder.accept(id,next.session,next.generation,next.revision)){reply(status().put("accepted",false).put("reason","frame-order"));return}
        if(next.enabled&&host==null)attach()
        // Do not poison retained geometry with an enabled packet from a route being
        // retired (e.g. the home DOM acquiring the stage's safe-area coordinates).
        val ownsPresentation=retained.updateForRoute(next,destination,selectedTab,pageTarget,value.navigation,navigation)
        if(ownsPresentation){
            pages[next.id]=next;pageNavigations[next.id]=value.navigation
            navigationTrace("page-native-commit:${next.id}")
            recordMotion(next.key)
            presented=next
            StartupTrace.detail("page-commit"){
                put("id",next.id);put("key",next.key);put("session",next.session)
                put("rect",next.rect.toString());put("viewport",next.viewport)
                put("boot",bootTintSettled)
                // 区块级快照：哪一次提交里某个区块的条目数/文案变了，一眼可查 ——
                // 底部闪烁帧就是「歌单区块在一帧内从有卡片变成空态」才被找到的。
                val sections=org.json.JSONArray()
                next.sections.forEach{section->sections.put(org.json.JSONObject()
                    .put("id",section.id).put("layout",section.layout)
                    .put("items",section.items.size).put("textChars",section.text.length))}
                put("sections",sections)
            }
            // 启动底色（BootSurfaceTint）必须在「第一个页面包真正落地」时交还透明：
            // 页面已是不透明整屏渐变，此时撤色安全；按帧数撤会早于页面绘制，
            // 撤掉之后又是一块黑窗（录屏 68736/68737 的第二次复现）。
            if(!bootTintSettled){bootTintSettled=true;BootSurfaceTint.settle(web.context as? android.app.Activity)
                // 首帧诊断：启动窗口底色（LaunchSurface）→ 页面底色（第一张原生页）的交接点。
                StartupTrace.detail("window-tint-settled"){put("page",next.id);put("key",next.key)}
                android.util.Log.i("TingyuEntry","boot-tint-settled page=${next.id}")}
            // 入场错位排查埋点：首页几何包一旦带异常 viewport（与 WebView 实宽不符），
            // 原生页会按 web.width/viewport 整体放大 —— 录屏 68537 中 8% 放大副本的候补来源。
            if(next.id=="home"){
                val scale=if(next.viewport>0)web.width.toFloat()/next.viewport else 0f
                android.util.Log.i("TingyuEntry",
                    "home-packet key=${next.key} viewport=${next.viewport} rect=${next.rect} webW=${web.width} cssScale=$scale nav=${value.navigation}")
            }
        } else if(next.id=="home"){
            lastHomeReject=if(value.navigation!=navigation)"nav-mm(${value.navigation}≠$navigation)"else if(!next.enabled)"disabled"else "route-mm(dest=$destination)"
            android.util.Log.i("TingyuEntry","home-reject $lastHomeReject key=${next.key} vp=${next.viewport}")
        }
        if(ownsPresentation)cache.commit(value.cache)
        val reason=if(ownsPresentation)""else if(value.navigation!=navigation)"navigation-mismatch"else if(!next.enabled)"disabled-packet"else "route-target-mismatch"
        settingsTrace("page-update","route" to destination,"session" to next.session,"key" to next.key,"navigation" to value.navigation,"reason" to reason)
        NavigationTiming.mark("page-ui-commit",(SystemClock.elapsedRealtime()-started).toDouble())
        reply(status().put("accepted",ownsPresentation).put("session",next.session).put("reason",reason))
    }
    fun pageRemove(id: String, session: String) {
        frameOrder.retire("page:$id",session)
        if(pages[id]?.session==session){pages.remove(id);pageNavigations.remove(id)}
    }
    /**
     * 二级面板包。与页面包同一套防乱序：session 换代 + revision 单调。
     * `enabled=false` 表示关闭；受理失败时回 accepted=false，JS 侧据此保留 DOM 版本
     * （绝不允许"原生没画、DOM 也撤了"的空窗）。
     */
    fun panelUpdate(value: PreparedTyPanel, reply: (JSONObject) -> Unit) {
        check(Build.VERSION.SDK_INT >= 24)
        val next = value.panel
        if (next.enabled && host == null) attach()
        val accepted = panelHost.update(next)
        if (accepted && next.enabled && next.kind == "sheet") {
            // 二级面板与队列/工具页互斥：它们都在底部，叠在一起会抢同一块底部空间。
            if (queueOpen) { queueOpen = false; minimalCommands.closeQueue() }
            if (toolsPage.isNotEmpty()) closeNativeTools()
        }
        settingsTrace("panel-update", "panel" to next.id, "session" to next.session,
            "revision" to next.revision, "enabled" to next.enabled, "accepted" to accepted)
        reply(status().put("accepted", accepted).put("session", next.session))
    }
    fun panelRemove(id: String, session: String) { panelHost.remove(id, session) }
    fun update(value: PreparedChromeSurface, reply: (JSONObject) -> Unit) {
        check(Build.VERSION.SDK_INT >= 24)
        val next = value.surface
        if (!frameOrder.accept(next.id,next.session,next.generation,next.revision)) { reply(status().put("accepted",false)); return }
        if (next.enabled && host == null) attach()
        val hadLive = liveChrome[next.id] == true
        surfaces[next.id] = next
        if (next.enabled) liveChrome[next.id] = true
        StartupTrace.detail("chrome-packet"){
            put("id",next.id);put("session",next.session);put("enabled",next.enabled)
            put("top",next.rect.top);put("height",next.rect.height);put("alpha",next.rect.alpha)
            // 这一包把缓存 seed 顶掉的时刻就是底栏交接点（此后 live 接管，seed 不再出现）。
            put("retiresSeed",next.enabled&&!hadLive)
        }
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
    /** 底栏延迟摘除的代际令牌：新一次 remove/挂起都会作废尚未执行的延迟任务。 */
    private var chromeRemovalSerial = 0L
    fun remove(id: String, session: String) {
        frameOrder.retire(id,session)
        if (surfaces[id]?.session == session) {
            // 第 17 轮（入场错位修复）：极简入场是「底栏原地不动、极简页作为唯一前景层
            // 从底部上滑盖住首页」。但 JS 侧 nav/mini 的 active=view==='home' 在路由切换
            // 的同一帧就失效，cleanup 会立刻 chromeNative.remove —— 录屏 68537 的
            // 0.53~0.70s 里，底栏和迷你条在被盖住前 200~300ms 就消失了。真正的摘除
            // 推迟到入场窗口之后：极简页不透明，盖住后底栏走不走都看不见；若期间
            // 路由又回到 home，JS 重挂载会用新会话 update 覆盖同一 id，这次延迟任务
            // 因会话不匹配自动失效，不会闪掉底栏。
            val entryPending = minimalPlayerEnabled() && (id == "nav" || id == "mini") && !webOverlay &&
                (pendingStageEntry || (destination == "stage" && playerPresentation == "minimal"))
            StartupTrace.detail("chrome-remove"){put("id",id);put("session",session);put("delayed",entryPending);put("route",destination)}
            if (entryPending) {
                val token = ++chromeRemovalSerial
                web.postDelayed({
                    if (token == chromeRemovalSerial && surfaces[id]?.session == session) {
                        surfaces.remove(id); clocks.remove(id)
                    }
                }, CHROME_ENTRY_GRACE_MS)
            } else { surfaces.remove(id); clocks.remove(id) }
        }
    }
    fun suspend() { navigationActionSerial++;chromeRemovalSerial++;clearStartupNavigation();active = false;sleepMenuOpen=false;stageExit.clear();io.github.huleixin.tingyu.NativeKeepScreenOn.setLyrics(false) }
    // 回到前台重读一次权威：后台期间到达的歌词、以及引擎在后台走掉的位置都必须立刻反映出来。
    // 诊断（启动专项）：updates/pages 计数能区分暖恢复（计数累积）与 Activity 重建/进程重建
    // （host 重建后归零，updates 从小数字重新爬升）；配合 CrashDiagnostics 的 renderer-gone
    // 面包屑，可以在一次 logcat 里直接判断录屏里黑屏/空态属于哪种启动路径。
    fun resume() {
        active = true; minimal.refreshNow()
        android.util.Log.i("TingyuEntry",
            "activity-resume host=${host != null} pages=${pages.size} surfaces=${surfaces.size} updates=$updates")
    }
    private fun attach() {
        val original = web.parent as? ViewGroup ?: error("WebView has no parent")
        parent = original; params = web.layoutParams; index = original.indexOfChild(web)
        original.removeView(web)
        val compose = ComposeView(web.context)
        compose.setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
        original.addView(compose,index,params)
        host = compose
        if(graphics.enabled)graphics.compositions++
        // 启动诊断（录屏 68723）：host 重建 = Activity 重建/进程重建；配合 onResume 的
        // activity-resume 计数，一次 logcat 即可区分冷启动、暖恢复与 recreate。
        android.util.Log.i("TingyuEntry","host-attach cold-start pages=${pages.size} surfaces=${surfaces.size}")
        StartupTrace.detail("host-attach"){put("pages",pages.size);put("surfaces",surfaces.size);put("webWidth",web.width);put("webHeight",web.height)}
        compose.setContent { Scene() }
    }
    @Composable private fun Scene() {
        // 原生首帧时间（录屏 68723 要求记录）：窗口背景从这一帧起被页面取代。
        LaunchedEffect(Unit){withFrameNanos{NavigationTiming.mark("first-native-frame");android.util.Log.i("TingyuEntry","first-native-frame pages=${pages.size} surfaces=${surfaces.size}")
            StartupTrace.detail("first-native-frame"){put("pages",pages.size);put("surfaces",surfaces.size);put("presented",presented?.key)} }}
        val configuration=androidx.compose.ui.platform.LocalConfiguration.current
        val interfaceLight=InterfaceAppearance.resolve(appearanceMode,(configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_NO)
        val palette=remember(interfaceLight){InterfacePalette(interfaceLight)}
        val activity=web.context as? android.app.Activity
        DisposableEffect(interfaceLight,destination,surfaces["stage"]?.light) {activity?.let{InterfaceAppearance.route(it,destination=="stage",surfaces["stage"]?.light?:false)};onDispose{}}
        val sleepUi=rememberMiniSleepUi(active&&focused)
        val backdrop = rememberLayerBackdrop()
        val stageBackdrop = rememberLayerBackdrop()
        val exitProgress=rememberStageExitProgress(stageExit,reducedMotion)
        // 极简页归 Compose 所有时，WebView 那条 stage 控制条必须退场：两个传输并排出现
        // 就是两套「播放/暂停」在同一个屏幕上，和 1.3.119 里「极简页 vs 舞台」的规则一致。
        // 条件里的 bound 是握手：只有 JS 正在推帧（也就意味着它已经把 WebView 极简页让出来）
        // 才由原生画。桥不在时这里什么都不画，屏幕上是原来的 WebView 极简页 —— 不会两个都在。
        // 只订阅这条低频流，整个场景不跟着每秒的状态帧重建。
        val minimalBound by minimal.bound.collectAsState()
        val minimalState by minimal.state.collectAsState()
        val queueState by minimal.queue.collectAsState()
        // 顺访期间保留原生 pager，但让 WebView 舞台及其底栏占上层；返回过渡结束才交还触摸。
        // 不含退场判定的那一份：退场那 280ms 里 destination 仍是 stage、presentation 仍是 minimal，
        // 差别只在 stageExit.active。播放页必须靠这一份继续留在组合里 —— 见 playerShown。
        val stagePhase=surfaces["stage"]?.playerTransition?:"idle"
        val stageAboveMinimal=minimalState.controls.detour||stagePhase in setOf("to-stage","to-minimal")
        val minimalBase = minimalPlayerEnabled() && destination=="stage" && playerPresentation=="minimal" && !webOverlay && minimalBound
        val minimalOwns = minimalBase && !stageAboveMinimal && !stageExit.active
        // 极简歌词页常亮（需求一）：只有「真正显示 Compose 极简歌词页」时才申请。
        // 播放/暂停无关（页在就算）；切换封面页、退出播放器、顺访完整舞台、应用退后台
        // （active=false）都会让这个表达式变 false → 立即释放，交还系统自动息屏规则。
        // 与全局「屏幕常亮」不冲突：两个来源都交给 NativeKeepScreenOn 统一裁决（or 关系）。
        val lyricsKeepOn = minimalLyricsKeepOnEnabled && minimalOwns && minimalCurrentPage == 1 &&
            active && focused && !webOverlay && !stageExit.active
        SideEffect {
            val hostActivity = web.context as? android.app.Activity
            if (hostActivity != null) io.github.huleixin.tingyu.NativeKeepScreenOn.attach(hostActivity)
            io.github.huleixin.tingyu.NativeKeepScreenOn.setLyrics(lyricsKeepOn)
        }
        val nativeMinimalCollapse=stageExit.active&&stageExit.minimal
        val page=presented?:if(stageExit.active)stageExit.returning else null
        // 第 16 轮：Compose 将接管极简页（能力开关在、路由到 stage、presentation=minimal、无顺访/弹层）。
        // 这是入口动画唯一的拥有者判定：
        //   · WebView 不再升层也不再整屏上滑 —— 它这时是首页底下的备用层，动它是纯浪费，
        //     升到首页上面还会露出一帧无底栏的 WebView 首页副本（图层错位的来源）；
        //   · 底栏（迷你条+导航）在进场期间保持可见 —— 反正马上会被不透明的极简页盖住，
        //     提前抽掉它们就是真机上看到的「首页跳位」。
        val composeOwnsMinimalEntry = minimalPlayerEnabled() && destination=="stage" &&
            playerPresentation=="minimal" && !stageAboveMinimal && !webOverlay
        // pendingStageEntry 不再抽走底栏：极简入场时它们会被页面自然覆盖；
        // 经典 WebView 舞台入场仍在 commit 时按路由规则收起。
        val visible = if (!webOverlay&&(!pendingStageEntry||minimalPlayerEnabled())) surfaces.values.filter {
            it.enabled && NativeFooterLayout.visible(
                it.id,
                if(composeOwnsMinimalEntry&&it.id!="stage")(page?.id?:"home") else destination,
                collectionDetail,it.viewportWidth,
                pageTarget.startsWith("collection:artist:")) &&
                (it.id!="stage"||it.rect.width>0&&it.rect.height>0) &&
                !(composeOwnsMinimalEntry&&it.id=="stage")
        } else emptyList()
        // Reuse the route's one retained composition beneath the collapsing stage.
        // Creating a second underlay would duplicate saveable keys during a quick Back.
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
            Box(Modifier.fillMaxSize().zIndex(if(destination!="stage"||stageAboveMinimal)1f else 0f).then(if(legacySampling&&Build.VERSION.SDK_INT>=31&&graphics.sampleStage(destination))Modifier.layerBackdrop(backdrop)else Modifier)) {
                // A reproduces the unverified 1.3.32 isolation hypothesis; a TextureView
                // workaround is not evidence that this fixes WebView. C31 removes only
                // this modifier. Neither path changes lyric effects or global frame rate.
                if(graphics.enabled&&graphics.mode!=GraphicsProbeMode.C31)DisposableEffect(Unit){graphics.layerMounts++;onDispose{graphics.layerDisposals++}}
                // This wrapper/AndroidView keeps the same identity across routes and auto-hide.
                // A live reader uses the tested C2 texture only for the reader's lifetime.
                // 第 16 轮：Compose 接管极简入场时 WebView 退回 zIndex 0（首页底下），
                // 升层+上滑都只属于 WebView 回退模式和经典舞台。
                Box(Modifier.fillMaxSize().zIndex(if((destination=="stage"&&!composeOwnsMinimalEntry)||webOverlay||stageExit.active&&!nativeMinimalCollapse)2f else 0f)
                    .then(if(!legacySampling&&Build.VERSION.SDK_INT>=31&&sampleWeb)Modifier.layerBackdrop(stageBackdrop)else Modifier)) {
                AndroidView(factory = { web }, modifier = Modifier.fillMaxSize()
                    .then(if(legacySampling&&graphics.mode!=GraphicsProbeMode.C31)Modifier.graphicsLayer { alpha = if(Build.VERSION.SDK_INT>=31).999f else 1f }else Modifier)
                    .stageExitTransform(stageExit,exitProgress,webOwnsRoutePixels(destination,webOverlay,stageExit.active)&&!nativeMinimalCollapse)
                    .playerEntryTransform(destination=="stage"&&playerPresentation=="minimal"&&!returningFromSettings&&!minimalPlayerEnabled(),reducedMotion,height*density.density))
                }
                Box(Modifier.fillMaxSize().zIndex(1f).then(if(!legacySampling&&Build.VERSION.SDK_INT>=31)Modifier.layerBackdrop(backdrop)else Modifier)) {
                if(page==null&&firstHomeFrame&&destination=="home")NativePageView(bootPage,Modifier.fillMaxSize().zIndex(1f)){_,_,_->}
                // One route-level animation, with no HTML exit animation or full-screen blur.
                // Data/clock revisions keep the same content key and do not restart it.
                // 尺寸动画必须关掉（2026-11-05 拖影修复）：togetherWith 默认带 SizeTransform，
                // 容器尺寸变化时会把整页做缩放+裁剪动画。首页退场是「延迟 520ms 再瞬间淡出」
                // （等极简页盖住），这 520ms 里默认 SizeTransform 正把整页缩成一张小卡片 ——
                // 真机录屏里极简页上方那张缩小、上移、带裁剪的首页残影（拖影）就是它。
                // 这些页面全是整屏，结构上绝不该缩放；sizeAnimationSpec 返回 null 即无尺寸动画。
                AnimatedContent(if(destination=="stage"&&!stageExit.active)null else page,modifier=Modifier.fillMaxSize().zIndex(1f),contentKey={it?.let{NativeMotionPolicy.pageRouteKey(it.key)}?:"stage"},
                    transitionSpec={
                        // 转场只认**路由**，不认模型 key：home/library/search 的模型 key 带着会变的
                        // 数据身份（音源、歌单 id），按它建内容实例会同时存在两份首页，旧的那份
                        // （歌单还是空态）就在新的一份少画一块时从底下露出来（23:29 录屏实测）。
                        val from=initialState?.let{NativeMotionPolicy.pageRouteKey(it.key)}?:if(firstHomeFrame)""else"stage"
                        val to=targetState?.let{NativeMotionPolicy.pageRouteKey(it.key)}?:"stage"
                        val ease=TingYuMotion.Emphasized
                        val travel=with(density){28.dp.roundToPx()}
                        val tabTravel=with(density){8.dp.roundToPx()}
                        val position=tween<IntOffset>(TingYuMotion.PushMs,easing=ease)
                        (when(NativeMotionPolicy.kind(from,to,backwards,!focused||!active||reducedMotion||returningFromSettings||stageExit.suppressReturnMotion&&from=="stage")){
                            NativeMotionKind.NONE->EnterTransition.None togetherWith ExitTransition.None
                            NativeMotionKind.STAGE->fadeIn(tween(140,easing=ease)) togetherWith fadeOut(tween(if(to=="stage"&&playerPresentation=="minimal")1 else 100,delayMillis=if(to=="stage"&&playerPresentation=="minimal")520 else 0,easing=ease))
                            NativeMotionKind.TAB->(slideInHorizontally(tween(TingYuMotion.TabInMs,easing=ease)){tabTravel}+fadeIn(tween(TingYuMotion.TabInMs,easing=ease))) togetherWith (slideOutHorizontally(tween(TingYuMotion.TabOutMs,easing=ease)){-tabTravel}+fadeOut(tween(TingYuMotion.TabOutMs,easing=ease)))
                            NativeMotionKind.PUSH->(slideInHorizontally(position){travel}+fadeIn(tween(TingYuMotion.PushMs,easing=ease))) togetherWith (slideOutHorizontally(position){-travel/3}+fadeOut(tween(200,easing=ease)))
                            NativeMotionKind.POP->((slideInHorizontally(tween(220,easing=ease)){-travel/3}+fadeIn(tween(220,easing=ease))) togetherWith (slideOutHorizontally(tween(220,easing=ease)){travel}+fadeOut(tween(200,easing=ease)))).apply{targetContentZIndex=-1f}
                        })
                    },label="native-route") { shown ->
                // 空态也占满整屏（透明）：two states same size —— AnimatedContent 的
                // SizeTransform 没有尺寸差可动画，首页退场就不会被缩成小卡片（拖影）。
                if(shown==null){Box(Modifier.fillMaxSize())}
                if(shown!=null) {
                    // 页面实例与保存态都按**路由**归并：同一路由的模型更新只重组，不换实例、
                    // 不丢滚动位置；LRU 记账也按路由，避免模型 key 每次变化都把状态挤出去。
                    val shownRoute=NativeMotionPolicy.pageRouteKey(shown.key)
                    LaunchedEffect(shownRoute){withFrameNanos{navigationTrace("compose-frame-boundary")}}
                    DisposableEffect(shownRoute){
                        savedPageKeys.remove(shownRoute);savedPageKeys.add(shownRoute)
                        while(savedPageKeys.size>12){val oldest=savedPageKeys.first();savedPageKeys.remove(oldest);savedPages.removeState(oldest)}
                        onDispose{}
                    }
                    val density=LocalDensity.current;val scale=web.width/shown.viewport
                    if(scale.isFinite()&&scale>0) savedPages.SaveableStateProvider(shownRoute) {
                        val placement=Modifier.offset{IntOffset((shown.rect.left*scale).roundToInt(),(shown.rect.top*scale).roundToInt())}
                            .size(with(density){(shown.rect.width*scale).toDp()},with(density){(shown.rect.height*scale).toDp()})
                        CompositionLocalProvider(LocalSettingsTraceIdentity provides SettingsTraceIdentity(destination,shown.session,shown.key,navigation,!pendingStageEntry&&destination=="settings")) {
                        NativePageView(shown,placement,scale){action,text,value->
                            val current=pages[shown.id]
                            val reason=when {
                                !active->"host-inactive"
                                pendingStageEntry->"stage-entry-pending"
                                destination!=shown.id->"route-mismatch"
                                presented?.key!=shown.key->"presentation-mismatch"
                                current==null->"retired-session"
                                !pageInteractionIsCurrent(current,shown)->pageInteractionRejection(current,shown)
                                pageNavigations[shown.id]!=navigation->"navigation-mismatch"
                                else->""
                            }
                            settingsTrace("page-action","route" to destination,"control" to action,"key" to shown.key,"session" to shown.session,"currentKey" to current?.key,"currentSession" to current?.session,"navigation" to navigation,"reason" to reason)
                            if(reason.isNotEmpty()){
                                if(destination==shown.id)pageListener?.onAction(shown.id,shown.session,shown.key,"__refresh",reason,0.0)
                                return@NativePageView
                            }
                            // Support sheets are fully native: intercept before the JS action bus.
                            if(action.startsWith("support:")){
                                supportCopyJson=pages[shown.id]?.sections?.firstOrNull{it.id=="support"}?.text
                                supportSheet=action.removePrefix("support:");return@NativePageView
                            }
                            pageListener?.onAction(shown.id,shown.session,shown.key,action,text,value)
                        }
                        }
                    }
                }
                }
                }
            }
            if(firstHomeFrame&&destination=="home"&&!webOverlay) {
                LaunchedEffect(Unit){withFrameNanos{NavigationTiming.mark("cached-shell-frame-boundary")}}
            }
            // 输入法弹出时窗口会 resize（adjustResize），Compose 根高度随之变小 —— 底栏如果
            // 还按"根高度 - 底栏高"定位，就会被顶到键盘上方（68591/68593 黄框）。这里把
            // 键盘高度补回"虚拟屏高"，让迷你条/导航栏继续以**物理屏幕底边**为基准：
            // 键盘升起时它们跟着下沉、被键盘盖住（需求允许"自然覆盖"），收起后原位回来。
            // 只作用于 nav/mini，不碰舞台控制条，也不改全局播放器位置规则。
            // 免form小窗/分屏修复（录屏 68720）：窗口不贴物理屏幕底边时，「屏幕-窗口」差值
            // 是桌面或其它窗口的高度，会被误当键盘把底栏推出窗外裁掉（内容正常、双栏消失）。
            // 因此只有窗口底边贴着屏幕底边（全屏/底部半屏）才允许这个兜底；真实 IME 高度优先。
            val imeInsetPx = WindowInsets.ime.getBottom(density)
            val rootPx = height * density.density
            val screenPx = web.resources.displayMetrics.heightPixels.toFloat()
            val windowLocation = IntArray(2)
            web.getLocationOnScreen(windowLocation)
            val pinnedToScreenBottom = windowLocation[1] + web.height >= screenPx - 24f * density.density
            val keyboardPx = when {
                imeInsetPx > 0 -> imeInsetPx.toFloat()
                pinnedToScreenBottom -> (screenPx - rootPx).coerceAtLeast(0f)
                else -> 0f
            }
            // 一个 id 只画一次（2026-11-07 首页底部闪烁专项）。
            //
            // 旧实现是**两处调用点**：缓存 seed 一处、live 包一处，交接时 Compose 拆掉一棵、
            // 另建一棵 —— 玻璃的 backdrop/lens 图层、文字排版、进度环全部重新分配。真机上
            // 「页面已经上屏、底栏闪一下 / 重复出现一下」就是这次重建，而 nav 与 mini 又是
            // 分别交接的（mini 在播放恢复完成前被 hold 住），所以底部会连着闪两次。
            //
            // 现在 seed 只是「这一路 live 还没到」时喂给同一个节点的数据：节点、key、几何
            // 全部共用，live 到达只是换数据，没有第二次挂载。
            val liveById = visible.associateBy { it.id }
            for(id in listOf("nav","mini","stage")) key(id) {
                val live = liveById[id]
                val seeded = remember("seed",id,live,width,height,safeBottom,safeTop,selectedTab,startupSelected,firstHomeFrame,destination,webOverlay,collectionDetail) {
                    if(live!=null) null
                    else if(ChromeBootSeed.shouldSeed(id,destination,firstHomeFrame,webOverlay,liveChrome) &&
                        NativeFooterLayout.visible(id,destination,collectionDetail,width))
                        cache.chrome(id,width,height,safeBottom,safeTop).let{if(id=="nav")it.copy(selected=startupSelected?:selectedTab)else it}
                    else null
                }
                // 两路数据里最多只有一个存在：live 优先，缺席时才用 seed；都没有就不画。
                val original = live ?: seeded
                if (original != null) {
                val surface = remember(original,interfaceLight){original.interfacePaint(interfaceLight)}
                    .let{ if(live==null&&id=="nav") it.copy(disabled=false) else it }
                // seed 与 live 共用同一个定位入口，而且**只在 dp 空间里算一次**：JS 的 innerWidth
                // 是整数（375），真实 dp 宽是 375.38，走 CSS px × scale 会让交接时整条底栏
                // 上台 0.8dp（23:02 报告实测）。现在两路只有 density 一个比例，矩形逐位相同。
                val rect=chromeFooterRect(id,width,height,safeTop,safeBottom,density.density,keyboardPx,collectionDetail)
                // 首帧诊断：底栏第一次以 seed / live 身份落地时的几何与可见性。
                LaunchedEffect(id,live==null,surface.session){StartupTrace.detail(if(live==null)"footer-seed-frame" else "footer-live-frame"){
                    put("id",id);put("session",surface.session);put("top",rect.top);put("height",rect.height)
                    put("alpha",rect.alpha);put("safeBottom",safeBottom);put("root",width.toString()+"x"+height)
                }}
                val y=rect.top
                // 初始挂载不做位移动画：首帧还没「落地」时的安全区/尺寸修正如果走 spring，
                // 屏幕上就是底栏从错误位置滑到正确位置（用户看到的就是底部闪一下/错位）。
                // 落地后（一帧之后）恢复原来的 spring，正常页面切换的手感不变。
                var settled by remember(id){mutableStateOf(false)}
                LaunchedEffect(id){withFrameNanos{};settled=true}
                val animatedY by animateFloatAsState(y,if(id=="stage"||!focused||!active||surface.reducedMotion||reducedMotion||!settled)snap()else spring(dampingRatio=NativeMotionPolicy.Damping,stiffness=NativeMotionPolicy.Stiffness),label="native-chrome-y")
                val placement = Modifier.zIndex(2f)
                    .offset { IntOffset(with(density){rect.left.dp.roundToPx()},with(density){animatedY.dp.roundToPx()}) }
                    .size(rect.width.dp,rect.height.dp)
                    .graphicsLayer { alpha = rect.alpha }
                    val actions: (String,Double)->Unit = actions@ { action,value ->
                        // seed 不是 live 控制条：只接受「启动期导航」与「睡眠菜单」这两条安全动作，
                        // 缓存快照绝不触发业务命令（其余一律丢弃）。
                        if (live == null) {
                            if(action=="interactionStart")NavigationTiming.markGesture("startup-nav-press",-1.0)
                            else if(action=="interactionEnd")NavigationTiming.markGesture("startup-nav-release",-1.0)
                            else if(id=="nav"&&action=="navigate"&&active&&startupNavigation.request(value.toInt())){
                                navigationActionSerial++;startupSelected=value.toInt();NavigationTiming.mark("startup-navigation-requested")
                                startupToast?.cancel();startupToast=android.widget.Toast.makeText(web.context,"正在准备${listOf("推荐","资料库","搜索","设置")[value.toInt()]}，就绪后自动打开",android.widget.Toast.LENGTH_SHORT).also{it.show()}
                            }else if(id=="mini"&&action=="sleep")sleepMenuOpen=!sleepMenuOpen
                            return@actions
                        }
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
                    when(id) {
                        "nav" -> ChromeNavigation(surface,backdrop,interactivePlacement,actions)
                        "mini" -> ChromeMiniPlayer(surface,if(live==null)null else clocks[id],backdrop,interactivePlacement,sleepUi,{sleepAnchor=it},actions)
                        "stage" -> Box(Modifier.fillMaxSize().zIndex(2f).stageExitTransform(stageExit,exitProgress).playerDetourTransform(surface.playerTransition,reducedMotion||surface.reducedMotion,height*density.density)){ChromeStagePlayer(surface,clocks[id],if(legacySampling)backdrop else stageBackdrop,interactivePlacement,actions)}
                    }
                }
            }
            // 极简播放页：整页原生绘制，压在 WebView 之上。
            // 进场是从迷你播放器位置升起来（420ms）—— 与原页面同一组曲线。
            // 退场分两种（见 MinimalPlayerExitPolicy）：
            //   · 去集合页：不自演退场，原地保持不透明并退到新页面**下面**，让页面压上来盖住；
            //     任何"淡出/滑走"都会把 WebView 里还没换掉的另一份播放页透出来（真机 3~4 层叠影）。
            //   · 其余路由：维持原来的下滑 + 淡出，因为底下露出来的就是目标页本身。
            // 例外：从设置页回到极简页不重放入场动画 —— 用户没有离开播放器，只是去设了个开关。
            // 退场那 280ms（stageExit）里 destination 仍是 stage、minimalOwns 已为 false：
            // 此刻若把播放页摘掉，等路由提交回集合页 minimalCoverHold 会把它**重新入场**，
            // 真机上就是"按返回回到歌单 → 又弹回极简歌词页 → 再跳回歌单"。
            // 用不含退场判定的 minimalBase 继续举着它（此时 zIndex 在页面之下，被页面整块盖住），
            // 就没有第二次入场；桥没握上手时 minimalBase 也是 false，不会凭空冒出一个空播放页。
            val playerShown = minimalBase || minimalCoverHold
            val playerZ = if (minimalBase&&!stageAboveMinimal) 3f else 0.5f
            AnimatedVisibility(
                visible = playerShown,
                // 入场只滑不淡：这一页不透明，淡入会强制一整屏离屏图层。
                // 360ms（320~380ms 目标带），入场是页面唯一的一套上滑 ——
                // WebView 侧的同名位移已在 composeOwnsMinimalEntry 里关掉。
                enter = if (minimalResumePending || minimalCoverHold) EnterTransition.None else slideInVertically(
                    animationSpec = tween(TingYuMotion.MinimalEnterMs, easing = TingYuMotion.StageEnter),
                    initialOffsetY = { it },
                ),
                exit = when (MinimalPlayerExitPolicy.exit(destination, page != null,minimalCollapseCommitted)) {
                    MinimalPlayerExitPolicy.Exit.NONE -> ExitTransition.None
                    MinimalPlayerExitPolicy.Exit.SLIDE_AND_FADE -> slideOutVertically(
                        animationSpec = tween(TingYuMotion.MinimalExitMs, easing = TingYuMotion.StageExit),
                        targetOffsetY = { it },
                    ) + fadeOut(tween(TingYuMotion.MinimalFadeMs))
                },
                modifier = Modifier.fillMaxSize().zIndex(playerZ).stageExitTransform(stageExit,exitProgress,slide=true),
            ) {
                MinimalPlayerSurface(
                    runtime = minimal,
                    commands = minimalCommands,
                    queue = queueState,
                    onOpenQueue = { openNativeQueue() },
                    onOpenTools = { page -> openNativeTools(page) },
                    // 每次新会话都从封面页开始（resetToken 变了 pager 状态会重建）；
                    // 完整舞台往返 / 设置往返不换令牌，页面状态与进出动画保持原样。
                    initialPage = 0,
                    resetToken = minimalSessionToken,
                    onPageChanged = { page ->
                        minimalCurrentPage = page
                        if(minimalLastPage!=page){minimalLastPage=page;listener.onAction("minimal",minimal.session(),"pageChanged",page.toDouble())}
                    },
                    light = interfaceLight,
                    safeTop = safeTop,
                    safeBottom = safeBottom,
                    onCollapse = { minimalCommands.collapse() },
                    onOpenStage = { minimalCommands.openStage() },
                    modifier = Modifier.fillMaxSize(),
                )
            }
            // 页面进组合后还要等它压上来（PUSH 240ms）才摘播放页；页面迟迟不来就超时放手，
            // 让接下来的退场照常走 —— 宁可有一次普通动画，也不要一直把播放页当遮罩举着。
            LaunchedEffect(minimalCoverHold, page?.key) {
                if (!minimalCoverHold) return@LaunchedEffect
                delay(if (page == null) MinimalPlayerExitPolicy.HOLD_TIMEOUT_MS else MinimalPlayerExitPolicy.COVER_SETTLE_MS)
                minimalCoverHold = false
            }
            // Consume only this resume. A later visit to the full stage keeps its usual motion.
            LaunchedEffect(minimalOwns,minimalResumePending){if(minimalOwns&&minimalResumePending){withFrameNanos{};minimalResumePending=false}}
            // 新会话从封面开始后，把 JS 侧的页面记录同步成 0：否则它仍记着上次的歌词页，
            // 下次「设置 → 返回播放器」时 shell 包会把旧页带回来，和封面不一致。
            LaunchedEffect(minimalSessionToken){
                if(minimalSessionToken>0){
                    minimalLastPage=0
                    if(minimal.session().isNotEmpty())
                        listener.onAction("minimal",minimal.session(),"pageChanged",0.0)
                }
            }
            // 队列抽屉：宿主级，和哪一页在显示无关 —— 极简页、舞台、首页都开这一张。
            // 开合动画（第 15 轮）：遮罩渐显渐隐，面板底部上滑 260ms / 下滑 200ms，
            // 与工具页共用 MinimalSheetMotion 一份节奏；拖拽排序与两档高度不受影响。
            MinimalSheetScrim(
                visible = queueOpen,
                light = interfaceLight,
                onClose = { queueOpen = false; minimalCommands.closeQueue() },
            )
            AnimatedVisibility(
                visible = queueOpen,
                enter = minimalSheetEnter(),
                exit = minimalSheetExit(),
                modifier = Modifier.fillMaxSize().zIndex(6f),
            ) {
                MinimalQueueSheet(
                    queue = queueState,
                    light = interfaceLight,
                    mode = queueState.mode.ifEmpty { minimalState.controls.mode },
                    // 列表状态宿主持有：去极简页再回来，队列浏览位置不跳。
                    listState = queueListState,
                    onClose = { queueOpen = false; queueCommands.closeQueue() },
                    onPlay = { queueCommands.queuePlay(it) },
                    onRemove = { queueCommands.queueRemove(it) },
                    onReorder = { from, to -> queueCommands.queueReorder(from, to, queueState.version) },
                    onToggleMode = { queueCommands.togglePlaybackMode() },
                )
            }
            // 工具页（音质/效果器/歌词工具/洛雪）：宿主级，叠在队列之下不冲突 ——
            // 打开前已互斥收起，歌词工具的“队列”标签也会先收自己再开队列。
            // 关闭时内容要留在组合里播 200ms 退场，所以用 lastToolsPage 记住最后一张页。
            var lastToolsPage by remember { mutableStateOf("") }
            LaunchedEffect(toolsPage) { if (toolsPage.isNotEmpty()) lastToolsPage = toolsPage }
            MinimalSheetScrim(
                visible = toolsPage.isNotEmpty(),
                light = interfaceLight,
                onClose = { closeNativeTools() },
            )
            AnimatedVisibility(
                visible = toolsPage.isNotEmpty(),
                enter = minimalSheetEnter(),
                exit = minimalSheetExit(),
                modifier = Modifier.fillMaxSize().zIndex(6f),
            ) {
                val toolsState by minimal.tools.collectAsState()
                when(lastToolsPage){
                    "quality"->io.github.huleixin.tingyu.minimal.ui.MinimalQualitySheet(
                        tools=toolsState,light=interfaceLight,actions=toolActions,
                        onClose={closeNativeTools()},
                        onOpenEffects={openNativeTools("effects")},
                        onOpenLx={openNativeTools("lx")},
                    )
                    "effects"->io.github.huleixin.tingyu.minimal.ui.MinimalEffectsSheet(
                        tools=toolsState,light=interfaceLight,actions=toolActions,
                        onClose={closeNativeTools()},
                    )
                    "lyrics"->io.github.huleixin.tingyu.minimal.ui.MinimalLyricsToolsSheet(
                        tools=toolsState,light=interfaceLight,actions=toolActions,transport=minimalCommands,
                        mode=minimalState.controls.mode,playing=minimalState.playback.playing,
                        onClose={closeNativeTools()},
                        onOpenQueue={closeNativeTools();openNativeQueue()},
                    )
                    "lx"->io.github.huleixin.tingyu.minimal.ui.MinimalLxSheet(
                        tools=toolsState,light=interfaceLight,actions=toolActions,
                        onClose={closeNativeTools()},
                    )
                }
            }
            if(stageExit.active)Box(Modifier.fillMaxSize().zIndex(4f).pointerInput(Unit){awaitPointerEventScope{while(true)awaitPointerEvent().changes.forEach{it.consume()}}})
            if(graphics.enabled)Text("N · 记闪烁",color=Color(0xFFB8FFE3),fontSize=10.sp,
                modifier=Modifier.zIndex(20f).offset(12.dp,(safeTop+3).dp).background(Color(0xDD09251C))
                    .clickable{graphicsMarker?.invoke()}.padding(horizontal=5.dp,vertical=3.dp))
            // 页面接管失败的可视状态（2026-11-05 第二轮）：Android 上旧 DOM 已不再渲染，
            // 一旦没有任何可呈递的页面（probe 失败 / 持续拒收 / 首页包未到达），不能让用户
            // 盯着 WebView 下面的空白。这里在超时后画一块原生错误页并提供重试，走的是
            // __refresh 动作（JS 侧 last=undefined + 重新 measure 重发），不复用旧 WebView UI。
            var pageFallback by remember{mutableStateOf(false)}
            LaunchedEffect(destination,presented?.key,webOverlay){
                val routeAtStart=destination
                val pageRoute=routeAtStart in setOf("home","collection","search","settings")
                pageFallback=false
                if(pageRoute&&presented==null&&!webOverlay){
                    kotlinx.coroutines.delay(1500)
                    if(presented==null&&destination==routeAtStart&&!webOverlay)pageFallback=true
                }
            }
            if(pageFallback)NativePageFallbackPanel(
                route=destination,
                light=LocalInterfacePalette.current.light,
                modifier=Modifier.fillMaxSize().zIndex(1.5f),
                onRetry={
                    pageFallback=false
                    pageListener?.onAction(destination,"","","__refresh","manual-retry",0.0)
                },
            )
            if(sleepMenuOpen&&!webOverlay&&active&&destination in setOf("home","collection"))Box(Modifier.fillMaxSize().zIndex(6f)) {
                MiniSleepMenu(sleepUi,sleepAnchor,safeTop,interfaceLight,backdrop,
                    preferredMinutes=surfaces["mini"]?.sleepPreferredMinutes?:30,reduced=reducedMotion){sleepMenuOpen=false}
            }
            supportSheet?.let{kind->SupportSheets(kind,supportCopyJson){supportSheet=null}}
            // 二级操作面板：盖在底栏/迷你播放器/极简页之上，任何路由都可呈现。
            TyPanelLayer(panelHost,interfaceLight,Modifier.fillMaxSize().zIndex(9f))
            }
        }
    }
    fun destroy() {
        routeFence.close()
        webSamplingLayer.close()
        graphics.close()
        chromeRemovalSerial++
        val compose = host ?: return
        active = false;navigationActionSerial++;clearStartupNavigation();stageExit.clear(); surfaces.clear();liveChrome.clear(); clocks.clear();pages.clear();retained.clear();presented=null
        panelHost.clear()
        io.github.huleixin.tingyu.NativeKeepScreenOn.reset()
        compose.disposeComposition()
        (web.parent as? ViewGroup)?.removeView(web)
        (compose.parent as? ViewGroup)?.removeView(compose)
        parent?.addView(web,index.coerceAtMost(parent?.childCount ?: 0),params)
        host = null; parent = null
    }
}

private fun navigationTrace(phase:String){NavigationTiming.mark(phase);if(android.util.Log.isLoggable("TingyuNavigation",android.util.Log.DEBUG))android.util.Log.d("TingyuNavigation","$phase at=${System.currentTimeMillis()}")}

/** 极简入场期间底栏的延迟摘除窗口：commit 延迟（真机 100~300ms）+ 360ms 上滑 + 余量。 */
private const val CHROME_ENTRY_GRACE_MS = 900L
