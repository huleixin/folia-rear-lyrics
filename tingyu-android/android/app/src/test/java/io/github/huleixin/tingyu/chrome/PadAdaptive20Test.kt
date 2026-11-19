package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "zh-rCN-w1280dp-h800dp-mdpi")
class PadAdaptive20Test {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val events = mutableListOf<String>()

    private fun item(id: String, title: String, subtitle: String = "副标题") =
        JSONObject().put("id", id).put("title", title).put("subtitle", subtitle).put("action", "open:$id")

    private fun section(id: String, layout: String, title: String, items: List<JSONObject>, text: String = "") =
        JSONObject().put("id", id).put("layout", layout).put("title", title).put("items", JSONArray(items)).put("text", text)

    private fun settingsPage(width: Int = 1280, height: Int = 800) = NativePage.parse(
        JSONObject()
            .put("id", "settings")
            .put("session", "pad20-settings")
            .put("enabled", true)
            .put("width", width)
            .put("height", height)
            .put("viewportWidth", width)
            .put(
                "model",
                JSONObject()
                    .put("key", "settings:index")
                    .put("title", "设置")
                    .put(
                        "sections",
                        JSONArray(
                            listOf(
                                section("rear", "rows", "背屏", listOf(item("rear-entry", "背屏歌词"))),
                                section("accounts-service", "rows", "账号与服务", listOf(item("platform-accounts", "音乐平台账号"))),
                                section("appearance", "rows", "外观与语言", listOf(item("appearance", "外观设置"), item("general", "通用与语言"))),
                                section("controls", "rows", "播放与交互", listOf(item("playback", "播放设置"), item("interaction", "交互设置"))),
                                section("system", "rows", "系统与关于", listOf(item("about", "关于与使用说明"))),
                            )
                        )
                    )
            )
    )

    private fun homePage(width: Int = 1280, height: Int = 800) = NativePage.parse(
        JSONObject()
            .put("id", "home")
            .put("session", "pad20-home")
            .put("enabled", true)
            .put("width", width)
            .put("height", height)
            .put("viewportWidth", width)
            .put(
                "model",
                JSONObject()
                    .put("key", "home:discovery:qq")
                    .put("title", "发现")
                    .put(
                        "sections",
                        JSONArray(
                            listOf(
                                section("discoveryHero", "discoveryHero", "", listOf(item("hero0", "听屿漫游", "继续你的私人电台"))),
                                section("recent", "cards", "最近播放", (0..5).map { item("recent$it", "最近歌曲$it", "歌手$it") }),
                                section("quickLinks", "quickLinks", "快捷入口", listOf(item("q1", "每日推荐"), item("q2", "排行榜"), item("q3", "私人雷达"), item("q4", "歌单广场"))),
                                section("rows", "rows", "相似歌曲", (0..5).map { item("song$it", "推荐曲目$it", "艺人$it") }),
                                section("emptyNote", "message", "提示", emptyList(), text = "暂无更多推荐内容"),
                            )
                        )
                    )
            )
    )

