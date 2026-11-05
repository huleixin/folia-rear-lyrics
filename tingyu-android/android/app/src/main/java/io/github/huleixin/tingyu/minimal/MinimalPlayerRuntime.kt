package io.github.huleixin.tingyu.minimal

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import io.github.huleixin.tingyu.RearHostUpdates
import io.github.huleixin.tingyu.RearNativeLyricLines
import io.github.huleixin.tingyu.RearNativeTrack
import io.github.huleixin.tingyu.playback.NativePlaylist
import io.github.huleixin.tingyu.playback.UnifiedLyricsStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalPlayerRuntime.kt
//
// Compose 极简播放页的唯一数据源。**它是一片投影，不是一个播放器。**
//
// 读的三件事，各有一个既有的权威，这里一个都不新建：
//   · 歌与位置 → {@link RearNativeTrack}（Media3 的真实 MediaItem + 锚点外推，换歌递增 epoch）
//   · 歌词     → {@link RearNativeLyricLines} 的 rows（统一版本仲裁 + 偏移烘焙的同一个交付点）
//   · 控制能力 → 桥帧（播放模式、上一首/下一首可用性；这些只有 JS 侧知道）
//
// 不新建的东西同样明确：没有第二个 Player、没有第二份队列、没有第二个计时器。
// 状态只在**语义变化**时更新一次（换歌 / 播放暂停 / seek / 时长到达 / 歌词到位），
// 进度是读的时候按帧外推的 —— 见 {@link MinimalPlayback.positionMsAt}。
//
// 旧歌回写是这里唯一真正需要小心的东西：每个异步结果都带 (songKey, epoch)，
// 回来时和当前状态不一致就直接丢弃，绝不允许上一首的歌词或位置覆盖这一首。

/** 控制能力：只有 JS 侧知道「有没有下一首」「当前是哪个播放模式」。 */
data class MinimalControls(
    val canPrevious: Boolean = false,
    val canNext: Boolean = false,
    val disabled: Boolean = false,
    val preparing: Boolean = false,
    /** off | all | one | shuffle */
    val mode: String = "off",
    /** 桥帧是否还在有效期内。为 false 时命令不可发。 */
    val bound: Boolean = false,
    /** 音质标签（容器 + 平台规格），JS 侧已经拼好，原生只负责画。 */
    val quality: String = "",
    /** 全局音质标签层级（standard/hq/flac/hires/master/spatial）。空 = 无可靠信息，回退旧 chip。 */
    val qualityLevel: String = "",
    /** 无损标签的真实格式文案（APE/WAV/DSD/ALAC 不冒充 FLAC）；FLAC 为空。 */
    val qualityLabelOverride: String = "",
    /** 队列抽屉正在打开：`true` 时 JS 会持续把快照推过来。 */
    val queueOpen: Boolean = false,
    /** 播放偏好里的音质档位，只出现在「更多」菜单的第二列。 */
    val qualityMode: String = "",
    val effectsOn: Boolean = false,
    /**
     * 页面主题。`null` 表示桥上还没有结论 —— 此时才退回宿主给的界面主题。
     *
     * 这两个值不是同一件事：界面可以是浅色，而这一页跟随歌曲主题是深色。
     * 上一版直接用界面主题决定墨色，于是深色背景上画了一整套浅色主题的深绿字。
     */
    val light: Boolean? = null,
    val qualityGold: Boolean = false,
    val liked: Boolean = false,
    val likeDisabled: Boolean = true,
    /**
     * 正在「顺访」完整歌词舞台。
     *
     * 舞台仍然是 WebView，而原生页是整窗图层：不把这个状态带过来，原生页会盖在舞台上面。
     * 它不改变播放与歌词，只决定这一页现在该不该出现。
     */
    val detour: Boolean = false,
    /** 渲染来源诊断角标（临时）。 */
    val diag: Boolean = false,
)

data class MinimalPlayerState(
    val playback: MinimalPlayback = MinimalPlayback(),
    val lyrics: MinimalLyrics = MinimalLyrics(),
    val controls: MinimalControls = MinimalControls(),
    /**
     * JS 算好的六个颜色（`buildMinimalPalette` 的原样输出）。为 null 时才退回原生那份移植 ——
     * 两条路径画出来的页面必须一样，但只有一份是"定稿"，另一份只是兜底。
     */
    val palette: MinimalPalette? = null,
    val revision: Long = 0L,
)

