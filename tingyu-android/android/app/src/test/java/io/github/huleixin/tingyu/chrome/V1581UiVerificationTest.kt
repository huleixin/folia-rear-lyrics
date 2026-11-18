package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
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
import kotlin.math.abs

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class V1581UiVerificationTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun saveScreenshot(name: String, width: Int = 393, height: Int = 852) {
        val outDir = System.getenv("TINGYU_LAYOUT_SCREENSHOTS") ?: return
        val file = File(outDir, "$name.png")
        file.parentFile?.mkdirs()
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        compose.activity.window.decorView.draw(Canvas(bitmap))
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    private fun buildLibraryPage(layoutMode: String = "rows", resourceUnit: String = "个歌单"): NativePage {
        val packet = JSONObject()
            .put("id", "collection")
            .put("session", "lib-v1581")
            .put("generation", 1)
            .put("revision", 1)
            .put("enabled", true)
            .put("viewportWidth", 393.0)
            .put("width", 393.0)
            .put("height", 852.0)
            .put("safeTop", 24.0)
            .put("safeBottom", 16.0)
            .put(
                "model",
                JSONObject()
                    .put("key", "library:unified:playlists")
                    .put("title", "资料库")
                    .put("trailing", "manage")
                    .put("trailingLabel", "资料库管理")
                    .put("trailingIcon", "folder-cog")
                    .put("bottomClearance", 88.0)
                    .put(
                        "sections",
                        JSONArray()
                            .put(
                                JSONObject()
                                    .put("id", "library-sources")
                                    .put("layout", "chips")
                                    .put(
                                        "items",
                                        JSONArray()
                                            .put(JSONObject().put("id", "all").put("title", "综合").put("action", "source:all").put("selected", true))
                                            .put(JSONObject().put("id", "qq").put("title", "QQ音乐").put("action", "source:qq"))
                                            .put(JSONObject().put("id", "netease").put("title", "网易云").put("action", "source:netease"))
                                            .put(JSONObject().put("id", "qishui").put("title", "汽水").put("action", "source:qishui")),
                                    ),
                            )
                            .put(
                                JSONObject()
                                    .put("id", "personal-shortcuts")
                                    .put("layout", "quickLinks")
                                    .put(
                                        "items",
                                        JSONArray()
                                            .put(JSONObject().put("id", "fav").put("title", "我喜欢的音乐").put("subtitle", "0 首").put("image", "heart").put("action", "fav"))
                                            .put(JSONObject().put("id", "recent").put("title", "最近播放").put("subtitle", "50 首").put("image", "clock").put("action", "recent"))
                                            .put(JSONObject().put("id", "local").put("title", "本地音乐").put("subtitle", "14 首").put("image", "smartphone").put("action", "local")),
                                    ),
                            )
                            .put(
                                JSONObject()
                                    .put("id", "library-categories")
                                    .put("layout", "chips")
                                    .put(
                                        "items",
                                        JSONArray()
                                            .put(JSONObject().put("id", "playlists").put("title", "歌单").put("action", "playlists").put("selected", resourceUnit == "个歌单"))
                                            .put(JSONObject().put("id", "albums").put("title", "收藏专辑").put("action", "albums").put("selected", resourceUnit != "个歌单")),
                                    ),
                            )
                            .put(
                                JSONObject()
                                    .put("id", "sort")
                                    .put("layout", "chips")
                                    .put("items", JSONArray().put(JSONObject().put("id", "source").put("title", "按平台").put("action", "sort:source").put("selected", true))),
                            )
                            .put(
                                JSONObject()
                                    .put("id", "library-view")
                                    .put("layout", "textActions")
                                    .put("items", JSONArray().put(JSONObject().put("id", "layout").put("title", if (layoutMode == "rows") "网格" else "列表").put("action", "layout"))),
                            )
                            // Collapsed QQ Music group: previously rendered a duplicate "34个歌单" pill below header!
                            .put(
                                JSONObject()
                                    .put("id", "directory-group:qq")
                                    .put("title", "QQ 音乐")
                                    .put("layout", layoutMode)
                                    .put("more", "toggle-group:qq")
                                    .put("moreLabel", "34$resourceUnit")
                                    .put("text", "collapsed")
                                    .put("key", "qq:collapsed")
                                    .put("total", 2)
                                    .put(
                                        "items",
                                        JSONArray()
                                            .put(JSONObject().put("id", "qq1").put("title", "我喜欢").put("subtitle", "QQ音乐 · 114 首").put("action", "open:qq1"))
                                            .put(JSONObject().put("id", "qq2").put("title", "周杰伦精选").put("subtitle", "QQ音乐 · 201 首").put("action", "open:qq2")),
                                    ),
                            )
                            // Collapsed Qishui group right below QQ Music to verify compact consecutive collapsed groups
                            .put(
                                JSONObject()
                                    .put("id", "directory-group:qishui")
                                    .put("title", "汽水音乐")
                                    .put("layout", layoutMode)
                                    .put("more", "toggle-group:qishui")
                                    .put("moreLabel", "8$resourceUnit")
                                    .put("text", "collapsed")
                                    .put("key", "qishui:collapsed")
                                    .put("total", 1)
                                    .put(
                                        "items",
                                        JSONArray().put(JSONObject().put("id", "qs1").put("title", "是小6呀喜欢").put("subtitle", "汽水音乐 · 38 首").put("action", "open:qs1")),
                                    ),
                            )
                            // Expanded NetEase Music group
                            .put(
                                JSONObject()
                                    .put("id", "directory-group:netease")
                                    .put("title", "网易云音乐")
                                    .put("layout", layoutMode)
                                    .put("more", "toggle-group:netease")
                                    .put("moreLabel", "66$resourceUnit")
                                    .put("text", "")
                                    .put("key", "netease:expanded")
                                    .put("total", 3)
                                    .put(
                                        "items",
                                        JSONArray()
                                            .put(JSONObject().put("id", "ne1").put("title", "吾乃小黑呀喜欢的音乐").put("subtitle", "网易云 · 105 首").put("action", "open:ne1").put("secondary", "menu:ne1"))
                                            .put(JSONObject().put("id", "ne2").put("title", "下载").put("subtitle", "网易云 · 1 首").put("action", "open:ne2").put("secondary", "menu:ne2"))
                                            .put(JSONObject().put("id", "ne3").put("title", "吾乃小黑呀的2025年度歌单").put("subtitle", "网易云 · 10 首").put("action", "open:ne3").put("secondary", "menu:ne3")),
                                    ),
                            ),
                    ),
            )
        return NativePage.parse(packet)
    }

    private fun buildAboutFlowPage(): Pair<TySettingsPage, NativePage> {
        val layoutJson = JSONObject()
            .put("id", "page:about")
            .put("kind", "column")
            .put("style", JSONObject().put("gap", 24).put("padding", JSONArray().put(22).put(0).put(22).put(0)))
            .put(
                "children",
                JSONArray()
                    .put(
                        JSONObject()
                            .put("id", "cards")
                            .put("kind", "column")
                            .put("style", JSONObject().put("gap", 10))
                            .put(
                                "children",
                                JSONArray()
                                    .put(
                                        JSONObject()
                                            .put("id", "ver-card")
                                            .put("kind", "column")
                                            .put("style", JSONObject().put("gap", 10).put("radius", 16).put("padding", JSONArray().put(16).put(14).put(16).put(14)).put("fill", true))
                                            .put(
                                                "children",
                                                JSONArray().put(
                                                    JSONObject()
                                                        .put("id", "ver-row")
                                                        .put("kind", "row")
                                                        .put("style", JSONObject().put("align", "center").put("gap", 12))
                                                        .put(
                                                            "children",
                                                            JSONArray()
                                                                .put(JSONObject().put("id", "ic-phone").put("kind", "icon").put("icon", "smartphone").put("style", JSONObject().put("width", 19).put("height", 19)))
                                                                .put(
                                                                    JSONObject()
                                                                        .put("id", "ver-col")
                                                                        .put("kind", "column")
                                                                        .put("style", JSONObject().put("grow", true))
                                                                        .put(
                                                                            "children",
                                                                            JSONArray()
                                                                                .put(JSONObject().put("id", "t1").put("kind", "text").put("text", "当前听屿版本 v1.5.81").put("style", JSONObject().put("font", 14).put("weight", 600)))
                                                                                .put(JSONObject().put("id", "t2").put("kind", "text").put("text", "Build 297 · 正式稳定通道 (stable)").put("style", JSONObject().put("font", 12).put("tone", "muted"))),
                                                                        ),
                                                                ),
                                                        ),
                                                ),
                                            ),
                                    )
                                    .put(
                                        JSONObject()
                                            .put("id", "ctl:check")
                                            .put("kind", "control")
                                            .put("ref", "check-update")
                                            .put("style", JSONObject().put("align", "center").put("gap", 12).put("radius", 16).put("padding", JSONArray().put(16).put(14).put(16).put(14)).put("fill", true))
                                            .put(
                                                "children",
                                                JSONArray().put(
                                                    JSONObject()
                                                        .put("id", "check-row")
                                                        .put("kind", "row")
                                                        .put("style", JSONObject().put("align", "center").put("gap", 12))
                                                        .put(
                                                            "children",
                                                            JSONArray()
                                                                .put(JSONObject().put("id", "ic-ref").put("kind", "icon").put("icon", "refresh-cw").put("style", JSONObject().put("width", 19).put("height", 19)))
                                                                .put(
                                                                    JSONObject()
                                                                        .put("id", "check-col")
                                                                        .put("kind", "column")
                                                                        .put("style", JSONObject().put("grow", true))
                                                                        .put(
                                                                            "children",
                                                                            JSONArray()
                                                                                .put(JSONObject().put("id", "c1").put("kind", "text").put("text", "检查更新").put("style", JSONObject().put("font", 14).put("weight", 600)))
                                                                                .put(JSONObject().put("id", "c2").put("kind", "text").put("text", "当前已是最新版本（正式稳定通道 (stable)）").put("style", JSONObject().put("font", 12).put("tone", "muted"))),
                                                                        ),
                                                                )
                                                                .put(JSONObject().put("id", "ic-chv1").put("kind", "icon").put("icon", "chevron-right").put("style", JSONObject().put("width", 17).put("height", 17).put("tone", "muted"))),
                                                        ),
                                                ),
                                            ),
                                    )
                                    .put(
                                        JSONObject()
                                            .put("id", "ctl:hist")
                                            .put("kind", "control")
                                            .put("ref", "release-history")
                                            .put("style", JSONObject().put("align", "center").put("gap", 12).put("radius", 16).put("padding", JSONArray().put(16).put(14).put(16).put(14)).put("fill", true))
                                            .put(
                                                "children",
                                                JSONArray().put(
                                                    JSONObject()
                                                        .put("id", "hist-row")
                                                        .put("kind", "row")
                                                        .put("style", JSONObject().put("align", "center").put("gap", 12))
                                                        .put(
                                                            "children",
                                                            JSONArray()
                                                                .put(JSONObject().put("id", "ic-hist").put("kind", "icon").put("icon", "history").put("style", JSONObject().put("width", 19).put("height", 19)))
                                                                .put(
                                                                    JSONObject()
                                                                        .put("id", "hist-col")
                                                                        .put("kind", "column")
                                                                        .put("style", JSONObject().put("grow", true))
                                                                        .put(
                                                                            "children",
                                                                            JSONArray()
                                                                                .put(JSONObject().put("id", "h1").put("kind", "text").put("text", "版本更新日志").put("style", JSONObject().put("font", 14).put("weight", 600)))
                                                                                .put(JSONObject().put("id", "h2").put("kind", "text").put("text", "查看听屿各版本真实发布记录与修复说明").put("style", JSONObject().put("font", 12).put("tone", "muted"))),
                                                                        ),
                                                                )
                                                                .put(JSONObject().put("id", "ic-chv2").put("kind", "icon").put("icon", "chevron-right").put("style", JSONObject().put("width", 17).put("height", 17).put("tone", "muted"))),
                                                        ),
                                                ),
                                            ),
                                    )
                                    .put(
                                        JSONObject()
                                            .put("id", "ctl:lic")
                                            .put("kind", "control")
                                            .put("ref", "open-licenses")
                                            .put("style", JSONObject().put("align", "center").put("gap", 12).put("radius", 16).put("padding", JSONArray().put(16).put(14).put(16).put(14)).put("fill", true))
                                            .put(
                                                "children",
                                                JSONArray().put(
                                                    JSONObject()
                                                        .put("id", "lic-row")
                                                        .put("kind", "row")
                                                        .put("style", JSONObject().put("align", "center").put("gap", 12))
                                                        .put(
                                                            "children",
                                                            JSONArray()
                                                                .put(JSONObject().put("id", "ic-lic").put("kind", "icon").put("icon", "shield-check").put("style", JSONObject().put("width", 19).put("height", 19)))
                                                                .put(
                                                                    JSONObject()
                                                                        .put("id", "lic-col")
                                                                        .put("kind", "column")
                                                                        .put("style", JSONObject().put("grow", true))
                                                                        .put(
                                                                            "children",
                                                                            JSONArray()
                                                                                .put(JSONObject().put("id", "l1").put("kind", "text").put("text", "开源声明").put("style", JSONObject().put("font", 14).put("weight", 600)))
                                                                                .put(JSONObject().put("id", "l2").put("kind", "text").put("text", "AGPL-3.0 协议、Folia 衍生来源与第三方开源许可").put("style", JSONObject().put("font", 12).put("tone", "muted"))),
                                                                        ),
                                                                )
                                                                .put(JSONObject().put("id", "ic-chv3").put("kind", "icon").put("icon", "chevron-right").put("style", JSONObject().put("width", 17).put("height", 17).put("tone", "muted"))),
                                                        ),
                                                ),
                                            ),
                                    ),
                            ),
                    )
                    // Centered 4-line brand signature at bottom of About page
                    .put(
                        JSONObject()
                            .put("id", "brand-sig")
                            .put("kind", "column")
                            .put("style", JSONObject().put("center", true).put("gap", 7))
                            .put(
                                "children",
                                JSONArray()
                                    .put(
                                        JSONObject()
                                            .put("id", "sig-brand")
                                            .put("kind", "column")
                                            .put("style", JSONObject().put("center", true).put("font", 20).put("weight", 600).put("tone", "text"))
                                            .put("children", JSONArray().put(JSONObject().put("id", "sig-brand-txt").put("kind", "text").put("text", "听屿 · Tingyu"))),
                                    )
                                    .put(
                                        JSONObject()
                                            .put("id", "sig-ver")
                                            .put("kind", "column")
                                            .put("style", JSONObject().put("center", true).put("font", 14).put("tone", "muted"))
                                            .put("children", JSONArray().put(JSONObject().put("id", "sig-ver-txt").put("kind", "text").put("text", "Version 1.5.81"))),
                                    )
                                    .put(
                                        JSONObject()
                                            .put("id", "sig-build")
                                            .put("kind", "column")
                                            .put("style", JSONObject().put("center", true).put("font", 12).put("tone", "muted"))
                                            .put("children", JSONArray().put(JSONObject().put("id", "sig-build-txt").put("kind", "text").put("text", "Build 297 · fcf3b0eb"))),
                                    )
                                    .put(
                                        JSONObject()
                                            .put("id", "sig-copy-ctl")
                                            .put("kind", "control")
                                            .put("ref", "copy-version")
                                            .put("style", JSONObject().put("center", true).put("gap", 5).put("font", 12).put("minHeight", 28).put("padding", JSONArray().put(8).put(2).put(8).put(2)).put("tone", "muted"))
                                            .put(
                                                "children",
                                                JSONArray().put(
                                                    JSONObject()
                                                        .put("id", "content:copy-version")
                                                        .put("kind", "row")
                                                        .put("style", JSONObject().put("center", true).put("gap", 5))
                                                        .put(
                                                            "children",
                                                            JSONArray()
                                                                .put(JSONObject().put("id", "ic-copy").put("kind", "icon").put("icon", "copy").put("style", JSONObject().put("width", 13).put("height", 13)))
                                                                .put(JSONObject().put("id", "txt-copy").put("kind", "text").put("text", "复制版本信息")),
                                                        ),
                                                ),
                                            ),
                                    ),
                            ),
                    ),
            )

        val flowJson = JSONObject()
            .put("key", "settings:help")
            .put("title", "关于与使用说明")
            .put("subtitle", "")
            .put("headerActions", JSONArray()) // ZERO top-right question mark!
            .put(
                "nodes",
                JSONArray()
                    .put(JSONObject().put("id", "check-update").put("kind", "action").put("title", "检查更新").put("action", "check-update"))
                    .put(JSONObject().put("id", "release-history").put("kind", "action").put("title", "版本更新日志").put("action", "release-history"))
                    .put(JSONObject().put("id", "open-licenses").put("kind", "action").put("title", "开源声明").put("action", "open-licenses"))
                    .put(JSONObject().put("id", "copy-version").put("kind", "action").put("title", "复制版本信息").put("action", "copy-version")),
            )
            .put("layout", layoutJson)

        val hostPage = NativePage.parse(
            JSONObject()
                .put("id", "settings")
                .put("session", "about-v1581")
                .put("generation", 1)
                .put("revision", 1)
                .put("enabled", true)
                .put("viewportWidth", 393.0)
                .put("width", 393.0)
                .put("height", 852.0)
                .put("safeTop", 24.0)
                .put("safeBottom", 16.0)
                .put("model", JSONObject().put("key", "settings:help").put("title", "关于与使用说明").put("sections", JSONArray())),
        )
        return TySettingsPage.parse(flowJson) to hostPage
    }

    @Test
    fun libraryCollapsedGroupsEliminateDuplicatePillsAndBlankSpaceAcrossAllThemesAndModes() {
        var palette by mutableStateOf(InterfacePalette(true, "glacier"))
        var page by mutableStateOf(buildLibraryPage(layoutMode = "rows", resourceUnit = "个歌单"))

        compose.setContent {
            CompositionLocalProvider(LocalInterfacePalette provides palette, LocalLiquidReduced provides true) {
                Box(Modifier.width(393.dp).height(852.dp).background(palette.surface)) {
                    NativeDirectoryPage(page = page, modifier = Modifier.width(393.dp).height(852.dp)) { _, _, _ -> }
                }
            }
        }

        for (style in listOf("glacier", "classic")) {
            for (light in listOf(true, false)) {
                compose.runOnIdle {
                    palette = InterfacePalette(light, style)
                    page = buildLibraryPage(layoutMode = "rows", resourceUnit = "个歌单")
                }
                compose.waitForIdle()

                // 1. Exactly ONE "34个歌单" (only in QQ 音乐 header right side — NO duplicate capsule below!)
                assertEquals(1, compose.onAllNodesWithText("34个歌单").fetchSemanticsNodes().size)
                assertEquals(1, compose.onAllNodesWithText("8个歌单").fetchSemanticsNodes().size)

                // 2. Verify consecutive collapsed groups have compact spacing (no empty container gap!)
                val qqBounds = compose.onNodeWithText("QQ 音乐").fetchSemanticsNode().boundsInRoot
                val qishuiBounds = compose.onNodeWithText("汽水音乐").fetchSemanticsNode().boundsInRoot
                val neteaseBounds = compose.onNodeWithText("网易云音乐").fetchSemanticsNode().boundsInRoot
                assertTrue(
                    "Collapsed QQ Music must directly precede Qishui without leftover pill gap (qq=$qqBounds, qishui=$qishuiBounds)",
                    qishuiBounds.top - qqBounds.bottom <= 40f,
                )
                assertTrue(
                    "Collapsed Qishui must directly precede NetEase without leftover pill gap (qishui=$qishuiBounds, netease=$neteaseBounds)",
                    neteaseBounds.top - qishuiBounds.bottom <= 40f,
                )

                saveScreenshot("v1581-library-collapsed-$style-${if (light) "light" else "dark"}")
            }
        }

        // 3. Also verify Grid mode ("cards") + Collected Albums ("张专辑")
        compose.runOnIdle {
            palette = InterfacePalette(true, "glacier")
            page = buildLibraryPage(layoutMode = "cards", resourceUnit = "张专辑")
        }
        compose.waitForIdle()
        assertEquals(1, compose.onAllNodesWithText("34张专辑").fetchSemanticsNodes().size)
        assertEquals(1, compose.onAllNodesWithText("8张专辑").fetchSemanticsNodes().size)
    }

    @Test
    fun aboutPageRemovesDuplicateQuestionMarkAndCentersBrandSignatureAcrossAllFourThemes() {
        val (flow, hostPage) = buildAboutFlowPage()
        var palette by mutableStateOf(InterfacePalette(true, "glacier"))

        compose.setContent {
            CompositionLocalProvider(LocalInterfacePalette provides palette, LocalLiquidReduced provides true) {
                Box(Modifier.width(393.dp).height(852.dp).background(palette.sheet)) {
                    SettingsFlowPage(
                        flow = flow,
                        page = hostPage,
                        modifier = Modifier.width(393.dp).height(852.dp),
                    ) { _, _, _ -> }
                }
            }
        }

        val viewportCenterX = 393f / 2f
        for (style in listOf("glacier", "classic")) {
            for (light in listOf(true, false)) {
                compose.runOnIdle {
                    palette = InterfacePalette(light, style)
                }
                compose.waitForIdle()

                // 1. Left back button & title preserved; top-right duplicate license/help button removed
                compose.onNodeWithContentDescription("返回").assertIsDisplayed()
                compose.onNodeWithText("关于与使用说明").assertIsDisplayed()
                assertEquals(0, compose.onAllNodesWithContentDescription("第三方开源许可证").fetchSemanticsNodes().size)
                compose.onNodeWithText("开源声明").assertIsDisplayed()

                // 2. All 4 brand-signature lines displayed and strictly horizontally centered
                for (label in listOf("听屿 · Tingyu", "Version 1.5.81", "Build 297 · fcf3b0eb", "复制版本信息")) {
                    val bounds = compose.onNodeWithText(label).assertIsDisplayed().fetchSemanticsNode().boundsInRoot
                    val nodeCenterX = (bounds.left + bounds.right) / 2f
                    assertTrue(
                        "'$label' must be horizontally centered in $style-$light (center=$nodeCenterX vs $viewportCenterX, bounds=$bounds)",
                        abs(nodeCenterX - viewportCenterX) <= 3f,
                    )
                }
            }
        }
    }

    @Test
    fun captureAboutPageFourThemeScreenshotsWithoutRenderScript() {
        val (flow, _) = buildAboutFlowPage()
        var palette by mutableStateOf(InterfacePalette(true, "glacier"))

        compose.setContent {
            CompositionLocalProvider(
                LocalInterfacePalette provides palette,
                LocalSettingsPreviewViewport provides Rect(0f, 0f, 393f, 852f),
            ) {
                val theme = settingsFlowTheme()
                Box(Modifier.width(393.dp).height(852.dp).background(palette.sheet)) {
                    TySettingsPageView(
                        page = flow,
                        theme = theme,
                        modifier = Modifier.fillMaxSize(),
                        contentTop = 104.dp,
                        bottomPadding = 40.dp,
                        onAction = { _, _, _ -> },
                    )
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(start = 22.dp, end = 22.dp, top = 48.dp, bottom = 20.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
                            PageIcon("chevron-left", topGlassForegroundColor(theme.text, palette.topInk), Modifier.size(24.dp))
                        }
                        Text(
                            text = flow.title,
                            color = topGlassForegroundColor(theme.text, palette.topInk),
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(start = 10.dp).weight(1f),
                        )
                    }
                }
            }
        }

        for (style in listOf("glacier", "classic")) {
            for (light in listOf(true, false)) {
                compose.runOnIdle {
                    palette = InterfacePalette(light, style)
                }
                compose.waitForIdle()
                saveScreenshot("v1581-about-$style-${if (light) "light" else "dark"}")
            }
        }
    }
}