    private fun shot(name: String) {
        compose.waitForIdle()
        compose.runOnIdle {
            val view = compose.activity.window.decorView
            val b = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(b))
            val f = File("build/reports/pad-v2/$name.png")
            f.parentFile!!.mkdirs()
            f.outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }
            b.recycle()
        }
    }

    @Test
    fun settingsMasterDetailSwitchesCategoriesAndRespectsSizeClasses() {
        val page = settingsPage()
        var window by mutableStateOf(PadWindow(1280f, 800f))
        var palette by mutableStateOf(InterfacePalette(true, "glacier"))
        compose.setContent {
            CompositionLocalProvider(
                LocalPadWindow provides window,
                LocalInterfacePalette provides palette,
                LocalChromeRendering provides false,
            ) {
                Box(Modifier.fillMaxSize()) {
                    NativePageView(page, Modifier.size(window.width.dp, window.height.dp)) { action, _, _ ->
                        events += action
                    }
                }
            }
        }

        // Expanded / Large uses full settings directory + live detail pane
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithTag("pad-settings-detail").assertIsDisplayed()
        compose.onNodeWithText("音乐平台账号").assertIsDisplayed()
        compose.onNodeWithText("播放设置").assertIsDisplayed()
        compose.onNodeWithText("背屏歌词").assertDoesNotExist()
        shot("settings-master-detail-1280x800-glacier-light")

        // Clicking an item in middle directory directly triggers its subpage action
        compose.onNodeWithText("播放设置").performClick()
        assertEquals("open:playback", events.last())

        // Switch to classic dark on 1920x1080
        compose.runOnIdle {
            palette = InterfacePalette(false, "classic")
            window = PadWindow(1920f, 1080f)
        }
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithText("关于与使用说明").assertIsDisplayed()
        shot("settings-master-detail-1920x1080-classic-dark")

        // Medium portrait 800x1280 also uses master-detail
        compose.runOnIdle { window = PadWindow(800f, 1280f) }
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        shot("settings-master-detail-800x1280")

        // Narrow 600x960 collapses cleanly to single-column without dual-pane cramping
        compose.runOnIdle { window = PadWindow(600f, 960f) }
        compose.onNodeWithTag("pad-settings-directory").assertDoesNotExist()
    }

    @Test
    fun homeDiscoveryRendersAcrossPortraitShortAndUltraWide() {
        val page = homePage()
        var window by mutableStateOf(PadWindow(1280f, 800f))
        compose.setContent {
            CompositionLocalProvider(
                LocalPadWindow provides window,
                LocalInterfacePalette provides InterfacePalette(true, "glacier"),
                LocalChromeRendering provides false,
            ) {
                Box(Modifier.fillMaxSize()) {
                    NativePageView(page, Modifier.size(window.width.dp, window.height.dp)) { action, _, _ ->
                        events += action
                    }
                }
            }
        }

        compose.onNodeWithTag("pad-home-list").assertIsDisplayed()
        compose.onNodeWithText("听屿漫游").assertIsDisplayed()
        compose.onNodeWithText("每日推荐").assertIsDisplayed()
        shot("home-discovery-1280x800")

        // Large portrait 1200x1600
        compose.runOnIdle { window = PadWindow(1200f, 1600f) }
        compose.onNodeWithTag("pad-home-list").assertIsDisplayed()
        shot("home-discovery-1200x1600")

        // Short landscape window 960x480
        compose.runOnIdle { window = PadWindow(960f, 480f) }
        compose.onNodeWithTag("pad-home-list").assertIsDisplayed()
        shot("home-discovery-960x480")
    }

    @Test
    fun mobilePlaylistsAndPullToRefreshWorkAcrossThemes() {
        val basePage = NativePage.parse(
            JSONObject()
                .put("id", "home")
                .put("session", "mobile-playlists")
                .put("enabled", true)
                .put("width", 393)
                .put("height", 852)
                .put("viewportWidth", 393)
                .put("bottomClearance", 152)
                .put(
                    "model",
                    JSONObject()
                        .put("key", "home:discovery:all")
                        .put("title", "推荐")
                        .put("refreshAction", "refresh")
                        .put("refreshing", false)
                        .put(
                            "sections",
                            JSONArray(
                                listOf(
                                    section(
                                        "discovery-radars",
                                        "radarCards",
                                        "你的专属雷达",
                                        listOf(item("style", "风格雷达", "歌手与音乐的关联"))
                                    ).put("more", "allRadar").put("moreLabel", "全部"),
                                    section(
                                        "discovery-songs",
                                        "rows",
                                        "猜你想听",
                                        listOf(item("song0", "推荐曲目", "歌手 · QQ音乐"))
                                    ).put("more", "next").put("moreLabel", "换一批").put("footerAction", "allSongs").put("footerLabel", "全部推荐歌曲"),
                                    section(
                                        "playlists",
                                        "cards",
                                        "我的歌单",
                                        listOf(
                                            item("mine:fav", "我喜欢", "QQ音乐 · 128首"),
                                            item("mine:long", "你是无意穿堂风偏偏孤倨引山洪的歌单标题", "网易云音乐 · 64首"),
                                            item("mine:plain", "纯歌单名", ""),
                                            item("mine:jay", "周杰伦", "QQ音乐 · 42首"),
                                        )
                                    ).put("more", "library").put("moreLabel", "全部"),
                                )
                            )
                        )
                )
        )
        var palette by mutableStateOf(InterfacePalette(true, "glacier"))
        var refreshing by mutableStateOf(false)
        compose.setContent {
            CompositionLocalProvider(
                LocalPadWindow provides PadWindow(393f, 852f),
                LocalInterfacePalette provides palette,
                LocalChromeRendering provides false,
            ) {
                Box(Modifier.fillMaxSize()) {
                    NativePageView(basePage.copy(refreshing = refreshing), Modifier.size(393.dp, 852.dp)) { action, _, _ ->
                        events += action
                        if (action == "refresh") refreshing = true
                    }
                }
            }
        }
        compose.onNodeWithTag("native-home-list").performScrollToNode(hasText("我喜欢"))
        compose.onNodeWithText("我喜欢").assertIsDisplayed()
        compose.onNodeWithText("QQ音乐 · 128首").assertIsDisplayed()
        compose.onNodeWithText("刷新推荐").assertDoesNotExist()
        compose.onNodeWithText("查看更多").assertDoesNotExist()
        compose.onNodeWithText("换一批").assertIsDisplayed().performClick()
        assertEquals("next", events.last())
        compose.onNodeWithText("全部推荐歌曲").assertIsDisplayed().performClick()
        assertEquals("allSongs", events.last())
        compose.onAllNodesWithText("全部").assertCountEquals(2)

        // Short pull below threshold should not trigger refresh
        compose.onNodeWithTag("native-home-list").performTouchInput {
            swipeDown(startY = 200f, endY = 240f)
        }
        assertFalse(events.contains("refresh"))

        // Full pull down triggers refresh once
        compose.onNodeWithTag("native-home-list").performTouchInput {
            swipeDown(startY = 200f, endY = 650f)
        }
        assertEquals(1, events.count { it == "refresh" })
        shot("mobile-playlists-glacier-light")

        // Rapid second pull while already refreshing is deduplicated
        compose.onNodeWithTag("native-home-list").performTouchInput {
            swipeDown(startY = 200f, endY = 650f)
        }
        assertEquals(1, events.count { it == "refresh" })

        compose.runOnIdle {
            refreshing = false
            palette = InterfacePalette(false, "classic")
        }
        compose.onNodeWithTag("native-home-list").performScrollToNode(hasText("我喜欢"))
        compose.onNodeWithText("我喜欢").assertIsDisplayed()
        shot("mobile-playlists-classic-dark")
    }

    private fun semanticFlowPage(key: String, title: String, nodes: List<JSONObject>, width: Int = 1280, height: Int = 800): NativePage {
        val flow = JSONObject()
            .put("key", key)
            .put("title", title)
            .put("nodes", JSONArray(nodes))
        return NativePage.parse(
            JSONObject()
                .put("id", "settings")
                .put("session", "pad20-$key")
                .put("enabled", true)
                .put("width", width)
                .put("height", height)
                .put("viewportWidth", width)
                .put(
                    "model",
                    JSONObject()
                        .put("key", "settings:document:$key")
                        .put("title", title)
                        .put("sections", JSONArray())
                        .put("document", JSONObject().put("paints", JSONArray()).put("controls", JSONArray()).put("areas", JSONArray()).put("live", JSONArray()).put("flow", flow))
                )
        )
    }

    @Test
    fun settingsClickThroughStaysInRightPaneInsteadOfFullscreen() {
        val rootIndex = settingsPage()
        val accountsDoc = semanticFlowPage(
            "accounts",
            "音乐平台账号",
            listOf(
                JSONObject().put("id", "accounts-group").put("kind", "group").put("title", "音乐平台"),
                JSONObject().put("id", "provider:qq").put("kind", "action").put("title", "QQ音乐").put("hint", "已登录 · 测试用户").put("value", "管理"),
                JSONObject().put("id", "provider:netease").put("kind", "action").put("title", "网易云音乐").put("hint", "未登录").put("value", "登录"),
            ),
        )
        val appearanceDoc = semanticFlowPage(
            "options:appearance:false:false:false:false:false:false:false:false",
            "视觉设置",
            listOf(
                JSONObject().put("id", "theme-group").put("kind", "group").put("title", "主题与外观"),
                JSONObject().put("id", "glacier").put("kind", "switch").put("title", "冰川主题").put("value", "1"),
            ),
        )
        val playbackDoc = semanticFlowPage(
            "options:playback:false:false:false:false:false:false:false:false",
            "播放设置",
            listOf(
                JSONObject().put("id", "audio-group").put("kind", "group").put("title", "音频输出"),
                JSONObject().put("id", "gapless").put("kind", "switch").put("title", "无缝播放").put("value", "1"),
            ),
        )
        val stageEditorDoc = semanticFlowPage(
            "options:appearance:true:false:false:false:false:false:false:false",
            "舞台编辑",
            listOf(
                JSONObject().put("id", "stage-note").put("kind", "note").put("title", "全屏舞台编辑器"),
            ),
        )
        assertFalse(accountsDoc.isFullscreenSettingsEditor())
        assertFalse(appearanceDoc.isFullscreenSettingsEditor())
        assertFalse(playbackDoc.isFullscreenSettingsEditor())
        assertTrue(stageEditorDoc.isFullscreenSettingsEditor())

        var current by mutableStateOf(accountsDoc)
        var activeAction by mutableStateOf("settings:accounts")
        var lyricsMode by mutableStateOf<String?>(null)
        compose.setContent {
            CompositionLocalProvider(
                LocalPadWindow provides PadWindow(1280f, 800f),
                LocalInterfacePalette provides InterfacePalette(true, "glacier"),
                LocalChromeRendering provides false,
                LocalNativePageBottomPx provides 220f,
            ) {
                Box(Modifier.fillMaxSize()) {
                    NativePageView(
                        current,
                        Modifier.size(1280.dp, 800.dp),
                        settingsRootPage = rootIndex,
                        settingsActiveAction = activeAction,
                        splitLyricsMode = lyricsMode,
                        onSettingsSelect = { act, _, _ ->
                            activeAction = act
                            when (act) {
                                "open:platform-accounts" -> { lyricsMode = null; current = accountsDoc }
                                "open:appearance" -> { lyricsMode = null; current = appearanceDoc }
                                "open:playback" -> { lyricsMode = null; current = playbackDoc }
                            }
                        },
                    ) { _, _, _ -> }
                }
            }
        }

        // Initial default shows 音乐平台账号 inside right pane while middle directory stays visible
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithTag("pad-settings-detail").assertIsDisplayed()
        compose.onNodeWithText("QQ音乐").assertIsDisplayed()
        shot("settings-p0-accounts-right-pane")

        // Click 视觉设置 (appearance) -> right pane updates, directory stays visible (NOT fullscreen)
        compose.onNodeWithText("外观设置").performClick()
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithTag("pad-settings-detail").assertIsDisplayed()
        compose.onNodeWithText("冰川主题").assertIsDisplayed()
        shot("settings-p0-visual-right-pane")

        // Click 播放设置 -> right pane updates, directory stays visible
        compose.onNodeWithText("播放设置").performClick()
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithText("无缝播放").assertIsDisplayed()

        // Desktop lyrics in split pane keeps directory visible
        compose.runOnIdle { lyricsMode = "desktop" }
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithText("启用桌面歌词").assertIsDisplayed()
        shot("settings-p0-desktop-lyrics-right-pane")
    }

    @Test
    fun discoveryRadarsHaveNoOverlapOrFogAndPlaylistsAdaptTo14ItemsAcrossFormFactors() {
        val my14Playlists = (0 until 14).map { idx ->
            item("mine$idx", "我的真实歌单$idx", "QQ音乐 · ${(idx + 1) * 15}首")
        }
        val recommended12 = (0 until 12).map { idx ->
            item("rec$idx", "精选歌单$idx", "网易云 · ${(idx + 1) * 20}首")
        }
        val radarItems = listOf(
            item("style", "风格雷达", "歌手与音乐的关联").put("secondary", "radar:style:play"),
            item("time", "时光雷达", "重逢旧日旋律").put("secondary", "radar:time:play"),
            item("explore", "探索雷达", "发现未听过的音乐").put("secondary", "radar:explore:play"),
        )
        fun makeDiscovery(width: Int, height: Int, plItems: List<JSONObject>) = NativePage.parse(
            JSONObject()
                .put("id", "home")
                .put("session", "pad20-discovery-$width")
                .put("enabled", true)
                .put("width", width)
                .put("height", height)
                .put("viewportWidth", width)
                .put(
                    "model",
                    JSONObject()
                        .put("key", "home:discovery:all")
                        .put("title", "推荐")
                        .put("subtitle", "发现属于你的下一首")
                        .put(
                            "sections",
                            JSONArray(
                                listOf(
                                    section("discovery-sources", "chips", "", listOf(
                                        item("all", "综合推荐").put("selected", true),
                                        item("qq", "QQ音乐"),
                                        item("netease", "网易云"),
                                    )),
                                    section("discovery-brand", "discoveryHero", "", listOf(
                                        item("roam", "听屿漫游", "让熟悉与未知，在下一首相遇").put("secondaryLabel", "立即漫游"),
                                    )),
                                    section("shortcuts", "quickLinks", "", listOf(
                                        JSONObject().put("id", "quick:daily").put("title", "每日推荐").put("image", "calendar").put("action", "quick:daily"),
                                        JSONObject().put("id", "quick:heart").put("title", "心动模式").put("image", "heart").put("action", "quick:heart"),
                                        JSONObject().put("id", "quick:fm").put("title", "私人 FM").put("image", "radio").put("action", "quick:fm"),
                                        JSONObject().put("id", "quick:charts").put("title", "排行榜").put("image", "chart-no-axes-column").put("action", "quick:charts"),
                                    )),
                                    section("discovery-radars", "radarCards", "你的专属雷达", radarItems).put("more", "allRadar").put("moreLabel", "全部"),
                                    section("recent", "cards", "最近播放", (0..7).map { item("recent$it", "最近歌曲$it", "歌手$it · QQ音乐") }).put("more", "recentAll").put("moreLabel", "全部"),
                                    section("discovery-collections", "cards", "为你精选歌单", recommended12).put("more", "allCollections").put("moreLabel", "全部"),
                                    section("playlists", "cards", "我的歌单", plItems).put("more", "library").put("moreLabel", "全部"),
                                )
                            )
                        )
                )
        )

        var window by mutableStateOf(PadWindow(1280f, 800f))
        var palette by mutableStateOf(InterfacePalette(true, "glacier"))
        var currentPage by mutableStateOf(makeDiscovery(1280, 800, my14Playlists))
        compose.setContent {
            CompositionLocalProvider(
                LocalPadWindow provides window,
                LocalInterfacePalette provides palette,
                LocalChromeRendering provides false,
            ) {
                Box(Modifier.fillMaxSize()) {
                    NativePageView(currentPage, Modifier.size(window.width.dp, window.height.dp)) { action, _, _ ->
                        events += action
                    }
                }
            }
        }

        // Verify landscape alignment & 2:1 bounded radar non-overlap
        compose.onNodeWithTag("pad-home-list").assertIsDisplayed()
        compose.onNodeWithText("风格雷达").assertIsDisplayed()
        val roamBounds = compose.onNodeWithTag("discovery-hero").fetchSemanticsNode().boundsInRoot
        val recentBounds = compose.onNodeWithText("最近播放").fetchSemanticsNode().boundsInRoot
        assertTrue("Top baseline of 听屿漫游 and 最近播放 must align closely", kotlin.math.abs(roamBounds.top - recentBounds.top) < 16f)

        compose.onNodeWithTag("pad-home-list").performScrollToNode(hasText("探索雷达"))
        val radarCoverBounds = compose.onNodeWithTag("discovery-radar-cover:style", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val radarTitleBounds = compose.onNodeWithText("风格雷达", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        assertTrue(
            "Radar cover must stay compact (<=161) and end strictly above title text (gap>=8); cover=$radarCoverBounds, title=$radarTitleBounds",
            radarCoverBounds.height <= 161f && radarTitleBounds.top >= radarCoverBounds.bottom + 8f,
        )
        compose.onNodeWithTag("pad-home-list").performScrollToIndex(0)
        shot("home-p1-landscape-top-glacier-light")

        // Scroll down to verify 12 of 14 playlists appear on 6-col landscape (not fixed 4!)
        compose.onNodeWithTag("pad-home-list").performScrollToNode(hasText("我的歌单"))
        compose.onNodeWithTag("pad-home-list").performScrollToNode(hasTestTag("pad-card:mine11"))
        compose.onNodeWithTag("pad-card:mine0").assertIsDisplayed()
        compose.onNodeWithTag("pad-card:mine5").assertIsDisplayed()
        compose.onNodeWithTag("pad-card:mine6").assertIsDisplayed()
        compose.onNodeWithTag("pad-card:mine11").assertIsDisplayed()
        compose.onNodeWithTag("pad-card:mine12").assertDoesNotExist()
        shot("home-p1-landscape-playlists-12-glacier-light")

        // Classic dark on landscape
        compose.runOnIdle { palette = InterfacePalette(false, "classic") }
        compose.onNodeWithTag("pad-home-list").performScrollToIndex(0)
        shot("home-p1-landscape-top-classic-dark")

        // 4 playlists when user genuinely has only 4 -> left aligned, no fake cards
        compose.runOnIdle {
            palette = InterfacePalette(true, "glacier")
            currentPage = makeDiscovery(1280, 800, my14Playlists.take(4))
        }
        compose.onNodeWithTag("pad-home-list").performScrollToNode(hasTestTag("pad-card:mine3"))
        compose.onNodeWithTag("pad-card:mine3").assertIsDisplayed()
        compose.onNodeWithTag("pad-card:mine4").assertDoesNotExist()

        // Split-screen 720x800 with 14 playlists -> adaptive grid shows > 4 playlists
        compose.runOnIdle {
            window = PadWindow(720f, 800f)
            currentPage = makeDiscovery(720, 800, my14Playlists)
        }
        compose.onNodeWithTag("native-home-list").performScrollToNode(hasText("我的真实歌单5"))
        compose.onNodeWithText("我的真实歌单5").assertIsDisplayed()

        // Portrait 800x1280 with 14 playlists -> more than 4 (e.g. 8 playlists)
        compose.runOnIdle {
            window = PadWindow(800f, 1280f)
            currentPage = makeDiscovery(800, 1280, my14Playlists)
        }
        compose.onNodeWithTag("native-home-list").performScrollToNode(hasText("我的真实歌单5"))
        compose.onNodeWithText("我的真实歌单5").assertIsDisplayed()
        shot("home-p1-portrait-800x1280")

        // Phone 393x852 (Glacier Light & Classic Dark) retains 4 playlists & crisp 1:1 radars without overlap
        compose.runOnIdle {
            window = PadWindow(393f, 852f)
            currentPage = makeDiscovery(393, 852, my14Playlists)
        }
        compose.onNodeWithTag("native-home-list").performScrollToNode(hasText("风格雷达"))
        val phoneCoverBounds = compose.onNodeWithTag("discovery-radar-cover:style", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val phoneTitleBounds = compose.onNodeWithText("风格雷达", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        assertTrue(
            "Phone radar cover and title must never overlap; cover=$phoneCoverBounds, title=$phoneTitleBounds",
            phoneTitleBounds.top >= phoneCoverBounds.bottom + 8f,
        )
        shot("phone-p1-radar-glacier-light")
        compose.runOnIdle { palette = InterfacePalette(false, "classic") }
        shot("phone-p1-radar-classic-dark")
    }

    @Test
    fun settingsSplitOpaqueBackdropAndGlobalFeedbackModalPinnedFooter() {
        val rootIndex = settingsPage()
        val modalNodes = listOf(
            JSONObject().put("id", "cat-pad").put("kind", "action").put("title", "Pad适配异常").put("selected", true),
            JSONObject().put("id", "desc-field").put("kind", "input").put("title", "问题描述").put("value", "设置页显示异常"),
            JSONObject().put("id", "diag-toggle").put("kind", "toggle").put("title", "附带诊断日志").put("checked", true),
            JSONObject().put("id", "repro-field").put("kind", "input").put("title", "复现步骤（可选）").put("value", ""),
            JSONObject().put("id", "manual-export").put("kind", "action").put("title", "手动导出"),
            JSONObject().put("id", "submit-feedback").put("kind", "action").put("title", "提交反馈").put("primary", true),
        )
        val modalLayout = JSONObject()
            .put("id", "feedback-root")
            .put("kind", "column")
            .put("style", JSONObject().put("gap", 12))
            .put(
                "children",
                JSONArray(
                    listOf(
                        JSONObject().put("id", "body").put("kind", "column").put("style", JSONObject().put("gap", 12)).put(
                            "children",
                            JSONArray(
                                listOf(
                                    JSONObject().put("id", "l1").put("kind", "control").put("ref", "cat-pad"),
                                    JSONObject().put("id", "l2").put("kind", "control").put("ref", "desc-field").put("style", JSONObject().put("minHeight", 140)),
                                    JSONObject().put("id", "l3").put("kind", "control").put("ref", "diag-toggle"),
                                    JSONObject().put("id", "l4").put("kind", "control").put("ref", "repro-field").put("style", JSONObject().put("minHeight", 120)),
                                    JSONObject().put("id", "l5").put("kind", "control").put("ref", "manual-export"),
                                )
                            ),
                        ),
                        JSONObject().put("id", "footer").put("kind", "column").put("style", JSONObject().put("gap", 8).put("divider", true)).put(
                            "children",
                            JSONArray(listOf(JSONObject().put("id", "l6").put("kind", "control").put("ref", "submit-feedback"))),
                        ),
                    )
                ),
            )
        val feedbackModal = JSONObject()
            .put("key", "settings-flow:about:modal")
            .put("title", "问题反馈")
            .put("subtitle", "")
            .put("nodes", JSONArray(modalNodes))
            .put("layout", modalLayout)

        val aboutDoc = NativePage.parse(
            JSONObject()
                .put("id", "settings")
                .put("session", "pad-fix-about")
                .put("enabled", true)
                .put("width", 1280)
                .put("height", 800)
                .put("viewportWidth", 1280)
                .put("safeTop", 24)
                .put(
                    "model",
                    JSONObject()
                        .put("key", "settings:document:about")
                        .put("title", "关于与使用说明")
                        .put("sections", JSONArray())
                        .put(
                            "document",
                            JSONObject()
                                .put("paints", JSONArray())
                                .put("controls", JSONArray())
                                .put("areas", JSONArray())
                                .put("live", JSONArray())
                                .put(
                                    "flow",
                                    JSONObject()
                                        .put("key", "about")
                                        .put("title", "关于与使用说明")
                                        .put(
                                            "nodes",
                                            JSONArray(
                                                listOf(
                                                    JSONObject().put("id", "ver").put("kind", "action").put("title", "当前听屿版本 v1.5.94").put("hint", "Build 310 · 私有内测通道"),
                                                    JSONObject().put("id", "fb").put("kind", "action").put("title", "问题反馈与诊断").put("hint", "预览并主动提交云端反馈"),
                                                )
                                            ),
                                        )
                                        .put("modal", feedbackModal),
                                ),
                        ),
                )
        )

        var window by mutableStateOf(PadWindow(1280f, 800f))
        var palette by mutableStateOf(InterfacePalette(true, "glacier"))
        var modalOpen by mutableStateOf(true)
        val events = mutableListOf<String>()
        compose.setContent {
            CompositionLocalProvider(
                LocalPadWindow provides window,
                LocalInterfacePalette provides palette,
                LocalChromeRendering provides false,
                LocalGlobalSettingsModalHostActive provides true,
            ) {
                Box(Modifier.size(window.width.dp, window.height.dp)) {
                    NativePageView(
                        page = aboutDoc,
                        modifier = Modifier.fillMaxSize(),
                        settingsRootPage = rootIndex,
                        settingsActiveAction = "settings:about",
                        onSettingsSelect = { action, _, _ -> events += action },
                    ) { action, _, _ -> events += action }

                    // Mirror ComposeChromeHost's global modal overlay at zIndex 11f
                    val modal = if (modalOpen) aboutDoc.document?.flow?.modal else null
                    val density = androidx.compose.ui.platform.LocalDensity.current
                    TyPanelOverlay(
                        visible = modal != null,
                        light = palette.light,
                        modifier = Modifier.fillMaxSize().testTag("global-settings-modal-overlay"),
                        onClose = { modalOpen = false; events += "dismiss" },
                    ) {
                        modal?.let {
                            SettingsModalDialogContent(
                                modal = it,
                                theme = settingsFlowTheme(),
                                viewportWidth = with(density) { window.width.dp.toPx() },
                                viewportHeight = with(density) { window.height.dp.toPx() },
                                onAction = { a, _, _ -> events += a },
                            )
                        }
                    }
                }
            }
        }

        // 1. Global modal must center across the full 1280dp window (NOT trapped inside right pane x >= 434)
        compose.onNodeWithTag("ty-dialog-card").assertIsDisplayed()
        compose.onNodeWithTag("ty-dialog-footer").assertIsDisplayed()
        compose.onNodeWithText("提交反馈").assertIsDisplayed()
        val cardBounds = compose.onNodeWithTag("ty-dialog-card").fetchSemanticsNode().boundsInRoot
        val footerBounds = compose.onNodeWithTag("ty-dialog-footer").fetchSemanticsNode().boundsInRoot
        val cardCenterX = (cardBounds.left + cardBounds.right) / 2f
        assertTrue("Modal must center across full 1280px window; centerX=$cardCenterX", kotlin.math.abs(cardCenterX - 640f) < 40f)
        assertTrue("Pinned submit footer must fit completely inside card & window; footer=$footerBounds, card=$cardBounds", footerBounds.bottom <= cardBounds.bottom + 1f && footerBounds.bottom <= 800f)
        shot("settings-fix-feedback-global-landscape")

        // 2. Classic Dark theme verification
        compose.runOnIdle { palette = InterfacePalette(false, "classic") }
        shot("settings-fix-feedback-global-dark")

        // 3. Dismiss modal -> verify clean opaque split settings page (left gutter + middle directory opaque)
        compose.runOnIdle { palette = InterfacePalette(true, "glacier"); modalOpen = false }
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithText("当前听屿版本 v1.5.94").assertIsDisplayed()
        shot("settings-fix-split-opaque-glacier-light")

        // Verify left nav gutter (x=40, y=300) and middle directory area are 100% opaque (alpha == 255)
        compose.runOnIdle {
            val view = compose.activity.window.decorView
            val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bmp))
            val leftGutterAlpha = android.graphics.Color.alpha(bmp.getPixel(40, 300))
            val rightEdgeAlpha = android.graphics.Color.alpha(bmp.getPixel(1270, 300))
            bmp.recycle()
            assertEquals("Left nav gutter must have opaque background fill", 255, leftGutterAlpha)
            assertEquals("Right edge must have opaque background fill (no transparent endInset strip)", 255, rightEdgeAlpha)
        }

        // 4. Tablet portrait 800x1280 with modal open -> submit button visible & unclipped
        compose.runOnIdle { window = PadWindow(800f, 1280f); modalOpen = true }
        compose.onNodeWithText("提交反馈").assertIsDisplayed()
        shot("settings-fix-feedback-portrait")

        // 5. Phone 393x852 with modal open -> submit button visible & unclipped
        compose.runOnIdle { window = PadWindow(393f, 852f); modalOpen = true }
        compose.onNodeWithText("提交反馈").assertIsDisplayed()
        shot("settings-fix-feedback-phone")
    }

    @Test
    fun tabletSettingsThirdRoundSingleColumnAndAllEntriesInteractive() {
        fun buildRealSettingsIndex(rearSubtitle: String): NativePage {
            val sections = listOf(
                section("accounts-service", "rows", "账号与服务", listOf(
                    item("platform-accounts", "音乐平台账号", "管理各音乐平台的登录状态").put("action", "settings:accounts"),
                )),
                section("lyrics-output", "rows", "歌词功能", listOf(
                    item("desktop-lyrics", "桌面歌词", "原生悬浮歌词与样式设置").put("action", "lyrics:desktop"),
                    item("bluetooth-lyrics", "车载蓝牙歌词", "为选定 A2DP 设备尝试显示歌词标题").put("action", "lyrics:bluetooth"),
                    item("rear-entry", "背屏歌词", rearSubtitle).put("action", "rear:open"),
                )),
                section("discovery", "rows", "音乐发现", listOf(
                    item("discovery-settings", "推荐设置", "推荐来源、探索偏好与内容模块").put("action", "discovery:settings"),
                    item("search-settings", "搜索设置", "搜索来源与结果偏好").put("action", "search:settings"),
                )),
                section("appearance", "rows", "外观", listOf(
                    item("appearance", "视觉设置", "主题、歌词渲染和背景外观。").put("action", "settings:appearance"),
                    item("general", "界面设置", "语言、布局与导航偏好").put("action", "settings:general"),
                )),
                section("control", "rows", "控制", listOf(
                    item("playback", "播放控制", "音质、淡入淡出与输出设置").put("action", "settings:playback"),
                    item("integration", "音源与系统歌词", "在线音源导入与状态栏歌词").put("action", "settings:integration"),
                )),
                section("system", "rows", "系统", listOf(
                    item("storage", "存储与同步", "缓存清理、备份与恢复").put("action", "settings:storage"),
                    item("graphics", "图形", "渲染帧率与硬件加速").put("action", "settings:graphics"),
                    item("about", "关于与使用说明", "版本信息、更新检查与问题反馈").put("action", "help"),
                )),
                section("support", "rows", "支持与交流", listOf(
                    item("coffee", "请作者喝杯咖啡", "自愿赞赏支持开发").put("action", "support:coffee"),
                    item("community", "加入听屿交流群", "交流反馈与内测讨论").put("action", "support:group"),
                )),
            )
            return NativePage.parse(
                JSONObject()
                    .put("id", "settings")
                    .put("session", "pad-r3-index")
                    .put("enabled", true)
                    .put("width", 1280)
                    .put("height", 800)
                    .put("viewportWidth", 1280)
                    .put("safeTop", 24)
                    .put(
                        "model",
                        JSONObject()
                            .put("key", "settings:index")
                            .put("title", "设置")
                            .put("bottomClearance", 74)
                            .put("sections", JSONArray(sections)),
                    )
            )
        }

        val realAccountsDoc = semanticFlowPage(
            "accounts",
            "音乐平台账号",
            listOf(
                JSONObject().put("id", "accounts-desc").put("kind", "note").put("title", "统一管理各音乐平台的登录状态，同步个人歌单、收藏及高音质播放权限。不会影响自定义音源导入。"),
                JSONObject().put("id", "accounts-group").put("kind", "group").put("title", "音乐平台"),
                JSONObject().put("id", "provider:netease").put("kind", "action").put("title", "网易云音乐").put("hint", "已登录 · 吾乃小黑呀").put("value", "管理"),
                JSONObject().put("id", "provider:kugou").put("kind", "action").put("title", "酷狗音乐").put("hint", "未登录（可使用公开推荐与搜索）").put("value", "登录"),
                JSONObject().put("id", "provider:qq").put("kind", "action").put("title", "QQ音乐").put("hint", "已登录 · 测试账号").put("value", "管理"),
                JSONObject().put("id", "provider:bodian").put("kind", "action").put("title", "波点音乐").put("hint", "未登录（可使用公开推荐与搜索）").put("value", "登录"),
                JSONObject().put("id", "provider:qishui").put("kind", "action").put("title", "汽水音乐").put("hint", "未登录（可使用公开推荐与搜索）").put("value", "登录"),
            ),
        )
        val discoveryDoc = semanticFlowPage(
            "discovery",
            "推荐设置",
            listOf(
                JSONObject().put("id", "disc-desc").put("kind", "note").put("title", "自定义推荐来源优先级与首页模块展示。"),
                JSONObject().put("id", "disc-g1").put("kind", "group").put("title", "推荐来源"),
                JSONObject().put("id", "disc-s1").put("kind", "switch").put("title", "启用跨平台混合推荐").put("value", "1"),
                JSONObject().put("id", "disc-g2").put("kind", "group").put("title", "探索偏好"),
                JSONObject().put("id", "disc-s2").put("kind", "switch").put("title", "优先推荐熟悉歌手").put("value", "0"),
            ),
        )
        val searchDoc = semanticFlowPage(
            "search",
            "搜索设置",
            listOf(
                JSONObject().put("id", "search-desc").put("kind", "note").put("title", "管理聚合搜索的平台范围与搜索历史。"),
                JSONObject().put("id", "search-g1").put("kind", "group").put("title", "搜索来源"),
                JSONObject().put("id", "search-s1").put("kind", "switch").put("title", "聚合搜索全平台曲库").put("value", "1"),
                JSONObject().put("id", "search-g2").put("kind", "group").put("title", "历史记录"),
                JSONObject().put("id", "search-s2").put("kind", "action").put("title", "清空搜索历史").put("value", "清空"),
            ),
        )
        val appearanceDoc = semanticFlowPage(
            "options:appearance:false:false:false:false:false:false:false:false",
            "视觉设置",
            listOf(
                JSONObject().put("id", "app-g1").put("kind", "group").put("title", "主题与色彩"),
                JSONObject().put("id", "app-s1").put("kind", "switch").put("title", "跟随系统深浅色").put("value", "1"),
            ),
        )
        val generalDoc = semanticFlowPage(
            "options:general:false:false:false:false:false:false:false:false",
            "界面设置",
            listOf(
                JSONObject().put("id", "gen-g1").put("kind", "group").put("title", "界面与语言"),
                JSONObject().put("id", "gen-s1").put("kind", "action").put("title", "显示语言").put("value", "简体中文"),
            ),
        )
        val playbackDoc = semanticFlowPage(
            "options:playback:false:false:false:false:false:false:false:false",
            "播放控制",
            listOf(
                JSONObject().put("id", "play-g1").put("kind", "group").put("title", "播放行为"),
                JSONObject().put("id", "play-s1").put("kind", "switch").put("title", "无缝播放").put("value", "1"),
            ),
        )
        val integrationDoc = semanticFlowPage(
            "options:integration:false:false:false:false:false:false:false:false",
            "音源与系统歌词",
            listOf(
                JSONObject().put("id", "int-g1").put("kind", "group").put("title", "自定义音源"),
                JSONObject().put("id", "int-s1").put("kind", "action").put("title", "导入洛雪音源脚本").put("value", "导入"),
            ),
        )
        val storageDoc = semanticFlowPage(
            "options:storage:false:false:false:false:false:false:false:false",
            "存储与同步",
            listOf(
                JSONObject().put("id", "sto-g1").put("kind", "group").put("title", "本地缓存"),
                JSONObject().put("id", "sto-s1").put("kind", "action").put("title", "清理音频与图片缓存").put("value", "清理"),
            ),
        )
        val graphicsDoc = semanticFlowPage(
            "options:graphics:false:false:false:false:false:false:false:false",
            "图形",
            listOf(
                JSONObject().put("id", "gfx-g1").put("kind", "group").put("title", "渲染管线"),
                JSONObject().put("id", "gfx-s1").put("kind", "switch").put("title", "高刷液态玻璃渲染").put("value", "1"),
            ),
        )
        val aboutDoc = semanticFlowPage(
            "help:appearance:false:false:false:false:false:false:false:false",
            "关于与使用说明",
            listOf(
                JSONObject().put("id", "abt-g1").put("kind", "group").put("title", "版本与更新"),
                JSONObject().put("id", "abt-s1").put("kind", "action").put("title", "检查内测版本更新").put("value", "v1.5.96"),
            ),
        )
        val rearControlDoc = NativePage.parse(
            JSONObject()
                .put("id", "settings")
                .put("session", "pad-r3-rear")
                .put("enabled", true)
                .put("width", 1280)
                .put("height", 800)
                .put("viewportWidth", 1280)
                .put("safeTop", 24)
                .put(
                    "model",
                    JSONObject()
                        .put("key", "settings:rear:control")
                        .put("title", "背屏歌词")
                        .put("leading", "rear:back")
                        .put("trailingLabel", "返回")
                        .put("sections", JSONArray(listOf(
                            section("rear-summary", "rows", "背屏控制", listOf(
                                item("toggle", "开启背屏歌词", "Shizuku · 未启用（等待授权）").put("action", "rear:toggle"),
                            )),
                        ))),
                )
        )

        var window by mutableStateOf(PadWindow(1280f, 800f))
        var palette by mutableStateOf(InterfacePalette(true, "glacier"))
        var rootIndex by mutableStateOf(buildRealSettingsIndex("Shizuku · 当前未检测到支持的背屏"))
        var currentDetail by mutableStateOf(realAccountsDoc)
        var activeAction by mutableStateOf("settings:accounts")
        var lyricsMode by mutableStateOf<String?>(null)
        var supportSheet by mutableStateOf<String?>(null)
        val clickedActions = mutableListOf<String>()

        compose.setContent {
            CompositionLocalProvider(
                LocalPadWindow provides window,
                LocalInterfacePalette provides palette,
                LocalChromeRendering provides false,
                LocalNativePageBottomPx provides 112f,
            ) {
                Box(Modifier.size(window.width.dp, window.height.dp)) {
                    val shown = supportSheet?.let { kind ->
                        NativeSettingsDestination(kind).page(currentDetail, window.width, window.height)
                    } ?: currentDetail
                    val nativeKind = NativeSettingsDestination.fromKey(shown.key)
                    if (nativeKind != null) {
                        NativeSettingsContent(nativeKind, compose.activity, null) {
                            supportSheet = null
                        }
                    } else {
                        NativePageView(
                            page = shown,
                            modifier = Modifier.fillMaxSize(),
                            settingsRootPage = rootIndex,
                            settingsActiveAction = activeAction,
                            splitLyricsMode = lyricsMode,
                            onCloseSplitLyrics = { lyricsMode = null },
                            onSettingsSelect = { itemAction, _, _ ->
                                clickedActions += itemAction
                                if (itemAction.startsWith("support:")) {
                                    supportSheet = itemAction.removePrefix("support:")
                                } else if (itemAction == "lyrics:desktop" || itemAction == "lyrics:bluetooth") {
                                    lyricsMode = if (itemAction == "lyrics:bluetooth") "bluetooth" else "desktop"
                                    activeAction = itemAction
                                } else {
                                    lyricsMode = null
                                    activeAction = itemAction
                                    currentDetail = when (itemAction) {
                                        "settings:accounts" -> realAccountsDoc
                                        "rear:open" -> rearControlDoc
                                        "discovery:settings" -> discoveryDoc
                                        "search:settings" -> searchDoc
                                        "settings:appearance" -> appearanceDoc
                                        "settings:general" -> generalDoc
                                        "settings:playback" -> playbackDoc
                                        "settings:integration" -> integrationDoc
                                        "settings:storage" -> storageDoc
                                        "settings:graphics" -> graphicsDoc
                                        "help" -> aboutDoc
                                        else -> currentDetail
                                    }
                                }
                            },
                        ) { action, _, _ ->
                            clickedActions += action
                        }
                    }
                }
            }
        }

        // 1. Verify Problem 3: Unsupported tablet hides 背屏歌词 inside 歌词功能 while keeping 桌面歌词 & 车载蓝牙歌词
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithText("桌面歌词").assertIsDisplayed()
        compose.onNodeWithText("车载蓝牙歌词").assertIsDisplayed()
        compose.onNodeWithText("背屏歌词").assertDoesNotExist()

        // 2. Verify Problem 1: 音乐平台账号 detail pane uses single vertical column (Title -> Note -> Group -> Providers)
        val noteBounds = compose.onNodeWithText("统一管理各音乐平台的登录状态，同步个人歌单、收藏及高音质播放权限。不会影响自定义音源导入。").fetchSemanticsNode().boundsInRoot
        val groupBounds = compose.onNodeWithText("音乐平台").fetchSemanticsNode().boundsInRoot
        val neteaseBounds = compose.onNodeWithText("网易云音乐").fetchSemanticsNode().boundsInRoot
        assertTrue(
            "Explanatory note must be stacked vertically ABOVE group header (no 2-column split); note=$noteBounds, group=$groupBounds",
            noteBounds.bottom <= groupBounds.top + 4f && kotlin.math.abs(noteBounds.left - groupBounds.left) < 12f,
        )
        assertTrue(
            "Group header must be stacked vertically ABOVE provider cards; group=$groupBounds, netease=$neteaseBounds",
            groupBounds.bottom <= neteaseBounds.top + 4f,
        )
        shot("pad-r3-accounts-single-column-glacier-light")

        // 3. Verify Problem 2 & 5: Click through EVERY setting item in the middle directory one by one!
        // (2) 桌面歌词
        compose.onNodeWithText("桌面歌词").performClick()
        assertEquals("lyrics:desktop", activeAction)
        compose.onNodeWithText("启用桌面歌词").assertIsDisplayed()

        // (3) 车载蓝牙歌词
        compose.onNodeWithText("车载蓝牙歌词").performClick()
        assertEquals("lyrics:bluetooth", activeAction)
        compose.onAllNodesWithText("车载蓝牙歌词").assertCountEquals(2)

        // (4) 推荐设置 (also verify single-column vertical stacking of its 2 groups!)
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("推荐设置"))
        compose.onNodeWithText("推荐设置").performClick()
        assertEquals("discovery:settings", activeAction)
        compose.onNodeWithText("启用跨平台混合推荐").assertIsDisplayed()
        val discG1 = compose.onNodeWithText("推荐来源").fetchSemanticsNode().boundsInRoot
        val discG2 = compose.onNodeWithText("探索偏好").fetchSemanticsNode().boundsInRoot
        assertTrue("Discovery settings groups must stack vertically in one column; g1=$discG1, g2=$discG2", discG1.bottom <= discG2.top && kotlin.math.abs(discG1.left - discG2.left) < 12f)
        shot("pad-r3-discovery-single-column")

        // (5) 搜索设置
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("搜索设置"))
        compose.onNodeWithText("搜索设置").performClick()
        assertEquals("search:settings", activeAction)
        compose.onNodeWithText("聚合搜索全平台曲库").assertIsDisplayed()

        // (6) 视觉设置
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("视觉设置"))
        compose.onNodeWithText("视觉设置").performClick()
        assertEquals("settings:appearance", activeAction)
        compose.onNodeWithText("跟随系统深浅色").assertIsDisplayed()

        // (7) 界面设置
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("界面设置"))
        compose.onNodeWithText("界面设置").performClick()
        assertEquals("settings:general", activeAction)
        compose.onNodeWithText("显示语言").assertIsDisplayed()

        // (8) 播放控制
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("播放控制"))
        compose.onNodeWithText("播放控制").performClick()
        assertEquals("settings:playback", activeAction)
        compose.onNodeWithText("无缝播放").assertIsDisplayed()

        // (9) 音源与系统歌词
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("音源与系统歌词"))
        compose.onNodeWithText("音源与系统歌词").performClick()
        assertEquals("settings:integration", activeAction)
        compose.onNodeWithText("导入洛雪音源脚本").assertIsDisplayed()

        // (10) 存储与同步
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("存储与同步"))
        compose.onNodeWithText("存储与同步").performClick()
        assertEquals("settings:storage", activeAction)
        compose.onNodeWithText("清理音频与图片缓存").assertIsDisplayed()

        // (11) 图形
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("图形"))
        compose.onNodeWithText("图形").performClick()
        assertEquals("settings:graphics", activeAction)
        compose.onNodeWithText("高刷液态玻璃渲染").assertIsDisplayed()

        // (12) 关于与使用说明
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("关于与使用说明"))
        compose.onNodeWithText("关于与使用说明").performClick()
        assertEquals("help", activeAction)
        compose.onNodeWithText("检查内测版本更新").assertIsDisplayed()

        // (13) 请作者喝杯咖啡 (native support sheet) -> open and return
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("请作者喝杯咖啡"))
        compose.onNodeWithText("请作者喝杯咖啡").performClick()
        assertEquals("coffee", supportSheet)
        compose.runOnIdle { supportSheet = null }

        // (14) 加入听屿交流群 (native support sheet) -> open and return
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("加入听屿交流群"))
        compose.onNodeWithText("加入听屿交流群").performClick()
        assertEquals("group", supportSheet)
        compose.runOnIdle { supportSheet = null }

        // (1) Scroll back to top and click 音乐平台账号 -> returns to 音乐平台账号 in right pane
        compose.onNodeWithTag("pad-settings-directory").performScrollToNode(hasText("音乐平台账号"))
        compose.onNodeWithText("音乐平台账号").performClick()
        assertEquals("settings:accounts", activeAction)
        compose.onNodeWithText("网易云音乐").assertIsDisplayed()

        // (15) Rear-capable device (even before Shizuku permission is granted!) retains 背屏歌词 and opens it in right pane
        compose.runOnIdle {
            rootIndex = buildRealSettingsIndex("Shizuku · 未启用（等待授权）")
        }
        compose.onNodeWithText("背屏歌词").assertIsDisplayed().performClick()
        assertEquals("rear:open", activeAction)
        compose.onNodeWithText("开启背屏歌词").assertIsDisplayed()

        // Switch back to unsupported tablet index & verify across Classic Dark, Portrait (800x1280), Split-Screen (720x800), and Phone (393x852)
        compose.runOnIdle {
            rootIndex = buildRealSettingsIndex("Shizuku · 当前未检测到支持的背屏")
            currentDetail = realAccountsDoc
            activeAction = "settings:accounts"
            palette = InterfacePalette(false, "classic")
        }
        compose.onNodeWithText("背屏歌词").assertDoesNotExist()
        compose.onNodeWithText("网易云音乐").assertIsDisplayed()
        shot("pad-r3-accounts-single-column-classic-dark")

        // Tablet portrait 800x1280 preserves selected setting & single-column right detail
        compose.runOnIdle {
            palette = InterfacePalette(true, "glacier")
            window = PadWindow(800f, 1280f)
        }
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithText("网易云音乐").assertIsDisplayed()
        val portraitNote = compose.onNodeWithText("统一管理各音乐平台的登录状态，同步个人歌单、收藏及高音质播放权限。不会影响自定义音源导入。").fetchSemanticsNode().boundsInRoot
        val portraitGroup = compose.onNodeWithText("音乐平台").fetchSemanticsNode().boundsInRoot
        assertTrue("Portrait right pane must also stack note above group", portraitNote.bottom <= portraitGroup.top + 4f)
        shot("pad-r3-accounts-portrait-800x1280")

        // Split-screen 720x800
        compose.runOnIdle { window = PadWindow(720f, 800f) }
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithText("网易云音乐").assertIsDisplayed()
        shot("pad-r3-accounts-split-720x800")

        // Verify selected row pill keeps identical height & text position before and after selection (zero layout shift)
        compose.runOnIdle {
            window = PadWindow(1280f, 800f)
            activeAction = "settings:accounts"
        }
        compose.waitForIdle()
        val accountsBoundsSelected = compose.onAllNodesWithText("音乐平台账号")[0].fetchSemanticsNode().boundsInRoot
        val desktopBoundsUnselected = compose.onAllNodesWithText("桌面歌词")[0].fetchSemanticsNode().boundsInRoot
        compose.onNodeWithTag("pad-settings-row-selected").assertIsDisplayed()
        compose.runOnIdle { activeAction = "desktopLyrics:open" }
        compose.waitForIdle()
        val accountsBoundsUnselected = compose.onAllNodesWithText("音乐平台账号")[0].fetchSemanticsNode().boundsInRoot
        val desktopBoundsSelected = compose.onAllNodesWithText("桌面歌词")[0].fetchSemanticsNode().boundsInRoot
        assertEquals(accountsBoundsSelected.top, accountsBoundsUnselected.top, 0.5f)
        assertEquals(accountsBoundsSelected.left, accountsBoundsUnselected.left, 0.5f)
        assertEquals(desktopBoundsUnselected.top, desktopBoundsSelected.top, 0.5f)
        assertEquals(desktopBoundsUnselected.left, desktopBoundsSelected.left, 0.5f)

        // Phone 393x852 preserves 背屏歌词 entry on phone index
        compose.runOnIdle {
            window = PadWindow(393f, 852f)
            currentDetail = rootIndex
        }
        compose.onNodeWithText("背屏歌词").assertIsDisplayed()
        shot("pad-r3-phone-393x852-retains-rear")
    }
}
