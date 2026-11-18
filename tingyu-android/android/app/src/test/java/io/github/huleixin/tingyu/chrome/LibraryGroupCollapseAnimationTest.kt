package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class LibraryGroupCollapseAnimationTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun buildUnifiedLibraryPage(
        layout: String = "rows",
        resource: String = "playlists",
        qqCollapsed: Boolean = false,
        neteaseCollapsed: Boolean = false,
        qqCount: Int = 4,
        neteaseCount: Int = 66,
    ): NativePage {
        val sources = JSONArray()
            .put(JSONObject().put("id", "source:all").put("title", "综合").put("action", "source:all").put("selected", true))
            .put(JSONObject().put("id", "source:qq").put("title", "QQ音乐").put("action", "source:qq"))
            .put(JSONObject().put("id", "source:netease").put("title", "网易云").put("action", "source:netease"))
            .put(JSONObject().put("id", "source:qishui").put("title", "汽水").put("action", "source:qishui"))

        val categories = JSONArray()
            .put(JSONObject().put("id", "playlists").put("title", "歌单").put("action", "playlists").put("selected", resource == "playlists"))
            .put(JSONObject().put("id", "albums").put("title", "收藏专辑").put("action", "albums").put("selected", resource == "albums"))

        val shortcuts = JSONArray()
            .put(JSONObject().put("id", "likes").put("title", "我喜欢的音乐").put("subtitle", "114 首").put("image", "heart").put("action", "likes"))
            .put(JSONObject().put("id", "recent").put("title", "最近播放").put("subtitle", "50 首").put("image", "clock").put("action", "recent"))
            .put(JSONObject().put("id", "local").put("title", "本地音乐").put("subtitle", "14 首").put("image", "smartphone").put("action", "local"))

        val viewActions = JSONArray()
            .put(JSONObject().put("id", "layout").put("title", if (layout == "rows") "网格展示" else "列表展示").put("action", "layout"))
            .put(JSONObject().put("id", "refresh").put("title", "刷新").put("action", "refresh"))

        val unit = if (resource == "playlists") "个歌单" else "张专辑"

        fun buildGroupItems(prefix: String, label: String, count: Int): JSONArray {
            val arr = JSONArray()
            val sampleNames = listOf("我喜欢", "你是无意穿堂风 偏偏孤倨引山洪", "2026 年度常听精选", "周杰伦华语经典", "深夜自习轻音乐", "日系摇滚收藏")
            repeat(count) { idx ->
                val title = if (idx < sampleNames.size) "$prefix · ${sampleNames[idx]}" else "$prefix 歌单 #${idx + 1}"
                arr.put(
                    JSONObject()
                        .put("id", "$prefix-item-$idx")
                        .put("title", title)
                        .put("subtitle", "$label · ${(idx + 1) * 12} 首")
                        .put("action", "open:$prefix:$idx")
                        .put("secondary", "menu:$prefix:$idx")
                        .put("secondaryLabel", "更多"),
                )
            }
            return arr
        }

        val sections = JSONArray()
            .put(JSONObject().put("id", "library-sources").put("layout", "chips").put("items", sources))
            .put(JSONObject().put("id", "library-categories").put("layout", "chips").put("items", categories))
            .put(JSONObject().put("id", "personal-shortcuts").put("layout", "quickLinks").put("items", shortcuts))
            .put(JSONObject().put("id", "library-view").put("layout", "textActions").put("items", viewActions))
            .put(
                JSONObject()
                    .put("id", "directory-group:qq")
                    .put("title", "QQ 音乐")
                    .put("layout", layout)
                    .put("more", "toggle-group:qq")
                    .put("moreLabel", "$qqCount$unit")
                    .put("text", if (qqCollapsed) "collapsed" else "")
                    .put("key", "u:qq:$layout:$resource")
                    .put("items", buildGroupItems("QQ", "QQ音乐", qqCount)),
            )
            .put(
                JSONObject()
                    .put("id", "directory-group:netease")
                    .put("title", "网易云音乐")
                    .put("layout", layout)
                    .put("more", "toggle-group:netease")
                    .put("moreLabel", "$neteaseCount$unit")
                    .put("text", if (neteaseCollapsed) "collapsed" else "")
                    .put("key", "u:netease:$layout:$resource")
                    .put("items", buildGroupItems("云村", "网易云", neteaseCount)),
            )

        return NativePage.parse(
            JSONObject()
                .put("id", "home")
                .put("session", "lib-anim-test")
                .put("viewportWidth", 393)
                .put("width", 393)
                .put("height", 852)
                .put("safeTop", 24)
                .put("safeBottom", 16)
                .put(
                    "model",
                    JSONObject()
                        .put("key", "library:unified:all:$resource")
                        .put("title", "资料库")
                        .put("trailing", "manage")
                        .put("trailingLabel", "资料库管理")
                        .put("trailingIcon", "folder-cog")
                        .put("bottomClearance", 110)
                        .put("sections", sections),
                ),
        )
    }

    private fun saveDecorFrame(outDir: File, frameIndex: Int) {
        compose.runOnIdle {
            val view = compose.activity.window.decorView
            if (view.width > 0 && view.height > 0) {
                val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bmp)
                view.draw(canvas)
                val file = File(outDir, String.format("frame_%04d.png", frameIndex))
                FileOutputStream(file).use { out ->
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
                }
                bmp.recycle()
            }
        }
    }

    @Test
    fun `smooth 300ms collapse, expand, and rapid mid-flight reversal keep adjacent group displacement monotonic and continuous`() {
        val frameDirProp = System.getProperty("tingyu.animFrameDir") ?: System.getenv("TINGYU_ANIM_FRAME_DIR")
        val frameDir = if (!frameDirProp.isNullOrBlank()) File(frameDirProp).apply { mkdirs() } else null
        var frameSeq = 0

        var qqCollapsed by mutableStateOf(false)
        var neteaseCollapsed by mutableStateOf(false)

        compose.mainClock.autoAdvance = false
        compose.setContent {
            CompositionLocalProvider(
                LocalInterfacePalette provides InterfacePalette(light = true),
                LocalLiquidReduced provides false,
            ) {
                Box(Modifier.width(393.dp).height(852.dp).background(Color(0xFFEEF4F8))) {
                    NativePageView(
                        page = buildUnifiedLibraryPage(
                            layout = "rows",
                            qqCollapsed = qqCollapsed,
                            neteaseCollapsed = neteaseCollapsed,
                            qqCount = 4,
                            neteaseCount = 30,
                        ),
                        modifier = Modifier.fillMaxSize(),
                    ) { id, _, _ ->
                        when (id) {
                            "toggle-group:qq" -> qqCollapsed = !qqCollapsed
                            "toggle-group:netease" -> neteaseCollapsed = !neteaseCollapsed
                        }
                    }
                }
            }
        }
        compose.mainClock.advanceTimeBy(64L)

        fun neteaseTop(): Float = compose.onNodeWithText("网易云音乐").fetchSemanticsNode().boundsInRoot.top
        fun qqTop(): Float = compose.onNodeWithText("QQ 音乐").fetchSemanticsNode().boundsInRoot.top

        val expandedNeteaseTop = neteaseTop()
        val initialQqTop = qqTop()
        assertTrue("Expanded QQ group should place NetEase well below QQ header", expandedNeteaseTop > initialQqTop + 200f)

        // 录制初始静止帧 (12 帧 ~200ms)
        if (frameDir != null) {
            repeat(12) { saveDecorFrame(frameDir, frameSeq++) }
        }

        // 1. 点击「QQ 音乐」收缩：逐帧采样 0..336ms，验证下方「网易云音乐」平滑单调上移，绝不在第 1 帧瞬间跳变到底！
        compose.onNodeWithText("QQ 音乐").performClick()
        val collapseTrajectory = mutableListOf<Float>()
        collapseTrajectory.add(expandedNeteaseTop)

        repeat(22) {
            compose.mainClock.advanceTimeBy(16L)
            val y = neteaseTop()
            collapseTrajectory.add(y)
            if (frameDir != null) saveDecorFrame(frameDir, frameSeq++)
        }

        val collapsedNeteaseTop = collapseTrajectory.last()
        val totalTravel = expandedNeteaseTop - collapsedNeteaseTop
        assertTrue("Collapsed NetEase header must move upward significantly ($totalTravel px)", totalTravel > 200f)

        // 关键断言 1：第 1~3 帧不允许瞬间跳到底（旧版 bug 是第 1 帧直接消失全部歌单）
        val firstStepDelta = collapseTrajectory[0] - collapseTrajectory[1]
        assertTrue(
            "First frame must NOT jump the entire distance at once: step=$firstStepDelta total=$totalTravel",
            firstStepDelta < totalTravel * 0.45f,
        )
        // 关键断言 2：中段 128ms 处必须处于平滑过渡中间位置
        val midCollapseY = collapseTrajectory[8]
        assertTrue(
            "Mid-collapse (128ms) must be smoothly between start and end: mid=$midCollapseY start=$expandedNeteaseTop end=$collapsedNeteaseTop",
            midCollapseY < expandedNeteaseTop - totalTravel * 0.25f && midCollapseY > collapsedNeteaseTop + totalTravel * 0.05f,
        )
        // 关键断言 3：全程单调不回弹（无异常跳回）
        for (i in 1 until collapseTrajectory.size) {
            assertTrue(
                "Collapse trajectory must be monotonic without bounce at step $i: prev=${collapseTrajectory[i - 1]} cur=${collapseTrajectory[i]}",
                collapseTrajectory[i] <= collapseTrajectory[i - 1] + 0.5f,
            )
        }
        // 关键断言 4：收缩完成后无重复胶囊标签（右侧仅 1 处 "4个歌单"）
        assertEquals(1, compose.onAllNodesWithText("4个歌单").fetchSemanticsNodes().size)

        if (frameDir != null) {
            repeat(14) { saveDecorFrame(frameDir, frameSeq++) }
        }

        // 2. 点击「QQ 音乐」展开：逐帧采样，验证内容与下方分组同步平滑下移让位，无空白跳变
        compose.onNodeWithText("QQ 音乐").performClick()
        val expandTrajectory = mutableListOf<Float>()
        expandTrajectory.add(collapsedNeteaseTop)

        repeat(22) {
            compose.mainClock.advanceTimeBy(16L)
            val y = neteaseTop()
            expandTrajectory.add(y)
            if (frameDir != null) saveDecorFrame(frameDir, frameSeq++)
        }

        val reExpandedTop = expandTrajectory.last()
        assertTrue("Re-expanded NetEase header must return to exact initial Y", abs(reExpandedTop - expandedNeteaseTop) < 2f)
        assertTrue(
            "First expand frame must NOT dump full height instantly",
            expandTrajectory[1] - expandTrajectory[0] < totalTravel * 0.45f,
        )
        for (i in 1 until expandTrajectory.size) {
            assertTrue(
                "Expand trajectory must be monotonic without bounce at step $i: prev=${expandTrajectory[i - 1]} cur=${expandTrajectory[i]}",
                expandTrajectory[i] >= expandTrajectory[i - 1] - 0.5f,
            )
        }

        if (frameDir != null) {
            repeat(12) { saveDecorFrame(frameDir, frameSeq++) }
        }

        // 3. 快速连续点击中途反转测试（收缩进行到 112ms 半途再次点击立即顺滑反向展开，无位置跳变）
        compose.onNodeWithText("QQ 音乐").performClick()
        repeat(7) {
            compose.mainClock.advanceTimeBy(16L)
            if (frameDir != null) saveDecorFrame(frameDir, frameSeq++)
        }
        val midFlightYBeforeReverse = neteaseTop()
        assertTrue(
            "At 112ms into collapse, group must be mid-flight: y=$midFlightYBeforeReverse",
            midFlightYBeforeReverse < expandedNeteaseTop - totalTravel * 0.2f && midFlightYBeforeReverse > collapsedNeteaseTop + totalTravel * 0.1f,
        )

        // 半途再次点击反转！
        compose.onNodeWithText("QQ 音乐").performClick()
        compose.mainClock.advanceTimeBy(16L)
        val firstFrameAfterReverse = neteaseTop()
        if (frameDir != null) saveDecorFrame(frameDir, frameSeq++)
        assertTrue(
            "Mid-flight reversal must smoothly continue from current Y without discontinuity: before=$midFlightYBeforeReverse after=$firstFrameAfterReverse",
            abs(firstFrameAfterReverse - midFlightYBeforeReverse) < totalTravel * 0.35f,
        )

        repeat(18) {
            compose.mainClock.advanceTimeBy(16L)
            if (frameDir != null) saveDecorFrame(frameDir, frameSeq++)
        }
        assertTrue("After mid-flight reversal settles, group returns to full expanded height", abs(neteaseTop() - expandedNeteaseTop) < 2f)
        if (frameDir != null) {
            repeat(10) { saveDecorFrame(frameDir, frameSeq++) }
        }
    }

    @Test
    fun `preserves LazyColumn virtualization for 180 playlists and supports grid mode and favorite albums`() {
        var qqCollapsed by mutableStateOf(false)
        var layoutMode by mutableStateOf("rows")
        var resourceMode by mutableStateOf("playlists")

        compose.mainClock.autoAdvance = false
        compose.setContent {
            CompositionLocalProvider(
                LocalInterfacePalette provides InterfacePalette(light = true),
                LocalLiquidReduced provides false,
            ) {
                Box(Modifier.width(393.dp).height(852.dp)) {
                    NativePageView(
                        page = buildUnifiedLibraryPage(
                            layout = layoutMode,
                            resource = resourceMode,
                            qqCollapsed = qqCollapsed,
                            qqCount = 180,
                            neteaseCount = 80,
                        ),
                        modifier = Modifier.fillMaxSize(),
                    ) { id, _, _ ->
                        if (id == "toggle-group:qq") qqCollapsed = !qqCollapsed
                    }
                }
            }
        }
        compose.mainClock.advanceTimeBy(64L)

        // 校验虚拟化：即使 QQ 音乐有 180 个歌单，第 150 个屏幕外歌单绝不会被一次性渲染！
        assertEquals(0, compose.onAllNodesWithText("QQ 歌单 #150").fetchSemanticsNodes().size)
        compose.onNodeWithText("QQ · 我喜欢").assertExists()

        // 在 180 个歌单下执行收缩与展开动画，依然不触发第 150 个歌单渲染
        compose.onNodeWithText("QQ 音乐").performClick()
        repeat(20) {
            compose.mainClock.advanceTimeBy(16L)
            assertEquals(0, compose.onAllNodesWithText("QQ 歌单 #150").fetchSemanticsNodes().size)
        }
        // 180 个歌单折叠后，原本远在屏幕外的「网易云音乐」平滑上移进入当前可视区域！
        compose.onNodeWithText("网易云音乐").assertExists()

        // 切换至「收藏专辑 + 网格展示 (cards)」模式验证展开/折叠同样平滑生效
        layoutMode = "cards"
        resourceMode = "albums"
        compose.mainClock.advanceTimeBy(64L)
        compose.onNodeWithText("180张专辑").assertExists()

        compose.onNodeWithText("QQ 音乐").performClick()
        repeat(22) { compose.mainClock.advanceTimeBy(16L) }
        compose.onNodeWithText("QQ · 我喜欢").assertExists()
    }
}
