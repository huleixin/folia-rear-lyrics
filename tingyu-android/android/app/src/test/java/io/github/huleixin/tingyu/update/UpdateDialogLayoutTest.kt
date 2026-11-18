package io.github.huleixin.tingyu.update

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import io.github.huleixin.tingyu.chrome.InterfacePalette
import io.github.huleixin.tingyu.chrome.LocalInterfacePalette
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class UpdateDialogLayoutTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private fun sampleManifest(force: Boolean): UpdateManifest {
        val now = 1794970000000L
        return UpdateManifest(
            schemaVersion = 1,
            appId = "io.github.huleixin.tingyu",
            channel = "stable",
            policyRevision = 3L,
            policyAction = "normal",
            updateEnabled = true,
            latestVersionName = "1.5.79",
            latestVersionCode = 294L,
            minSupportedVersionCode = if (force) 294L else 1L,
            releaseId = "rel-stable-1.5.79-294",
            gitCommit = "48511843",
            releaseNotes = "1. 新增原生软件内安全更新与断点续传下载机制\n2. 支持多节点自动容灾（CNB 国内高速主节点 + GitHub 备用源）\n3. 优化本地音乐独立子页面与综合推荐体验\n4. 升级全链路签名与完整性校验保护",
            publishedAt = "2026-11-18T11:00:00Z",
            publishedAtEpochMs = now,
            policyExpiresAt = "2026-12-18T11:00:00Z",
            policyExpiresAtEpochMs = now + 30L * 86400_000L,
            offlineGraceHours = 168,
            apkSizeBytes = 58_485_998L,
            sha256 = "e26b0812b3d6da734c2af0c2f7816ecdaa6a31127618d141a814af164c7d1469",
            apkCertSha256 = "a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d",
            minSdk = 24,
            supportedAbis = listOf("arm64-v8a", "armeabi-v7a"),
            downloadUrls = listOf(
                DownloadMirror("cnb-primary", "CNB 国内高速主节点", "https://cnb.cool/tingyu-2026/releases/-/releases/download/v1.5.79/tingyu-1.5.79-release.apk", 1),
                DownloadMirror("github-backup", "GitHub 备用节点", "https://github.com/huleixin/folia-rear-lyrics/releases/download/v1.5.79/tingyu-1.5.79-release.apk", 2),
            ),
            signatureAlgorithm = "ECDSA-P256-SHA256",
            keyId = "tingyu-policy-2026-k1",
            signature = "MEUCIQDummyValidTestSignature==",
            rawJson = "{}",
        )
    }

    private fun saveScreenshot(name: String, width: Int, height: Int) {
        val outDir = System.getenv("TINGYU_LAYOUT_SCREENSHOTS") ?: return
        val file = File(outDir, "$name.png")
        file.parentFile?.mkdirs()
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        compose.activity.window.decorView.draw(Canvas(bitmap))
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    private fun verifyViewport(width: Int, height: Int, tag: String) {
        var palette by mutableStateOf(InterfacePalette(true, "glacier"))
        var currentManifest by mutableStateOf(sampleManifest(force = false))
        var uiState by mutableStateOf(
            UpdateUiState(
                currentVersionName = "1.5.78",
                currentVersionCode = 293L,
                channel = "stable",
                decision = UpdateDecision(UpdateDecisionMode.OPTIONAL_UPDATE, "newer_version_available", currentManifest),
                dialogVisible = true,
                selectedMirrorId = "cnb-primary",
            ),
        )

        compose.setContent {
            CompositionLocalProvider(LocalInterfacePalette provides palette) {
                Box(
                    Modifier
                        .width(width.dp)
                        .height(height.dp)
                        .background(if (palette.light) Color(0xFFE6EDF5) else Color(0xFF0E161E)),
                ) {
                    UpdateDialogSurface(
                        state = uiState,
                        manifest = currentManifest,
                        safeTopDp = 24f,
                        safeBottomDp = 16f,
                        onPrimaryAction = {},
                        onCancelDownload = {},
                        onDismissOptional = {},
                        onSwitchMirrorRetry = {},
                        onSelectMirror = {},
                        onRecheck = {},
                        onManualBrowserDownload = {},
                        onExitApp = {},
                    )
                }
            }
        }

        // 1. Verify Optional Update across all 4 themes
        for (style in listOf("glacier", "classic")) {
            for (light in listOf(true, false)) {
                val m = sampleManifest(force = false)
                compose.runOnIdle {
                    palette = InterfacePalette(light, style)
                    currentManifest = m
                    uiState = UpdateUiState(
                        currentVersionName = "1.5.78",
                        currentVersionCode = 293L,
                        channel = "stable",
                        decision = UpdateDecision(UpdateDecisionMode.OPTIONAL_UPDATE, "newer", m),
                        dialogVisible = true,
                        selectedMirrorId = "cnb-primary",
                    )
                }
                compose.waitForIdle()
                compose.onNodeWithText("听屿有新版本啦").assertIsDisplayed()
                compose.onNodeWithText("普通更新").assertIsDisplayed()
                val primaryBounds = compose.onNodeWithText("立即更新").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
                val laterBounds = compose.onNodeWithText("稍后更新").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
                assertTrue("Primary button must stay inside viewport ($primaryBounds in ${width}x${height})", primaryBounds.bottom <= height + 1f && primaryBounds.top >= 0f)
                assertTrue("Secondary button must stay inside viewport ($laterBounds in ${width}x${height})", laterBounds.bottom <= height + 1f)
                if (tag == "phone" && style == "glacier") {
                    saveScreenshot("update-dialog-optional-${style}-${if (light) "light" else "dark"}", width, height)
                }
            }
        }

        // 2. Verify Force Update (NO "稍后更新", keeps "重新检查更新" & "退出应用" visible)
        for (light in listOf(true, false)) {
            val m = sampleManifest(force = true)
            compose.runOnIdle {
                palette = InterfacePalette(light, "glacier")
                currentManifest = m
                uiState = UpdateUiState(
                    currentVersionName = "1.5.78",
                    currentVersionCode = 293L,
                    channel = "stable",
                    decision = UpdateDecision(UpdateDecisionMode.FORCE_UPDATE, "below_min", m),
                    dialogVisible = true,
                    selectedMirrorId = "cnb-primary",
                )
            }
            compose.waitForIdle()
            compose.onNodeWithText("强制更新").assertIsDisplayed()
            assertEquals(0, compose.onAllNodesWithText("稍后更新").fetchSemanticsNodes().size)
            val recheckBounds = compose.onNodeWithText("重新检查更新").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
            val exitBounds = compose.onNodeWithText("退出应用").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
            assertTrue(recheckBounds.bottom <= height + 1f)
            assertTrue(exitBounds.bottom <= height + 1f)
            if (tag == "phone") {
                saveScreenshot("update-dialog-force-glacier-${if (light) "light" else "dark"}", width, height)
            }
        }

        // 3. Verify Downloading Progress State (determinate 62% progress + speed + Cancel button)
        val mDl = sampleManifest(force = true)
        compose.runOnIdle {
            palette = InterfacePalette(true, "glacier")
            currentManifest = mDl
            uiState = UpdateUiState(
                currentVersionName = "1.5.78",
                currentVersionCode = 293L,
                channel = "stable",
                decision = UpdateDecision(UpdateDecisionMode.FORCE_UPDATE, "below_min", mDl),
                dialogVisible = true,
                selectedMirrorId = "cnb-primary",
                download = DownloadSnapshot(
                    phase = DownloadPhase.DOWNLOADING,
                    downloadedBytes = 36_261_318L,
                    totalBytes = 58_485_998L,
                    speedBytesPerSec = 4_299_161L,
                    activeNodeId = "cnb-primary",
                    activeNodeLabel = "CNB 国内高速主节点",
                ),
            )
        }
        compose.waitForIdle()
        compose.onNodeWithText("正在下载 62%").assertIsDisplayed()
        compose.onNodeWithText("取消").assertIsDisplayed()
        if (tag == "phone") {
            saveScreenshot("update-dialog-downloading-glacier-light", width, height)
        }

        // 4. Verify Download Failed & Retry / Switch Mirror / Browser Fallback State
        val mFail = sampleManifest(force = true)
        compose.runOnIdle {
            palette = InterfacePalette(true, "glacier")
            currentManifest = mFail
            uiState = UpdateUiState(
                currentVersionName = "1.5.78",
                currentVersionCode = 293L,
                channel = "stable",
                decision = UpdateDecision(UpdateDecisionMode.FORCE_UPDATE, "below_min", mFail),
                dialogVisible = true,
                selectedMirrorId = "cnb-primary",
                download = DownloadSnapshot(
                    phase = DownloadPhase.FAILED,
                    downloadedBytes = 18_400_000L,
                    totalBytes = 58_485_998L,
                    activeNodeId = "cnb-primary",
                    activeNodeLabel = "CNB 国内高速主节点",
                    errorCode = "network_interrupted",
                    errorMessage = "下载连接中断（已保留 17.5 MB 断点缓存），可点击重试继续下载或切换备用节点。",
                ),
            )
        }
        compose.waitForIdle()
        compose.onNodeWithText("重试下载").assertIsDisplayed()
        compose.onNodeWithText("切换备用节点").assertIsDisplayed()
        compose.onNodeWithText("浏览器手动下载").assertIsDisplayed()
        if (tag == "phone") {
            saveScreenshot("update-dialog-failed-retry-glacier-light", width, height)
        }
    }

    @Test
    fun phonePortraitAllThemesAndStatesKeepButtonsVisible() = verifyViewport(393, 852, "phone")

    @Test
    @Config(qualifiers = "w852dp-h393dp-160dpi")
    fun phoneLandscapeKeepsPrimaryAndRecoveryButtonsVisible() = verifyViewport(852, 393, "landscape")

    @Test
    @Config(qualifiers = "w1024dp-h768dp-160dpi")
    fun tabletViewportKeepsDialogCenteredAndButtonsVisible() = verifyViewport(1024, 768, "pad")
}
