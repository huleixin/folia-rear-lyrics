package io.github.huleixin.tingyu.minimal.ui

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.os.Looper
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.test.click
import io.github.huleixin.tingyu.minimal.MinimalArtwork
import io.github.huleixin.tingyu.minimal.MinimalClockSource
import io.github.huleixin.tingyu.minimal.MinimalControls
import io.github.huleixin.tingyu.minimal.MinimalLyrics
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerCommands
import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import io.github.huleixin.tingyu.minimal.MinimalTrack
import io.github.huleixin.tingyu.minimal.cover.CoverStackState
import io.github.huleixin.tingyu.minimal.cover.StackPhase
import io.github.huleixin.tingyu.minimal.coverColorsOf
import io.github.huleixin.tingyu.playback.NativePlaylist
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/ui/MinimalCoverStackTest.kt
//
// 封面堆叠的真机替身：Robolectric NATIVE 图形栈里画真正的组合，触摸用真实事件注入。
//
// 环境注意：Robolectric 的原生图形库是从 java.io.tmpdir 里加载 DLL 的，而本机默认的临时
// 目录路径含中文（C://Users//东北大妞//AppData//Local//Temp），加载会失败成
// UnsatisfiedLinkError，甚至把测试 JVM 直接打崩（hs_err 里是 RenderNodeNatives.nCreate）。
// 所以跑本类（以及仓库原有的 MinimalParityTest / MinimalScreenshotTest）必须带上：
//   JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=C:/tb/tmp ./gradlew :app:testDebugUnitTest
//
// 验的是三件最容易被"看起来对"骗过去的事：
//   1. 手指在封面上拖动时，封面位移**等于**手指位移，而且外层 pager 一步都不动；
//   2. 从封面以外开始的滑动仍然切页（不能为了封面把整个页面锁死）；
//   3. 一次切歌只发一条播放命令（按钮连点、手势与按钮混用都只算一次）。

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class MinimalCoverStackTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val artDir = File("build/cover-art").apply { mkdirs() }
    private val outDir = File("build/screenshots/cover-stack")

    private lateinit var holder: MutableState<MinimalPlayerState>
    private lateinit var artwork: MinimalArtwork
    private val stack = CoverStackState()
    private val calls = mutableListOf<String>()
    private var page = 0

    private val keys = listOf("tx:1", "tx:2", "tx:3", "tx:4", "tx:0")
    private val titles = listOf("潮汐线", "午夜电台", "山雾", "霓虹残像", "回声房间")

    private fun trackOf(index: Int): MinimalTrack {
        val i = ((index % keys.size) + keys.size) % keys.size
        return MinimalTrack(
            key = keys[i],
            title = titles[i],
            artist = "南屿",
            album = "潮汐线",
            artwork = "file://${File(artDir, "cover$i.png").absolutePath.replace('\\', '/')}",
            durationMs = 231_000,
        )
    }

    // ---- 演示素材：五张真封面，走的是本地曲库同一条 content:// / file:// 解码路径 ----

    private fun coverPng(index: Int): Bitmap {
        val size = 512
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = AndroidCanvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        // 纯色、彼此差异极大：一眼能看出哪一层在哪、有没有互相透出来
        val palettes = listOf(
            intArrayOf(0xFFE24B4B.toInt(), 0xFFE24B4B.toInt()), // 红
            intArrayOf(0xFF3D6B8F.toInt(), 0xFF3D6B8F.toInt()), // 蓝
            intArrayOf(0xFF4FA96A.toInt(), 0xFF4FA96A.toInt()), // 绿
            intArrayOf(0xFFC05B8C.toInt(), 0xFFC05B8C.toInt()), // 粉
            intArrayOf(0xFFE0C25A.toInt(), 0xFFE0C25A.toInt()), // 黄
        )
        val pair = palettes[index % palettes.size]
        paint.shader = LinearGradient(0f, 0f, 0f, size.toFloat(), pair[0], pair[1], Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, size.toFloat(), size.toFloat(), paint)
        paint.shader = null
        // 左侧一道深色书脊 + 正中一个白点：判断"这一层是谁、有没有被透出来"用
        paint.color = 0xFF111111.toInt()
        canvas.drawRect(0f, 0f, size * 0.06f, size.toFloat(), paint)
        paint.color = 0xFFFFFFFF.toInt()
        canvas.drawCircle(size * 0.5f, size * 0.5f, size * 0.06f, paint)
        val file = File(artDir, "cover$index.png")
        if (!file.exists()) {
            FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
        return bitmap
    }

    private fun stateOf(index: Int, playing: Boolean = true): MinimalPlayerState {
        val track = trackOf(index)
        return MinimalPlayerState(
            playback = MinimalPlayback(
                track = track,
                playing = playing,
                anchorPositionMs = 42_000,
                anchorElapsedMs = SystemClock.elapsedRealtime(),
                source = MinimalClockSource.ENGINE,
                epoch = "${track.key}#1",
            ),
            lyrics = MinimalLyrics(),
            controls = MinimalControls(
                canPrevious = true,
                canNext = true,
                mode = "all",
                bound = true,
                liked = false,
                likeDisabled = false,
            ),
        )
    }

    private fun artworkOf(index: Int): MinimalArtwork {
        val bitmap = coverPng(index)
        return MinimalArtwork(
            songKey = trackOf(index).key,
            url = trackOf(index).artwork,
            bitmap = bitmap,
            colors = coverColorsOf(bitmap),
            settled = true,
        )
    }

    /** 假播放器：真的按命令换歌，动画因此能被真实播放状态确认。 */
    private inner class FakeCommands : MinimalPlayerCommands {
        override val available: Boolean = true
        override fun toggle(): Boolean = true
        override fun play(): Boolean = true
        override fun pause(): Boolean = true
        override fun previous(): Boolean = step(-1)
        override fun next(): Boolean = step(1)
        private fun step(delta: Int): Boolean {
            calls += if (delta > 0) "next" else "previous"
            val currentIndex = keys.indexOf(holder.value.playback.track.key)
            val target = ((currentIndex + delta) % keys.size + keys.size) % keys.size
            holder.value = stateOf(target)
            // 与真实链路同构：JS 每次换歌都会重新同步逻辑歌单（当前曲 + 之后的顺序 + 上一首）
            syncPlaylist(target)
            return true
        }

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

    /** 与 `syncNativePlaylist` 同构：当前曲排第一，之后是播放顺序，上一首单独给。 */
    private fun syncPlaylist(currentIndex: Int) {
        val ordered = (0 until keys.size).map { offset -> trackOf(currentIndex + offset) }
        val tracks = ordered.map { track ->
            NativePlaylist.Track(
                track.key, "tx", "m", track.title, track.artist, track.album,
                track.durationMs, track.artwork, "",
            )
        }
        val previousTrack = trackOf(currentIndex - 1)
        NativePlaylist.get().replace(
            tracks,
            NativePlaylist.Mode.SEQUENCE,
            false,
            SystemClock.elapsedRealtime(),
            "test",
            NativePlaylist.Track(
                previousTrack.key, "tx", "m", previousTrack.title, previousTrack.artist,
                previousTrack.album, previousTrack.durationMs, previousTrack.artwork, "",
            ),
        )
    }

    @Before
    fun setUp() {
        NativePlaylist.resetForTest()
        // 五张封面先落盘：堆叠的邻居封面走的是 content:// / file:// 解码路径
        (0 until keys.size).forEach { coverPng(it) }
        syncPlaylist(0)
        holder = mutableStateOf(stateOf(0))
        artwork = artworkOf(0)
        calls.clear()
        page = 0
    }

    private fun start() {
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MinimalPlayerScreen(
                state = holder.value,
                artwork = artwork,
                commands = FakeCommands(),
                queue = io.github.huleixin.tingyu.minimal.MinimalQueue(),
                coverStack = stack,
                light = false,
                safeTop = 0f,
                safeBottom = 0f,
                detour = false,
                onCollapse = {},
                onOpenStage = {},
                onPageChanged = { page = it },
            )
        }
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()
        // 让后台的封面解码把结果 post 回主线程，并让"占位图 → 真封面"的交叉淡化跑完
        // （最多等 150 帧；通常前几帧图就到了，后面是把 220ms 的淡化走完）
        repeat(150) {
            shadowOf(Looper.getMainLooper()).idle()
            compose.mainClock.advanceTimeBy(16)
        }
    }

    private fun shoot(name: String) {
        val view = compose.activity.window.decorView
        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(AndroidCanvas(bitmap))
        outDir.mkdirs()
        FileOutputStream(File(outDir, "$name.png")).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        println("SHOT $name ${bitmap.width}x${bitmap.height}")
    }

    private fun cover() = compose.onNodeWithContentDescription("专辑封面")

    /** 封面区域以外的某个 y（封面正下方那一段文字区）：横向滑动应该由 pager 接手。 */
    private fun outsideCoverY(): Float {
        val bounds = cover().fetchSemanticsNode().boundsInRoot
        val root = compose.onRoot().fetchSemanticsNode().boundsInRoot
        return minOf(bounds.bottom + 36f, root.bottom - 260f)
    }

    // ---- 静止 ----

    @Test
    fun restShowsTheRealQueueNotAFakePreview() {
        start()
        assertEquals(listOf("tx:1", "tx:2", "tx:3"), stack.cards.map { it.songKey })
        assertEquals(StackPhase.IDLE, stack.phase)
        shoot("01-rest")
    }

    // ---- 跟手 ----

    @Test
    fun draggingTheCoverMovesItOneToOneAndLeavesThePagerAlone() {
        start()
        cover().performTouchInput {
            down(center)
            moveTo(center + Offset(-40f, 0f), delayMillis = 60)
        }
        compose.mainClock.advanceTimeByFrame()
        assertEquals("封面必须已经开始跟手", StackPhase.DRAG, stack.phase)
        assertEquals(-40f, stack.edgeX, 2f)
        assertEquals(0f, stack.edgeY, 1f)
        // 后两层开始补位，但没有抢跑到位
        assertTrue(stack.progress > 0f)
        assertTrue(stack.progress <= io.github.huleixin.tingyu.minimal.cover.CoverStackSpec.DRAG_PROGRESS_LIMIT + 0.001f)
        shoot("02-drag-40")

        cover().performTouchInput { moveTo(center + Offset(-120f, -30f), delayMillis = 120) }
        compose.mainClock.advanceTimeByFrame()
        assertEquals(-120f, stack.edgeX, 3f)
        assertEquals(-30f, stack.edgeY, 2f)
        shoot("03-drag-diagonal")

        // 松手：位移不够（-120px < 25% 宽度）→ 回弹，并且**没有**切歌
        cover().performTouchInput { up() }
        compose.mainClock.advanceTimeBy(800)
        assertEquals(emptyList<String>(), calls)
        assertEquals(0, page)
        assertEquals(StackPhase.IDLE, stack.phase)
        assertEquals(0f, stack.progress, 0.02f)
        assertEquals(listOf("tx:1", "tx:2", "tx:3"), stack.cards.map { it.songKey })
    }

    @Test
    fun aSlowDragStaysSharpAndAFastFlingGrowsTrail() {
        start()
        // 慢拖：每帧 3px ≈ 180px/s
        cover().performTouchInput { down(center) }
        repeat(10) { step ->
            cover().performTouchInput { moveTo(center + Offset(-3f * (step + 1), 0f)) }
            compose.mainClock.advanceTimeBy(16)
        }
        assertEquals(0f, stack.trailAlpha, 0.0001f)
        shoot("04-slow-drag-sharp")
        cover().performTouchInput { up() }
        compose.mainClock.advanceTimeBy(800)

        // 快甩：16ms 内 90px ≈ 5600px/s
        cover().performTouchInput {
            down(center)
            moveTo(center + Offset(-90f, -40f), delayMillis = 16)
            moveTo(center + Offset(-160f, -70f), delayMillis = 16)
        }
        compose.mainClock.advanceTimeByFrame()
        assertTrue("快速拖动应该出现轻微残影：" + stack.trailAlpha, stack.trailAlpha > 0f)
        assertTrue("残影不能糊成一片：" + stack.trailAlpha, stack.trailAlpha < 0.25f)
        shoot("05-fast-fling")
        cover().performTouchInput { up() }
        compose.mainClock.advanceTimeBy(900)
    }

    @Test
    fun verticalDragOnTheCoverLeavesTheGestureToThePage() {
        start()
        cover().performTouchInput {
            down(center)
            moveTo(center + Offset(-6f, -90f), delayMillis = 60)
        }
        compose.mainClock.advanceTimeByFrame()
        // 纵向为主：封面不接管，一层都不动
        assertNotEquals(StackPhase.DRAG, stack.phase)
        assertEquals(0f, stack.edgeX, 0.01f)
        cover().performTouchInput { up() }
        compose.mainClock.advanceTimeBy(300)
        assertEquals(0, page)
        assertEquals(emptyList<String>(), calls)
    }

    // ---- 切歌 ----

    @Test
    fun swipingLeftOnTheCoverSkipsOnceAndKeepsThePagerStill() {
        start()
        cover().performTouchInput { swipeLeft() }
        compose.mainClock.advanceTimeBy(1200)
        assertEquals(listOf("next"), calls)
        assertEquals("手势不能同时翻页", 0, page)
        assertEquals("tx:2", stack.cards[0].songKey)
        assertEquals("tx:3", stack.cards[1].songKey)
        assertEquals(StackPhase.IDLE, stack.phase)
        shoot("06-after-swipe")
    }

    @Test
    fun swipingRightOnTheCoverPutsThePreviousCoverOnTop() {
        start()
        cover().performTouchInput { swipeRight() }
        compose.mainClock.advanceTimeBy(1200)
        assertEquals(listOf("previous"), calls)
        assertEquals("右滑也不能翻页", 0, page)
        assertEquals("tx:0", stack.cards[0].songKey)
        assertEquals("tx:1", stack.cards[1].songKey)
        assertEquals(StackPhase.IDLE, stack.phase)
    }

    @Test
    fun nextButtonUsesTheSameControllerAndSendsOneCommand() {
        start()
        compose.onNodeWithContentDescription("下一首").performTouchInput { click() }
        compose.mainClock.advanceTimeBy(90)
        shoot("07-button-mid")
        compose.mainClock.advanceTimeBy(900)
        assertEquals(listOf("next"), calls)
        assertEquals("tx:2", stack.cards[0].songKey)
    }

    @Test
    fun doubleTappingNextOnlySkipsOneSong() {
        start()
        compose.onNodeWithContentDescription("下一首").performTouchInput { click() }
        compose.mainClock.advanceTimeBy(60)
        compose.onNodeWithContentDescription("下一首").performTouchInput { click() }
        compose.mainClock.advanceTimeBy(1400)
        assertEquals("提交期间不接受第二次切歌", listOf("next"), calls)
        assertEquals("tx:2", stack.cards[0].songKey)
    }

    @Test
    fun previousButtonPutsTheRealPreviousCoverOnTop() {
        start()
        compose.onNodeWithContentDescription("上一首").performTouchInput { click() }
        compose.mainClock.advanceTimeBy(90)
        shoot("08-previous-mid")
        compose.mainClock.advanceTimeBy(900)
        assertEquals(listOf("previous"), calls)
        assertEquals("tx:0", stack.cards[0].songKey)
        assertEquals("tx:1", stack.cards[1].songKey)
    }

    @Test
    fun autoAdvanceFromThePlayerStillAnimates() {
        start()
        // 播放器自己切到了下一首（自动续播 / 通知栏 / 队列点播）
        holder.value = stateOf(1)
        syncPlaylist(1)
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()
        assertEquals("自动切歌也要走同一套动画", StackPhase.COMMIT, stack.phase)
        assertTrue(stack.cards.first().moving)
        shoot("09-auto-advance-mid")
        compose.mainClock.advanceTimeBy(900)
        assertEquals("tx:2", stack.cards[0].songKey)
        assertEquals(emptyList<String>(), calls)
    }

    // ---- 页面手势隔离 ----

    @Test
    fun swipeOutsideTheCoverStillTurnsThePage() {
        start()
        val y = outsideCoverY()
        compose.onRoot().performTouchInput {
            down(Offset(right - 12f, y))
            moveTo(Offset(left + 12f, y), delayMillis = 60)
            up()
        }
        compose.mainClock.advanceTimeBy(900)
        assertEquals("封面外的左滑仍然切页", 1, page)
        assertEquals("切页不该切歌", emptyList<String>(), calls)
        shoot("10-lyrics-page")
    }

    @Test
    fun swipeOnTheLyricsPageGoesBackWithoutChangingSongs() {
        start()
        val y = outsideCoverY()
        compose.onRoot().performTouchInput {
            down(Offset(right - 12f, y))
            moveTo(Offset(left + 12f, y), delayMillis = 60)
            up()
        }
        compose.mainClock.advanceTimeBy(900)
        assertEquals(1, page)
        // 歌词页上向右滑：回到封面页，仍然不切歌
        compose.onRoot().performTouchInput {
            down(Offset(left + 12f, y))
            moveTo(Offset(right - 12f, y), delayMillis = 60)
            up()
        }
        compose.mainClock.advanceTimeBy(900)
        assertEquals(0, page)
        assertEquals(emptyList<String>(), calls)
    }

    @Test
    fun pointerCancelSpringsBackWithoutSkipping() {
        start()
        // 慢慢拖 60px：既不到 25% 宽度，速度也远低于 850px/s —— 松手只会回弹
        cover().performTouchInput {
            down(center)
            moveTo(center + Offset(-60f, 0f), delayMillis = 320)
        }
        compose.mainClock.advanceTimeByFrame()
        assertTrue("应该已经开始跟手：${stack.edgeX}", stack.edgeX < -50f)
        cover().performTouchInput { cancel() }
        compose.mainClock.advanceTimeBy(900)
        assertEquals(emptyList<String>(), calls)
        assertEquals(0f, stack.edgeX, 0.5f)
        assertEquals(0f, stack.progress, 0.02f)
    }
}