/**
 * 封面与它的取色。
 *
 * [settled] 表示"这张图已经有结论了"（解码成功或确定失败）。封面页用它做交叉淡化的门：
 * 新封面没解码完之前保持旧封面，而不是先切到空白再补图。取色只算一次，与主题无关 ——
 * 深浅色各自从同一份 [CoverColors] 派生，切主题不需要重新采样。
 */
data class MinimalArtwork(
    val songKey: String = "",
    val url: String = "",
    val bitmap: android.graphics.Bitmap? = null,
    val colors: CoverColors? = null,
    val settled: Boolean = false,
)

/**
 * 桥帧：JS 侧那一半（播放模式、上一首/下一首可用性、以及浏览器音频通道的位置）。
 *
 * 只承载 Compose 页**没法**从原生拿到的东西。歌名、歌词、Media3 位置都不在这里 ——
 * 那些原生自己有权威来源，再经一次桥只会多一个可能对不上的副本。
 */
data class MinimalBridgeFrame(
    val session: String = "",
    val trackKey: String = "",
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    val cover: String = "",
    val playing: Boolean = false,
    val positionSec: Double = 0.0,
    val durationSec: Double = 0.0,
    val canPrevious: Boolean = false,
    val canNext: Boolean = false,
    val disabled: Boolean = false,
    val preparing: Boolean = false,
    val mode: String = "off",
    val quality: String = "",
    /** 全局音质标签层级（standard/hq/flac/hires/master/spatial）。空 = 无可靠信息。 */
    val qualityLevel: String = "",
    /** 无损标签的真实格式文案（APE/WAV/DSD/ALAC 不冒充 FLAC）；FLAC 为空。 */
    val qualityLabelOverride: String = "",
    val qualityGold: Boolean = false,
    val qualityMode: String = "",
    val effectsOn: Boolean = false,
    /** 这一页的主题，与 [MinimalBridgeFrame.palette] 同源。 */
    val light: Boolean = false,
    val liked: Boolean = false,
    val likeDisabled: Boolean = true,
    val detour: Boolean = false,
    /** 渲染来源诊断角标（临时）。JS 控制台 `__tingyuMinimalSource()` 开关，验收后删。 */
    val diag: Boolean = false,
    val palette: MinimalPalette? = null,
    val receivedAtElapsed: Long = 0L,
) {
    companion object {
        fun parse(value: JSONObject, nowElapsed: Long): MinimalBridgeFrame {
            fun seconds(key: String): Double =
                value.optDouble(key, 0.0).let { if (it.isFinite()) it.coerceIn(0.0, 604800.0) else 0.0 }
            return MinimalBridgeFrame(
                session = value.optString("session", "").take(160),
                trackKey = value.optString("trackKey", "").take(400),
                title = value.optString("title", "").take(300),
                artist = value.optString("artist", "").take(300),
                album = value.optString("album", "").take(300),
                cover = value.optString("cover", "").take(200000),
                playing = value.optBoolean("playing", false),
                positionSec = seconds("position"),
                durationSec = seconds("duration"),
                canPrevious = value.optBoolean("canPrevious", false),
                canNext = value.optBoolean("canNext", false),
                disabled = value.optBoolean("disabled", false),
                preparing = value.optBoolean("preparing", false),
                mode = value.optString("mode", "off").takeIf { it in MODES } ?: "off",
                palette = parsePalette(value.optJSONArray("palette")),
                quality = value.optString("quality", "").take(40),
                qualityLevel = value.optString("qualityLevel", "").take(16),
                qualityLabelOverride = value.optString("qualityLabelOverride", "").take(40),
                qualityGold = value.optBoolean("qualityGold", false),
                qualityMode = value.optString("qualityMode", "").take(40),
                effectsOn = value.optBoolean("effectsOn", false),
                light = value.optBoolean("light", false),
                liked = value.optBoolean("liked", false),
                likeDisabled = value.optBoolean("likeDisabled", true),
                detour = value.optBoolean("detour", false),
                diag = value.optBoolean("diag", false),
                receivedAtElapsed = nowElapsed,
            )
        }

        /** `["#RRGGBB" x6]` → Palette。任一格读不出来就整组放弃，不让半套配色混进页面。 */
        private fun parsePalette(array: JSONArray?): MinimalPalette? {
            if (array == null || array.length() < 6) return null
            val colors = IntArray(6)
            for (index in 0 until 6) {
                val raw = array.optString(index, "")
                colors[index] = try {
                    android.graphics.Color.parseColor(raw)
                } catch (error: IllegalArgumentException) {
                    return null
                }
            }
            return MinimalPalette(
                base = colors[0],
                fieldPrimary = colors[1],
                fieldSecondary = colors[2],
                bloom = colors[3],
                accent = colors[4],
                lyricAccent = colors[5],
                derived = true,
            )
        }

        private val MODES = setOf("off", "all", "one", "shuffle")
    }
}

