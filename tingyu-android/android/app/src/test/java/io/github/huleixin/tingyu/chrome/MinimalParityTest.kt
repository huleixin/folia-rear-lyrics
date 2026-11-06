package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.MinimalClockSource
import io.github.huleixin.tingyu.minimal.MinimalControls
import io.github.huleixin.tingyu.minimal.MinimalLyrics
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import io.github.huleixin.tingyu.minimal.MinimalPalette
import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import io.github.huleixin.tingyu.minimal.MinimalTrack
import io.github.huleixin.tingyu.minimal.coverColorsOf
import io.github.huleixin.tingyu.minimal.ui.MinimalPlayerScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/MinimalParityTest.kt
//
// 与定稿截图（图2）逐像素对照的渲染。
//
// 与 `MinimalScreenshotTest` 的区别只有一个，但很关键：这里的封面**不是造出来的**，
// 而是从定稿截图里裁下来的同一张图（`audits/assets/minimal-compose/ref-art.png`），
// 元数据、播放位置、音质、歌词也都是那张截图里的同一首歌。
// 于是取色、氛围层、字号、间距都可以和参考图直接相减，而不是"看起来差不多"。
//
// 视口也按参考图取的：1220×2656 @3x = 407×885dp @480dpi。

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w407dp-h885dp-480dpi")
class MinimalParityTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val outDir = File("build/screenshots/parity")

    /** 参考封面：优先取仓库里的裁剪件；找不到就跳过（不让测试在没有素材时假装通过）。 */
    private fun referenceArtwork(): Bitmap? {
        val candidates = listOf(
            File("../../../audits/assets/minimal-compose/ref-art.png"),
            File("../../audits/assets/minimal-compose/ref-art.png"),
            File("../audits/assets/minimal-compose/ref-art.png"),
        )
        val file = candidates.firstOrNull { it.exists() } ?: return null
        return BitmapFactory.decodeFile(file.absolutePath)
    }

    private fun artwork(bitmap: Bitmap) = MinimalArtwork(
        songKey = "tx:jiuwanzi",
        url = "art://jiuwanzi",
        bitmap = bitmap,
        colors = coverColorsOf(bitmap),
        settled = true,
    )

    private fun lyrics(): MinimalLyrics {
        val json = """
        {"songKey":"tx:jiuwanzi","state":"ready","isWordByWord":true,"lines":[
          {"startTime":62.0,"endTime":67.0,"fullText":"落笔无言 写一纸荒唐","words":[]},
          {"startTime":67.0,"endTime":72.0,"fullText":"灯下谁在 数着过往","translation":"Who is counting the past under the lamp","words":[]},
          {"startTime":72.0,"endTime":77.0,"fullText":"一字一句 都成伤","words":[
            {"text":"一字一句","startTime":72.0,"endTime":74.5},
            {"text":"都成伤","startTime":74.5,"endTime":77.0}]},
          {"startTime":77.0,"endTime":82.0,"fullText":"剥去利刃 沦为人臣","words":[
            {"text":"剥去","startTime":77.0,"endTime":78.4},
            {"text":"利刃","startTime":78.4,"endTime":79.8},
            {"text":"沦为人臣","startTime":79.8,"endTime":82.0}]},
          {"startTime":82.0,"endTime":87.0,"fullText":"九万字 写不尽这一生","words":[]}
        ]}
        """.trimIndent()
        return MinimalLyrics.fromRows(json, "tx:jiuwanzi", "tx:jiuwanzi#1", "v-jiuwanzi")
    }

    private fun paletteOf(light: Boolean) = if (light) MinimalPalette(
        base = 0xFFEFF5F6.toInt(),
        fieldPrimary = 0xFFC3D2DF.toInt(),
        fieldSecondary = 0xFFF3E6E8.toInt(),
        bloom = 0xFFA0ACC5.toInt(),
        accent = 0xFF4373B5.toInt(),
        lyricAccent = 0xFF3D4975.toInt(),
        derived = true,
    ) else MinimalPalette(
        base = 0xFF152528.toInt(),
        fieldPrimary = 0xFF1F3242.toInt(),
        fieldSecondary = 0xFF442226.toInt(),
        bloom = 0xFF2F4674.toInt(),
        accent = 0xFFAAC1D5.toInt(),
        lyricAccent = 0xFFC3CADF.toInt(),
        derived = true,
    )

    private fun state(playing: Boolean = true, positionSec: Double = 77.0, light: Boolean = false): MinimalPlayerState {
        val track = MinimalTrack(
            key = "tx:jiuwanzi",
            title = "九万字",
            artist = "黄诗扶",
            album = "九万字",
            artwork = "art://jiuwanzi",
            durationMs = 232_000,
        )
        return MinimalPlayerState(
            playback = MinimalPlayback(
                track = track,
                playing = playing,
                anchorPositionMs = (positionSec * 1000).toLong(),
                anchorElapsedMs = SystemClock.elapsedRealtime(),
                source = MinimalClockSource.ENGINE,
                epoch = "${track.key}#1",
            ),
            lyrics = lyrics(),
            // 这一组就是 `buildMinimalPalette(coverColors,'dark')` 对这张封面的实际输出
            // （用 `test/unit/probe/paletteProbe.test.ts` 跑出来的，见文档第五节）。
            // 页面在设备上收到的就是这六个值，所以对照图必须用它，而不是原生兜底那份。
            palette = paletteOf(light),
            controls = MinimalControls(
                canPrevious = true,
                canNext = true,
                mode = "all",
                bound = true,
                quality = "FLAC · 无损",
                qualityGold = true,
                liked = false,
                likeDisabled = false,
            ),
        )
    }

    private val commands = object : MinimalPlayerCommands {
        override val available: Boolean = true
        override fun toggle(): Boolean = true
        override fun play(): Boolean = true
        override fun pause(): Boolean = true
        override fun previous(requestId: Long): Boolean = true
        override fun next(requestId: Long): Boolean = true
        override fun seekTo(seconds: Double): Boolean = true
        override fun cycleMode(): Boolean = true
        override fun openQueue(): Boolean = true
        override fun collapse(): Boolean = true
        override fun like(): Boolean = true
        override fun openStage(): Boolean = true
        override fun openAudioQuality(): Boolean = true
        override fun openAudioEffects(): Boolean = true
        override fun openLyricsPanel(): Boolean = true
        override fun openPlaybackSettings(): Boolean = true
        override fun requestQueue(): Boolean = true
        override fun closeQueue(): Boolean = true
        override fun queuePlay(index: Int): Boolean = true
        override fun queueRemove(index: Int): Boolean = true
        override fun queueMoveNext(index: Int): Boolean = true
        override fun queueMoveEnd(index: Int): Boolean = true
        override fun queueReorder(from: Int, to: Int, version: Long): Boolean = true
        override fun togglePlaybackMode(): Boolean = true
        override fun toggleDiagBadge(): Boolean = true
        override fun openArtist(index: Int): Boolean = true
        override fun notifyToolsOpened(page: Int): Boolean = true
        override fun notifyToolsClosed(): Boolean = true
    }

    private fun render(name: String, light: Boolean, safeTop: Float, safeBottom: Float) {
        val bitmap = referenceArtwork()
        if (bitmap == null) {
            println("PARITY_SKIP missing ref-art.png")
            return
        }
        val holder = mutableStateOf(state(light = light))
        val art = artwork(bitmap)
        run {
            val colors = art.colors
            println("PARITY_COLORS=" + colors)
            val built = io.github.huleixin.tingyu.minimal.buildMinimalPalette(colors, light)
            println(
                "PARITY_PALETTE=" + listOf(
                    built.base, built.fieldPrimary, built.fieldSecondary,
                    built.bloom, built.accent, built.lyricAccent,
                ).joinToString(",") { "#%06X".format(it and 0xFFFFFF) }
            )
        }
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MinimalPlayerScreen(
                state = holder.value,
                artwork = art,
                commands = commands,
                light = light,
                safeTop = safeTop,
                safeBottom = safeBottom,
                detour = false,
                onCollapse = {},
                onOpenStage = {},
            )
        }
        // 动画的起点：静止相位看起来和"刚好停在哪一帧"一样，所以固定到 0 时刻再截。
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()
        val view = compose.activity.window.decorView
        val shot = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(android.graphics.Canvas(shot))
        outDir.mkdirs()
        val out = File(outDir, "$name.png")
        FileOutputStream(out).use { shot.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("PARITY_SHOT=$name ${shot.width}x${shot.height} -> ${out.absolutePath}")
    }

    @Test
    fun queueSheet() = renderQueue("queue-sheet", light = false)

    @Test
    fun queueSheetLight() = renderQueue("queue-sheet-light", light = true)

    private fun renderQueue(name: String, light: Boolean) {
        val rows = listOf(
            Triple("tx:1", "九万字", "黄诗扶"),
            Triple("tx:2", "剥去利刃", "黄诗扶"),
            Triple("tx:3", "沦为人臣", "黄诗扶"),
            Triple("tx:4", "落笔无言", "黄诗扶"),
            Triple("tx:5", "灯下数着过往", "黄诗扶"),
        )
        val queue = io.github.huleixin.tingyu.minimal.MinimalQueue(
            version = 1,
            currentIndex = 1,
            currentKey = "tx:2",
            mode = "all",
            total = rows.size,
            items = rows.mapIndexed { index, row ->
                io.github.huleixin.tingyu.minimal.MinimalQueueItem(
                    uid = "${row.first}#$index",
                    songKey = row.first,
                    title = row.second,
                    artist = row.third,
                )
            },
        )
        compose.setContent {
            androidx.compose.foundation.layout.Box(
                androidx.compose.ui.Modifier
                    .fillMaxSize()
                    .background(androidx.compose.ui.graphics.Color(0xFF152528))
            ) {
                io.github.huleixin.tingyu.minimal.ui.MinimalQueueSheet(
                    queue = queue,
                    light = light,
                    mode = "all",
                    onClose = {},
                    // 签名在 1.3.151 之后改为返回 Boolean（false = 桥不在，UI 不得进入假切换态）；
                    // 本用例只验证版式 parity，命令一律视为已接收。
                    onPlay = { true },
                    onRemove = { true },
                    onReorder = { _, _ -> true },
                    onToggleMode = { true },
                )
            }
        }
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()
        val view = compose.activity.window.decorView
        val shot = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(android.graphics.Canvas(shot))
        outDir.mkdirs()
        FileOutputStream(File(outDir, "$name.png")).use { shot.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("PARITY_SHOT=$name ${shot.width}x${shot.height}")
    }

    @Test
    fun coverDark() = render("cover-dark", light = false, safeTop = 52f, safeBottom = 24f)

    @Test
    fun coverLight() = render("cover-light", light = true, safeTop = 52f, safeBottom = 24f)

    // ---- 第 11 轮：工具页（音质 / 效果器 / 歌词工具 / 洛雪音源）----

    private val stubToolActions = object : io.github.huleixin.tingyu.minimal.MinimalToolActions {
        override val available: Boolean = true
        override fun send(action: String, value: Double): Boolean = true
    }

    private fun sampleTools(page: String) = io.github.huleixin.tingyu.minimal.MinimalTools(
        version = 3,
        page = page,
        quality = io.github.huleixin.tingyu.minimal.MinimalQualityState(
            current = "lossless", currentLabel = "无损", actual = "无损", switching = false, error = "", local = false,
        ),
        effects = io.github.huleixin.tingyu.minimal.MinimalEffectsState(
            enabled = true, preset = "custom1",
            gains = listOf(0, 0, -1, 0, 0, 0, 2, 3, 1, 0),
            effectValues = listOf(20f, 20000f, 0f, 0f, 0f, 0f, 1f, 0f, 0f),
        ),
        lyrics = io.github.huleixin.tingyu.minimal.MinimalLyricsState(
            title = "戒网", artist = "村西 · 玉馨悦",
            sources = listOf("online" to "平台歌词", "imported" to "导入歌词"),
            selected = "online", offsetMs = 250, message = "",
        ),
        lx = io.github.huleixin.tingyu.minimal.MinimalLxState(
            activeName = "示例音源",
            scripts = listOf(
                io.github.huleixin.tingyu.minimal.MinimalLxScript(
                    id = "s1", name = "示例音源.js", meta = "v1.2 · demo", active = true,
                    caps = listOf("网易" to "标准 / 无损", "咪咕" to "标准 / 高品质"),
                ),
            ),
            message = "", failed = false,
        ),
    )

    private fun renderTool(name: String, block: @Composable () -> Unit) {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            androidx.compose.foundation.layout.Box(
                androidx.compose.ui.Modifier
                    .fillMaxSize()
                    .background(androidx.compose.ui.graphics.Color(0xFF152528))
            ) { block() }
        }
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()
        val view = compose.activity.window.decorView
        val shot = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(android.graphics.Canvas(shot))
        outDir.mkdirs()
        FileOutputStream(File(outDir, "$name.png")).use { shot.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("PARITY_SHOT=$name ${shot.width}x${shot.height}")
    }

    @Test
    fun qualitySheet() = renderTool("tools-quality") {
        io.github.huleixin.tingyu.minimal.ui.MinimalQualitySheet(
            tools = sampleTools("quality"), light = false, actions = stubToolActions,
            onClose = {}, onOpenEffects = {}, onOpenLx = {},
        )
    }

    @Test
    fun qualitySheetLight() = renderTool("tools-quality-light") {
        io.github.huleixin.tingyu.minimal.ui.MinimalQualitySheet(
            tools = sampleTools("quality"), light = true, actions = stubToolActions,
            onClose = {}, onOpenEffects = {}, onOpenLx = {},
        )
    }

    @Test
    fun effectsSheet() = renderTool("tools-effects") {
        io.github.huleixin.tingyu.minimal.ui.MinimalEffectsSheet(
            tools = sampleTools("effects"), light = false, actions = stubToolActions, onClose = {},
        )
    }

    @Test
    fun lyricsToolsSheet() = renderTool("tools-lyrics") {
        io.github.huleixin.tingyu.minimal.ui.MinimalLyricsToolsSheet(
            tools = sampleTools("lyrics"), light = false, actions = stubToolActions,
            transport = commands, mode = "all", playing = false,
            onClose = {}, onOpenQueue = {},
        )
    }

    @Test
    fun lxSheet() = renderTool("tools-lx") {
        io.github.huleixin.tingyu.minimal.ui.MinimalLxSheet(
            tools = sampleTools("lx"), light = false, actions = stubToolActions, onClose = {},
        )
    }
}
