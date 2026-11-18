package io.github.huleixin.tingyu.telemetry

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TelemetryManagerTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences(TelemetryManager.PREFS_NAME, Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun `fresh install and unconfigured upgrade default to enabled while preserving strict privacy whitelist`() {
        val sent = mutableListOf<Pair<String, JSONObject>>()
        val manager = TelemetryManager(
            appContext = context,
            currentVersionName = "1.5.83",
            currentVersionCode = 299,
            transport = { url, body ->
                sent.add(url to body)
                JSONObject().put("ok", true).put("nextIntervalSec", 900)
            },
        )

        assertTrue(manager.isEnabled())
        assertFalse(manager.isUserConfigured())
        assertTrue(manager.sendHeartbeatNowForTest())
        assertEquals(1, sent.size)

        val payload = sent.single().second
        val allowedKeys = setOf(
            "installId", "versionName", "versionCode", "channel",
            "androidVersion", "deviceModel", "isForeground", "isPlaying", "previousVersionCode",
        )
        val actualKeys = mutableSetOf<String>()
        payload.keys().forEach { actualKeys.add(it) }
        assertTrue(allowedKeys.containsAll(actualKeys))
    }

    @Test
    fun `user explicit opt-out stops reporting immediately and is never re-enabled across future upgrades`() {
        val sent = mutableListOf<Pair<String, JSONObject>>()

        // 1. 用户在 v1.5.82 (298) 主动关闭了匿名使用统计
        val v298Manager = TelemetryManager(
            appContext = context,
            currentVersionName = "1.5.82",
            currentVersionCode = 298,
            transport = { url, body ->
                sent.add(url to body)
                JSONObject().put("ok", true)
            },
        )
        val installId = v298Manager.getOrCreateInstallId()
        v298Manager.setEnabled(false)
        assertFalse(v298Manager.isEnabled())
        assertTrue(v298Manager.isUserConfigured())
        assertFalse(v298Manager.sendHeartbeatNowForTest())
        v298Manager.reportUpdateEvent("download_started", 299, "1.5.83", "stable", "cnb-primary")
        assertEquals(0, sent.size)

        // 2. 覆盖安装升级到默认开启的 v1.5.83 (299)：此前主动关闭的用户绝不得被重新开启！
        val v299Manager = TelemetryManager(
            appContext = context,
            currentVersionName = "1.5.83",
            currentVersionCode = 299,
            transport = { url, body ->
                sent.add(url to body)
                JSONObject().put("ok", true)
            },
        )
        assertFalse(v299Manager.isEnabled())
        assertTrue(v299Manager.isUserConfigured())
        assertFalse(v299Manager.sendHeartbeatNowForTest())
        v299Manager.reportUpdateEvent("download_succeeded", 299, "1.5.83", "stable", "cnb-primary")
        assertEquals(0, sent.size)
        assertEquals(installId, v299Manager.getOrCreateInstallId())

        // 3. 继续升级到未来版本 v1.5.84 (300)：依然严格保持关闭
        val v300Manager = TelemetryManager(
            appContext = context,
            currentVersionName = "1.5.84",
            currentVersionCode = 300,
            transport = { url, body ->
                sent.add(url to body)
                JSONObject().put("ok", true)
            },
        )
        assertFalse(v300Manager.isEnabled())
        assertFalse(v300Manager.sendHeartbeatNowForTest())
        assertEquals(0, sent.size)
    }

    @Test
    fun `unconfigured v1_5_82 user upgrading to v1_5_83 gets default enabled and confirms boot upgrade`() {
        val sent = mutableListOf<Pair<String, JSONObject>>()

        // 模拟 v1.5.82 用户从未点过开关（仅记录了本机版本号 298，未写入 KEY_ENABLED）
        context.getSharedPreferences(TelemetryManager.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putInt(TelemetryManager.KEY_LAST_SEEN_LOCAL_VC, 298)
            .commit()

        val upgradedManager = TelemetryManager(
            appContext = context,
            currentVersionName = "1.5.83",
            currentVersionCode = 299,
            transport = { url, body ->
                sent.add(url to body)
                JSONObject().put("ok", true)
            },
        )
        assertTrue(upgradedManager.isEnabled())
        assertTrue(upgradedManager.sendHeartbeatNowForTest())
        assertEquals(1, sent.size)
        val payload = sent.single().second
        assertEquals(299, payload.getInt("versionCode"))
        assertEquals(298, payload.getInt("previousVersionCode"))

        // 用户随后在设置中主动关闭：立即停止上报
        sent.clear()
        upgradedManager.setEnabled(false)
        assertFalse(upgradedManager.isEnabled())
        assertFalse(upgradedManager.sendHeartbeatNowForTest())
        assertEquals(0, sent.size)
        assertNotNull(upgradedManager.toBridgeJson())
    }
}