class MinimalPlayerRuntime private constructor(private val appContext: Context) {

    companion object {
        /** 桥 1 s 一帧；连着丢 4 帧就认为它停了，位置冻结在原处，不凭空往前跑。 */
        private const val BRIDGE_EXTRAPOLATION_CAP_MS = 4_000L

        /** 超过这个时间没有桥帧，就认为桥断了（换歌/暂停时 JS 会立刻发，不该沉默这么久）。 */
        private const val BRIDGE_FRAME_MAX_AGE_MS = 20_000L

        /** 歌词还在等的时候，多久重读一次交付点。 */
        private const val LYRIC_RETRY_MS = 1_000L

        /** 重读上限：30 s。取词本来就可能要几十秒，但不能无限轮询。 */
        private const val LYRIC_RETRY_LIMIT = 30

        @Volatile
        private var instance: MinimalPlayerRuntime? = null

        @JvmStatic
        fun get(context: Context): MinimalPlayerRuntime {
            instance?.let { return it }
            synchronized(MinimalPlayerRuntime::class.java) {
                instance?.let { return it }
                return MinimalPlayerRuntime(context.applicationContext).also { instance = it }
            }
        }

        /** 未创建时返回 null：诊断路径不该顺手把整个运行时拉起来。 */
        @JvmStatic
        fun peek(): MinimalPlayerRuntime? = instance
    }

