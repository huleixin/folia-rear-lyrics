package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.MinimalClockSource
import io.github.huleixin.tingyu.minimal.MinimalControls
import io.github.huleixin.tingyu.minimal.MinimalLyrics
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
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

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/MinimalScreenshotTest.kt
//
// 极简播放页的真实渲染：Robolectric 的 NATIVE 图形栈把真正的 Compose 组合画成位图。
//
// 这里没有 mock 视图、没有手绘贴图：`MinimalPlayerScreen` 用的就是 App 里同一个组合、
// 同一套取色、同一套歌词时间轴。差别只在没有 AudioTrack —— 播放状态由测试给定，
// 而这一页的所有事实本来就来自 `MinimalPlayerState`（第一阶段定下的接口）。

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class MinimalScreenshotTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val outDir = File("build/screenshots/minimal")

    /** 一张"夕阳感"的封面：暖色渐变 + 一轮低日 + 冷色水面，给取色算法一点真实的东西可咬。 */
    private fun artworkBitmap(seed: Int): Bitmap {
        val size = 512
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = AndroidCanvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val pair = if (seed == 0) intArrayOf(0xFFF2A65A.toInt(), 0xFF6E2F45.toInt())
        else intArrayOf(0xFF3D6B8F.toInt(), 0xFF10202F.toInt())
        paint.shader = LinearGradient(0f, 0f, 0f, size.toFloat(), pair[0], pair[1], Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, size.toFloat(), size.toFloat(), paint)
        paint.shader = RadialGradient(
            size * 0.40f, size * 0.58f, size * 0.40f,
            intArrayOf(0xFFFFE6B8.toInt(), 0x00FFE6B8),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawCircle(size * 0.40f, size * 0.58f, size * 0.40f, paint)
        paint.shader = null
        paint.color = 0xFF17262E.toInt()
        canvas.drawRect(0f, size * 0.74f, size.toFloat(), size.toFloat(), paint)
        return bitmap
    }

    private fun artworkOf(seed: Int): MinimalArtwork {
        val bitmap = artworkBitmap(seed)
        return MinimalArtwork(
            songKey = if (seed == 0) "tx:1001" else "tx:1002",
            url = if (seed == 0) "art://sunset" else "art://night",
            bitmap = bitmap,
            colors = coverColorsOf(bitmap),
            settled = true,
        )
    }

    private fun lyricsOf(seed: Int): MinimalLyrics {
        val json = if (seed == 0) {
            """
            {"songKey":"tx:1001","state":"ready","isWordByWord":true,"lines":[
              {"startTime":0.0,"endTime":5.0,"fullText":"作词：陈婧霏","words":[]},
              {"startTime":8.0,"endTime":12.0,"fullText":"我听见海浪在说话","translation":"I hear the waves talking","words":[
                {"text":"我听见","startTime":8.0,"endTime":9.6},
                {"text":"海浪","startTime":9.6,"endTime":10.9},
                {"text":"在说话","startTime":10.9,"endTime":12.0}]},
              {"startTime":12.0,"endTime":15.5,"fullText":"它说夏天还没有走远","translation":"It says summer hasn't gone far","words":[
                {"text":"它说","startTime":12.0,"endTime":13.0},
                {"text":"夏天","startTime":13.0,"endTime":14.0},
                {"text":"还没有走远","startTime":14.0,"endTime":15.5}]},
              {"startTime":15.5,"endTime":19.0,"fullText":"橘子味的晚风","words":[
                {"text":"橘子味的","startTime":15.5,"endTime":17.2},
                {"text":"晚风","startTime":17.2,"endTime":19.0}]},
              {"startTime":19.0,"endTime":23.0,"fullText":"把你吹进我的耳机里","words":[
                {"text":"把你吹进","startTime":19.0,"endTime":21.0},
                {"text":"我的耳机里","startTime":21.0,"endTime":23.0}]},
              {"startTime":23.0,"endTime":27.0,"fullText":"于是整个下午都在循环","words":[]},
              {"startTime":27.0,"endTime":31.0,"fullText":"直到海把天色调暗","words":[]}
            ]}
            """.trimIndent()
        } else {
            """
            {"songKey":"tx:1002","state":"ready","isWordByWord":true,"lines":[
              {"startTime":0.0,"endTime":6.0,"fullText":"夜航西飞","words":[]},
              {"startTime":6.0,"endTime":11.0,"fullText":"灯塔把海面缝成一条线","translation":"The lighthouse stitches the sea into a line","words":[
                {"text":"灯塔","startTime":6.0,"endTime":7.2},
                {"text":"把海面","startTime":7.2,"endTime":8.8},
                {"text":"缝成一条线","startTime":8.8,"endTime":11.0}]},
              {"startTime":11.0,"endTime":16.0,"fullText":"我在雾里数着秒针","words":[]},
              {"startTime":16.0,"endTime":21.0,"fullText":"等一场不会来的风","words":[]}
            ]}
            """.trimIndent()
        }
        val key = if (seed == 0) "tx:1001" else "tx:1002"
        return MinimalLyrics.fromRows(json, key, "$key#1", "v-$seed")
    }

    private fun stateOf(seed: Int, positionSec: Double): MinimalPlayerState {
        val track = if (seed == 0) {
            MinimalTrack(
                key = "tx:1001",
                title = "夏日漱石",
                artist = "橘子海",
                album = "春潮",
                artwork = "art://sunset",
                durationMs = 214_000,
            )
        } else {
            MinimalTrack(
                key = "tx:1002",
                title = "夜航西飞",
                artist = "龚子婕",
                album = "夜航",
                artwork = "art://night",
                durationMs = 197_000,
            )
        }
        return MinimalPlayerState(
            playback = MinimalPlayback(
                track = track,
                playing = true,
                anchorPositionMs = (positionSec * 1000).toLong(),
                anchorElapsedMs = SystemClock.elapsedRealtime(),
                source = MinimalClockSource.ENGINE,
                epoch = "${track.key}#1",
            ),
            lyrics = lyricsOf(seed),
            controls = MinimalControls(
                canPrevious = true,
                canNext = true,
                mode = "all",
                bound = true,
                quality = "FLAC · 无损",
                qualityGold = true,
                liked = seed == 0,
                likeDisabled = false,
            ),
        )
    }

    private val commands = object : MinimalPlayerCommands {
        override val available: Boolean = true
        override fun toggle(): Boolean = true
        override fun play(): Boolean = true
        override fun pause(): Boolean = true
        override fun previous(): Boolean = true
        override fun next(): Boolean = true
        override fun seekTo(seconds: Double): Boolean = true
        override fun cycleMode(): Boolean = true
        override fun openQueue(): Boolean = true
        override fun collapse(): Boolean = true
        override fun like(): Boolean = true
        override fun openStage(): Boolean = true
    }

    private data class Shot(val state: MinimalPlayerState, val artwork: MinimalArtwork)

    /**
     * 同一首歌只能给同一个 artwork 对象：Crossfade 比的是对象等价，
     * 每帧新建一张位图会让它以为换了封面，于是永远在淡化（第一版 GIF 里那段"变暗"就是这么来的）。
     */
    private val artworkCache = HashMap<Int, MinimalArtwork>()
    private fun artworkOnce(seed: Int): MinimalArtwork = artworkCache.getOrPut(seed) { artworkOf(seed) }

    private var holder = mutableStateOf(Shot(stateOf(0, 10.4), artworkOnce(0)))

    /** 只 setContent 一次：Compose 规则不允许重置组合。 */
    private fun start(seed: Int, light: Boolean, position: Double = 10.4) {
        holder = mutableStateOf(Shot(stateOf(seed, position), artworkOnce(seed)))
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MinimalPlayerScreen(
                state = holder.value.state,
                artwork = holder.value.artwork,
                commands = commands,
                light = light,
                safeTop = 0f,
                safeBottom = 0f,
                detour = false,
                onCollapse = {},
                onOpenStage = {},
            )
        }
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()
    }

    private fun shoot(name: String) {
        val view = compose.activity.window.decorView
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(AndroidCanvas(bitmap))
        outDir.mkdirs()
        FileOutputStream(File(outDir, "$name.png")).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("SHOT $name ${bitmap.width}x${bitmap.height}")
    }

    private fun shootFrame(folder: String, index: Int) {
        val view = compose.activity.window.decorView
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(AndroidCanvas(bitmap))
        val dir = outDir.resolve(folder).apply { mkdirs() }
        FileOutputStream(File(dir, "f%02d.png".format(index))).use {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
    }

    private fun swipeToLyrics() {
        compose.mainClock.advanceTimeByFrame()
        compose.onRoot().performTouchInput { swipeLeft() }
        compose.mainClock.advanceTimeBy(900)
        compose.mainClock.advanceTimeByFrame()
    }

    @Test
    fun coverDark() {
        start(0, light = false)
        shoot("01-cover-dark")
    }

    @Test
    fun coverLight() {
        start(0, light = true)
        shoot("02-cover-light")
    }

    @Test
    fun lyricsDark() {
        start(0, light = false)
        swipeToLyrics()
        shoot("03-lyrics-dark")
    }

    @Test
    fun lyricsLight() {
        start(0, light = true)
        swipeToLyrics()
        shoot("04-lyrics-light")
    }

    /** 逐字高亮 + 进度推进：12 帧，每帧 0.12 秒（GIF 由脚本合成）。 */
    @Test
    fun wordByWordFrames() {
        start(0, light = false, position = 9.4)
        swipeToLyrics()
        for (index in 0 until 12) {
            holder.value = holder.value.copy(state = stateOf(0, 9.4 + index * 0.12))
            compose.mainClock.advanceTimeBy(120)
            compose.mainClock.advanceTimeByFrame()
            shootFrame("frames-highlight", index)
        }
        println("FRAMES " + outDir.resolve("frames-highlight").absolutePath)
    }

    /** 切歌：封面交叉淡化 + 背景配色过渡 + 文字切换，8 帧覆盖 480ms。 */
    @Test
    fun trackChangeFrames() {
        start(0, light = false)
        for (index in 0 until 8) {
            // 第 4 帧换歌：此后 Crossfade(420ms) 与背景 760ms 过渡在真实页面里逐帧推进。
            val next = if (index < 4) 0 else 1
            holder.value = Shot(stateOf(next, 10.4), artworkOnce(next))
            compose.mainClock.advanceTimeBy(60)
            compose.mainClock.advanceTimeByFrame()
            shootFrame("frames-track", index)
        }
        println("FRAMES " + outDir.resolve("frames-track").absolutePath)
    }
}
