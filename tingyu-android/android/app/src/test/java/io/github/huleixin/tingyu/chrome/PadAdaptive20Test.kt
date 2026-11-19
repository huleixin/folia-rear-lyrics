package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
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

        // Expanded / Large uses master-detail directory + detail
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithTag("pad-settings-detail").assertIsDisplayed()
        compose.onNodeWithText("音乐平台账号").assertIsDisplayed()
        compose.onNodeWithText("背屏歌词").assertDoesNotExist()
        shot("settings-master-detail-1280x800-glacier-light")

        // Switch category in left directory -> right detail updates
        compose.onNodeWithText("播放与交互").performClick()
        compose.onNodeWithText("播放设置").assertIsDisplayed()
        compose.onNodeWithText("播放设置").performClick()
        assertEquals("open:playback", events.last())

        // Switch to classic dark on 1920x1080
        compose.runOnIdle {
            palette = InterfacePalette(false, "classic")
            window = PadWindow(1920f, 1080f)
        }
        compose.onNodeWithTag("pad-settings-directory").assertIsDisplayed()
        compose.onNodeWithText("系统与关于").performClick()
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
    fun mobilePlaylistsAndRefreshRenderCleanlyAcrossThemes() {
        val page = NativePage.parse(
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
                        .put(
                            "sections",
                            JSONArray(
                                listOf(
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
                                    section(
                                        "discovery-refresh",
                                        "textActions",
                                        "",
                                        listOf(
                                            JSONObject()
                                                .put("id", "refresh")
                                                .put("title", "刷新推荐")
                                                .put("image", "refresh-cw")
                                                .put("action", "refresh")
                                        )
                                    ),
                                )
                            )
                        )
                )
        )
        var palette by mutableStateOf(InterfacePalette(true, "glacier"))
        compose.setContent {
            CompositionLocalProvider(
                LocalPadWindow provides PadWindow(393f, 852f),
                LocalInterfacePalette provides palette,
                LocalChromeRendering provides false,
            ) {
                Box(Modifier.fillMaxSize()) {
                    NativePageView(page, Modifier.size(393.dp, 852.dp)) { action, _, _ ->
                        events += action
                    }
                }
            }
        }
        compose.onNodeWithText("我喜欢").assertIsDisplayed()
        compose.onNodeWithText("QQ音乐 · 128首").assertIsDisplayed()
        compose.onNodeWithText("刷新推荐").assertIsDisplayed().performClick()
        assertEquals("refresh", events.last())
        shot("mobile-playlists-glacier-light")

        compose.runOnIdle { palette = InterfacePalette(false, "classic") }
        compose.onNodeWithText("我喜欢").assertIsDisplayed()
        shot("mobile-playlists-classic-dark")
    }
}