    private val main = Handler(Looper.getMainLooper())
    private val lyricsIo = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "minimal-player-lyrics").apply { isDaemon = true }
    }
    private val artworkIo = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "minimal-player-artwork").apply { isDaemon = true }
    }
    private val store = UnifiedLyricsStore.get(appContext)
    private val revisionCounter = AtomicInteger(0)

    private val _state = MutableStateFlow(MinimalPlayerState())
    val state: StateFlow<MinimalPlayerState> = _state.asStateFlow()

    /**
     * 桥的存活状态单独一条流：宿主只需要它来决定"画不画原生页"，而这个事实一秒才可能变一次。
     * 把它塞进 {@code state} 里会让整个场景按帧重建一遍，代价完全没必要。
     */
    private val _bound = MutableStateFlow(false)
    val bound: StateFlow<Boolean> = _bound.asStateFlow()

    private val _artwork = MutableStateFlow(MinimalArtwork())
    val artwork: StateFlow<MinimalArtwork> = _artwork.asStateFlow()

    /** 队列快照。独立一条流：一次打开只变一两次，不该让整页跟着重组。 */
    private val _queue = MutableStateFlow(MinimalQueue())
    val queue: StateFlow<MinimalQueue> = _queue.asStateFlow()

    /**
     * JS 推来的队列投影。版本号倒退的包直接丢 —— 动作是异步的，乱序到达会让列表闪回。
     */
    fun onQueueSnapshot(value: JSONObject): Boolean {
        val next = MinimalQueue.parse(value)
        if (next == null) {
            android.util.Log.w("TingyuQueue", "snapshot rejected: unparseable")
            return false
        }
        if (next.version < _queue.value.version) {
            // 版本倒退：动作是异步的，乱序包会让列表闪回。接受但不采用。
            android.util.Log.d("TingyuQueue", "snapshot stale v=${next.version} < ${_queue.value.version}")
            return true
        }
        _queue.value = next
        android.util.Log.d("TingyuQueue", "snapshot v=${next.version} n=${next.total} current=${next.currentIndex}")
        return true
    }

    fun clearQueue() {
        _queue.value = MinimalQueue()
    }

    /**
     * 轻量当前曲/播放模式通道：切歌不改队列数组，整包（几百首）不该每切一首都过桥。
     * JS 在「版本没变但当前曲或模式变了」时只推这一小包。
     */
    fun onQueueCurrent(value: JSONObject) {        val current = _queue.value
        if (current.items.isEmpty()) return
        val version = value.optLong("v", current.version)
        if (version < current.version) return // 过期包：队列已经更新过，丢弃。
        val key = value.optString("k", "")
        val index = value.optInt("i", -1)
        val mode = value.optString("mode", "").takeIf { it in setOf("off", "all", "one", "shuffle") }
        val resolvedIndex = when {
            index in current.items.indices && current.items[index].songKey == key -> index
            key.isNotEmpty() -> current.items.indexOfFirst { it.songKey == key }.takeIf { it >= 0 } ?: -1
            else -> -1
        }
        _queue.value = current.copy(
            currentIndex = resolvedIndex,
            currentKey = key,
            mode = mode ?: current.mode,
        )
    }

    /**
     * 工具页（音质/效果器/歌词工具/洛雪音源）的状态流。只有页面打开期间 JS 才会推。
     * 版本倒退的包丢弃 —— 与队列同一套乱序保护。
     */
    private val _tools = MutableStateFlow(MinimalTools())
    val tools: StateFlow<MinimalTools> = _tools.asStateFlow()

    fun onToolsSnapshot(value: JSONObject): Boolean {
        val next = MinimalTools.parse(value)
        if (next == null) {
            android.util.Log.w("TingyuTools", "tools snapshot rejected: unparseable")
            return false
        }
        val current = _tools.value
        if (next.version < current.version) {
            android.util.Log.d("TingyuTools", "tools stale v=${next.version} < ${current.version}")
            return true
        }
        _tools.value = next
        return true
    }

    fun clearTools() {
        _tools.value = MinimalTools()
    }

    @Volatile
    private var frame: MinimalBridgeFrame? = null

    @Volatile
    private var frameGeneration = 0

    @Volatile
    private var lastFrameTrackKey = ""

    /** 已经在飞的歌词读取（同一首只留最后一次）。 */
    @Volatile
    private var lyricRequestToken = 0

    /** 封面读取代次。 */
    @Volatile
    private var artworkRequestToken = 0

    private var lyricRetryAttempts = 0
    private var lyricRetrySong = ""
    private var lyricRetryEpoch = ""

    private var refreshing = false
    private var refreshPending = false
    private var started = false

    private val hostListener = RearHostUpdates.Listener { scheduleRefresh() }
    private val storeListener = UnifiedLyricsStore.Observer { songKey ->
        if (songKey == _state.value.playback.track.key) scheduleRefresh()
    }

    private val lyricRetry = Runnable {
        val current = _state.value
        if (current.lyrics.status != MinimalLyricsStatus.LOADING) return@Runnable
        if (current.playback.track.key != lyricRetrySong || current.playback.epoch != lyricRetryEpoch) return@Runnable
        if (lyricRetryAttempts >= LYRIC_RETRY_LIMIT) return@Runnable
        lyricRetryAttempts++
        requestLyrics(current.playback.track.key, current.playback.epoch, force = true)
    }

    /** 进程内只需挂一次；重复调用无副作用。 */
    fun start() {
        if (started) return
        started = true
        RearHostUpdates.observe(hostListener)
        store.observe(storeListener)
        scheduleRefresh()
    }

    fun stop() {
        if (!started) return
        started = false
        RearHostUpdates.unobserve(hostListener)
        store.unobserve(storeListener)
        main.removeCallbacks(lyricRetry)
    }

    // ---- 桥 ----

    /** 收到 JS 的桥帧。只接受同一份 session 里最新的那一帧。 */
    fun onBridgeFrame(value: JSONObject) {
        val now = SystemClock.elapsedRealtime()
        val next = MinimalBridgeFrame.parse(value, now)
        if (next.session.isEmpty()) return
        val previous = frame
        if (previous?.session != next.session) {
            android.util.Log.i("TingyuMinimal", "bridge session bound ${next.session.take(8)} at=${System.currentTimeMillis()}")
        }
        if (previous != null && previous.session == next.session && next.trackKey != lastFrameTrackKey) {
            // 同一会话换歌：代次 +1，旧歌的异步结果就此作废。
            frameGeneration++
        }
        lastFrameTrackKey = next.trackKey
        frame = next
        scheduleRefresh()
    }

    fun clearBridge() {
        if (frame != null) {
            android.util.Log.i("TingyuMinimal", "bridge cleared (bound=false) at=${System.currentTimeMillis()}")
        }
        frame = null
        _bound.value = false
        _state.value = _state.value.copy(
            controls = _state.value.controls.copy(bound = false),
            revision = revisionCounter.incrementAndGet().toLong(),
        )
        scheduleRefresh()
    }

    /**
     * 交还界面：只有发起方自己的 session 才能撤销，晚到的旧 release 不能把新会话拆掉。
     *
     * 交还之后原生立刻停止绘制（{@code bound} 变 false），屏幕交回 WebView —— 这是"打开 JS 面板"
     * 这类动作需要的语义：原生页是整窗图层，不能盖在还留在 WebView 里的面板上面。
     */
    fun releaseSession(session: String) {
        if (session.isEmpty()) return
        if (frame?.session != session) return
        android.util.Log.i("TingyuMinimal", "release session=${session.take(8)} (JS handback) at=${System.currentTimeMillis()}")
        clearBridge()
    }

    fun session(): String = frame?.session ?: ""

    /**
     * 桥是否还活着。UI 的可用性与命令路由都只认这一个判断 —— 桥断开后按钮必须是灰的，
     * 否则按下去只会发一个没人接的指令。
     */
    fun bridgeLive(): Boolean {
        val current = frame ?: return false
        return current.session.isNotEmpty() &&
            SystemClock.elapsedRealtime() - current.receivedAtElapsed <= BRIDGE_FRAME_MAX_AGE_MS
    }

    // ---- 刷新 ----

    private fun scheduleRefresh() {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            refresh()
            return
        }
        main.post { refresh() }
    }

    private fun refresh() {
        // RearHostUpdates 的监听可能在播放器回调里触发，重入时只标记，不在回调里做重活。
        if (refreshing) {
            refreshPending = true
            return
        }
        refreshing = true
        try {
            publish(resolve())
        } finally {
            refreshing = false
            if (refreshPending) {
                refreshPending = false
                main.post { refresh() }
            }
        }
    }

    private fun resolve(): MinimalPlayerState {
        val native = try {
            RearNativeTrack.snapshot()
        } catch (_: Throwable) {
            JSONObject()
        }
        val nativeKey = native.optString("songKey", "")
        val engine = native.optString("engine", "")
        // 身份与控制能力用**最后一帧**，不看新鲜度：桥停了以后页面应该停在最后一首、最后一个模式下，
        // 而不是突然清空。位置由 {@link MinimalPlayback.maxExtrapolationMs} 冻结（见 resolve 里的 cap）。
        val bridge = frame
        val bridgeKey = bridge?.trackKey ?: ""
        val bridgePlaying = bridge?.playing == true

        // 身份：Media3 说话时它是唯一权威；否则用桥报的那一首（浏览器音频通道原生没有别的来源）。
        val key = if (engine == "media3" && nativeKey.isNotEmpty()) nativeKey else bridgeKey.ifEmpty { nativeKey }
        val catalogTrack = if (key.isEmpty()) null else try {
            NativePlaylist.get().trackFor(key)
        } catch (_: Throwable) {
            null
        }
        val track = identitySafeTrack(key, engine, nativeKey, native, bridge, catalogTrack)

        val playback = when {
            engine == "media3" && key.isNotEmpty() -> MinimalPlayback(
                track = track,
                playing = native.optBoolean("playing", false),
                anchorPositionMs = native.optLong("anchorPositionMs", 0L),
                anchorElapsedMs = native.optLong("anchorElapsedMs", 0L),
                playbackRate = native.optDouble("playbackRate", 1.0).toFloat().takeIf { it.isFinite() && it > 0f } ?: 1f,
                source = MinimalClockSource.ENGINE,
                epoch = native.optString("epoch", ""),
                buffering = native.optBoolean("buffering", false),
            )

            bridge != null && bridgeKey.isNotEmpty() -> MinimalPlayback(
                track = track,
                playing = bridgePlaying,
                anchorPositionMs = (bridge.positionSec * 1000.0).toLong(),
                anchorElapsedMs = bridge.receivedAtElapsed,
                playbackRate = 1f,
                source = MinimalClockSource.BRIDGE,
                epoch = "$bridgeKey#bridge$frameGeneration",
                maxExtrapolationMs = BRIDGE_EXTRAPOLATION_CAP_MS,
                buffering = bridge.preparing,
            )

            else -> MinimalPlayback(track = track, source = MinimalClockSource.NONE)
        }

        val controls = MinimalControls(
            canPrevious = bridge?.canPrevious == true,
            canNext = bridge?.canNext == true,
            disabled = bridge?.disabled ?: true,
            preparing = bridge?.preparing == true,
            mode = bridge?.mode ?: "off",
            // 「已经交接过」是长期事实：原生据此决定画不画这一页。命令能不能发用 {@link #bridgeLive()}，
            // 那是严格的新鲜度判断 —— 两者混用会出现「页面在、按钮全灰」或者「页面没了、按钮还亮」。
            bound = bridge != null && bridge.session.isNotEmpty(),
            quality = bridge?.quality ?: "",
            qualityLevel = bridge?.qualityLevel ?: "",
            qualityLabelOverride = bridge?.qualityLabelOverride ?: "",
            qualityGold = bridge?.qualityGold == true,
            qualityMode = bridge?.qualityMode ?: "",
            effectsOn = bridge?.effectsOn == true,
            light = bridge?.light ?: false,
            liked = bridge?.liked == true,
            likeDisabled = bridge?.likeDisabled ?: true,
            detour = bridge?.detour == true,
            diag = bridge?.diag == true,
        )
        return MinimalPlayerState(
            playback = playback,
            lyrics = lyricsFor(playback.track.key, playback.epoch),
            controls = controls,
            // 桥断了也不能把背景闪回默认色：那是"页面还在、颜色先变了"，比旧色更突兀。
            palette = bridge?.palette ?: _state.value.palette,
            revision = revisionCounter.incrementAndGet().toLong(),
        )
    }

    private fun publish(next: MinimalPlayerState) {        val previous = _state.value
        _state.value = next
        _bound.value = next.controls.bound
        if (previous.playback.track.key != next.playback.track.key || previous.playback.epoch != next.playback.epoch) {
            lyricRetryAttempts = 0
            main.removeCallbacks(lyricRetry)
            requestLyrics(next.playback.track.key, next.playback.epoch, force = true)
        } else if (next.lyrics.status == MinimalLyricsStatus.LOADING && previous.lyrics.status != MinimalLyricsStatus.LOADING) {
            scheduleLyricRetry(next.playback.track.key, next.playback.epoch)
        }
        if (previous.playback.track.key != next.playback.track.key ||
            previous.playback.track.artwork != next.playback.track.artwork
        ) {
            requestArtwork(next.playback.track.key, next.playback.track.artwork)
        }
    }

    private fun lyricsFor(songKey: String, epoch: String): MinimalLyrics {
        val current = _state.value.lyrics
        return if (current.songKey == songKey && current.epoch == epoch) current
        else MinimalLyrics(songKey = songKey, epoch = epoch, status = MinimalLyricsStatus.LOADING)
    }

    // ---- 歌词 ----

    private fun scheduleLyricRetry(songKey: String, epoch: String) {
        if (songKey.isEmpty()) return
        if (lyricRetryAttempts >= LYRIC_RETRY_LIMIT) return
        lyricRetrySong = songKey
        lyricRetryEpoch = epoch
        main.removeCallbacks(lyricRetry)
        main.postDelayed(lyricRetry, LYRIC_RETRY_MS)
    }

    /**
     * 从交付点取 rows。读取会碰磁盘（首次未命中），所以放在单线程后台执行；
     * 结果回到主线程时再比一次 (songKey, epoch)，旧歌的结果一律丢弃。
     */
    fun requestLyrics(songKey: String, epoch: String, force: Boolean) {
        if (songKey.isEmpty()) return
        val token = ++lyricRequestToken
        lyricsIo.execute {
            val rows = try {
                RearNativeLyricLines.rowsJson(appContext, songKey)
            } catch (_: Throwable) {
                null
            }
            val version = try {
                RearNativeLyricLines.versionOf(appContext, songKey)
            } catch (_: Throwable) {
                ""
            }
            main.post { applyLyrics(token, songKey, epoch, rows, version, force) }
        }
    }

    private fun applyLyrics(token: Int, songKey: String, epoch: String, rows: String?, version: String, force: Boolean) {
        if (token != lyricRequestToken) return
        val current = _state.value
        if (current.playback.track.key != songKey || current.playback.epoch != epoch) return
        val parsed = MinimalLyrics.fromRows(rows, songKey, epoch, version)
        val settled = parsed.status == MinimalLyricsStatus.READY || parsed.status == MinimalLyricsStatus.NONE
        if (!force && settled && parsed.version == current.lyrics.version && parsed.status == current.lyrics.status) return
        _state.value = current.copy(lyrics = parsed, revision = revisionCounter.incrementAndGet().toLong())
        if (parsed.status == MinimalLyricsStatus.LOADING) {
            scheduleLyricRetry(songKey, epoch)
        } else {
            main.removeCallbacks(lyricRetry)
        }
    }

    /** 从后台回到前台、或页面重建时用：重新读一次权威，不改变任何播放状态。 */
    fun refreshNow() {
        requestLyrics(_state.value.playback.track.key, _state.value.playback.epoch, force = true)
        scheduleRefresh()
    }

    // ---- 封面 ----

    /**
     * 取封面并按一次色。只在换歌/换封面时触发；结果带 (songKey, url) 校验，旧歌的结果丢弃。
     *
     * 阻塞读放在后台线程（仓库内部是内存 LRU + 磁盘 + 受控下载），解码完再回主线程发布 ——
     * 封面页的交叉淡化要的正是"图已经在了"这个时刻。
     */
    fun requestArtwork(songKey: String, url: String) {
        val token = ++artworkRequestToken
        if (songKey.isEmpty()) {
            _artwork.value = MinimalArtwork(settled = true)
            return
        }
        val previous = _artwork.value
        // 同一首歌、同一张图：已经有结论就不重复读（列表滚动或状态刷新会反复经过这里）。
        if (previous.songKey == songKey && previous.url == url && previous.settled) return
        artworkIo.execute {
            val bitmap = try {
                loadArtworkBitmap(songKey, url)
            } catch (_: Throwable) {
                null
            }
            val colors = coverColorsOf(bitmap)
            main.post {
                if (token != artworkRequestToken) return@post
                if (_state.value.playback.track.key != songKey) return@post
                _artwork.value = MinimalArtwork(
                    songKey = songKey,
                    url = url,
                    bitmap = bitmap,
                    colors = colors,
                    settled = true,
                )
            }
        }
    }

    private fun loadArtworkBitmap(songKey: String, url: String): android.graphics.Bitmap? {
        if (url.isBlank()) return null
        val lower = url.lowercase(java.util.Locale.US)
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            return io.github.huleixin.tingyu.playback.NativeArtworkRepository.get(appContext)
                .load(songKey, url)?.bitmap
        }
        // 本地曲库的封面是 content:// 或 file://；仓库只走网络，这里直接解码。
        // blob: 是 WebView 内部的临时 URL，原生读不到 —— 那种封面会显示占位图。
        if (lower.startsWith("content://") || lower.startsWith("file://")) {
            return try {
                appContext.contentResolver.openInputStream(android.net.Uri.parse(url))?.use { stream ->
                    android.graphics.BitmapFactory.decodeStream(stream)
                }
            } catch (_: Throwable) {
                null
            }
        }
        return null
    }

    /** 诊断：一眼看清这一页现在读到了什么，不返回歌词正文。 */
    fun diagnostics(): JSONObject = JSONObject().apply {
        val state = _state.value
        val playback = state.playback
        put("songKey", playback.track.key)
        put("epoch", playback.epoch)
        put("source", playback.source.name.lowercase())
        put("playing", playback.playing)
        put("anchorPositionMs", playback.anchorPositionMs)
        put("anchorElapsedMs", playback.anchorElapsedMs)
        put("durationMs", playback.track.durationMs)
        put("positionMs", playback.positionMsAt(SystemClock.elapsedRealtime()))
        put("trackPresent", playback.track.present)
        put("lyricsStatus", state.lyrics.status.name.lowercase())
        put("lyricsLines", state.lyrics.lines.size)
        put("lyricsVersion", state.lyrics.version)
        put("lyricsWordByWord", state.lyrics.wordByWord)
        put("bridgeBound", state.controls.bound)
        put("bridgeSession", frame?.session ?: "")
        put("mode", state.controls.mode)
        put("canNext", state.controls.canNext)
        put("canPrevious", state.controls.canPrevious)
        put("revision", state.revision)
    }
}

/**
 * 身份校验补齐（1.3.151）：每一条歌曲相关字段只信"描述的就是这一首"的来源。
 *
 * 之前的回退链会在 Media3 已换歌但元数据未到时拿**旧桥帧**（上一首的）来补 ——
 * 新 key 配旧歌名/旧时长/旧封面，正是"信息没跟着切"的错配来源。
 * 现在桥帧只在它描述同一首歌时可用；身份不符就退回同 key 的 NativePlaylist 元数据，
 * 再没有就如实留空，绝不混用两首歌的信息。纯函数，单测直接覆盖。
 */
internal fun identitySafeTrack(
    key: String,
    engine: String,
    nativeKey: String,
    native: JSONObject,
    bridge: MinimalBridgeFrame?,
    catalogTrack: NativePlaylist.Track?,
): MinimalTrack {
    val nativeMatchesKey = engine == "media3" && nativeKey == key && key.isNotEmpty()
    val bridgeMatchesKey = bridge != null && bridge.trackKey == key && key.isNotEmpty()

    val title = (if (nativeMatchesKey) native.optString("title", "").takeIf { it.isNotEmpty() } else null)
        ?: (if (bridgeMatchesKey) bridge?.title?.takeIf { it.isNotBlank() } else null)
        ?: catalogTrack?.title?.takeIf { it.isNotBlank() }
        ?: ""

    val artist = (if (nativeMatchesKey) native.optString("artist", "").takeIf { it.isNotEmpty() } else null)
        ?: (if (bridgeMatchesKey) bridge?.artist?.takeIf { it.isNotBlank() } else null)
        ?: catalogTrack?.artist?.takeIf { it.isNotBlank() }
        ?: ""

    val album = (if (bridgeMatchesKey) bridge?.album?.takeIf { it.isNotBlank() } else null)
        ?: catalogTrack?.album?.takeIf { it.isNotBlank() }
        ?: ""

    val artwork = catalogTrack?.artwork?.takeIf { it.isNotBlank() }
        ?: (if (bridgeMatchesKey) bridge?.cover?.takeIf { it.isNotBlank() } else null)
        ?: ""

    val nativeDuration = native.optLong("durationMs", 0L)
    val bridgeDuration = if (bridgeMatchesKey && (bridge?.durationSec ?: 0.0) > 0.0) {
        ((bridge?.durationSec ?: 0.0) * 1000.0).toLong()
    } else 0L
    val durationMs = (if (nativeMatchesKey && nativeDuration > 0L) nativeDuration else null)
        ?: bridgeDuration.takeIf { it > 0L }
        ?: catalogTrack?.durationMs?.takeIf { it > 0L }
        ?: 0L

    return MinimalTrack(
        key = key,
        title = title,
        artist = artist,
        album = album,
        artwork = artwork,
        durationMs = durationMs,
    )
}
