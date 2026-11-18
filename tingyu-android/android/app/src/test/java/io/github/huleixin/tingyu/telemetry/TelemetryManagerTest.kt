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
    fun `telemetry defaults strictly to disabled and sends zero requests when off`() {
        val sent = mutableListOf<Pair<String, JSONObject>>()
        val manager = TelemetryManager(
            appContext = context,
            currentVersionName = "1.5.82",
            currentVersionCode = 298,
            transport = { url, body ->
                sent.add(url to body)
                JSONObject().put("ok", true)
            },
        )

        assertFalse(manager.isEnabled())
        assertFalse(manager.sendHeartbeatNowForTest())
        manager.reportUpdateEvent("download_started", 298, "1.5.82", "stable", "cnb-primary")
        assertEquals(0, sent.size)
    }

    @Test
    fun `persists anonymous UUIDv4 across overwrite upgrade and confirms boot upgrade with strict field whitelist`() {
        val sent = mutableListOf<Pair<String, JSONObject>>()

        // 1. 模拟旧版 1.5.81 (297) 用户主动开启匿名统计并上报一次
        val oldVerManager = TelemetryManager(
            appContext = context,
            currentVersionName = "1.5.81",
            currentVersionCode = 297,
            transport = { url, body ->
                sent.add(url to body)
                JSONObject().put("ok", true).put("nextIntervalSec", 600)
            },
        )
        val firstInstallId = oldVerManager.getOrCreateInstallId()
        assertTrue(firstInstallId.matches(Regex("^[0-9a-f-]{36}$", RegexOption.IGNORE_CASE)))

        oldVerManager.setEnabled(true)
        oldVerManager.onForegroundChanged(true)
        oldVerManager.sendHeartbeatNowForTest()
        assertTrue(sent.isNotEmpty())
        val firstPayload = sent.last().second
        assertEquals(firstInstallId, firstPayload.getString("installId"))
        assertEquals(297, firstPayload.getInt("versionCode"))
        assertFalse(firstPayload.has("previousVersionCode"))

        // 校验严格白名单：不含手机号、IMEI、账号、Cookie、歌单或播放曲目
        val allowedKeys = setOf(
            "installId", "versionName", "versionCode", "channel",
            "androidVersion", "deviceModel", "isForeground", "isPlaying", "previousVersionCode",
        )
        val actualKeys = mutableSetOf<String>()
        firstPayload.keys().forEach { actualKeys.add(it) }
        assertTrue(allowedKeys.containsAll(actualKeys))

        // 2. 模拟覆盖升级到 1.5.82 (298) 后冷启动：同一安装 ID 保持不变，且携带 previousVersionCode=297 确认覆盖升级成功
        sent.clear()
        val upgradedManager = TelemetryManager(
            appContext = context,
            currentVersionName = "1.5.82",
            currentVersionCode = 298,
            transport = { url, body ->
                sent.add(url to body)
                JSONObject().put("ok", true)
            },
        )
        assertEquals(firstInstallId, upgradedManager.getOrCreateInstallId())
        assertTrue(upgradedManager.isEnabled())
        assertTrue(upgradedManager.sendHeartbeatNowForTest())

        val upgradePayload = sent.single().second
        assertEquals(firstInstallId, upgradePayload.getString("installId"))
        assertEquals(298, upgradePayload.getInt("versionCode"))
        assertEquals(297, upgradePayload.getInt("previousVersionCode"))

        // 3. 关闭开关后立即停止后续上报，且匿名 ID 不被重置
        sent.clear()
        upgradedManager.setEnabled(false)
        assertFalse(upgradedManager.sendHeartbeatNowForTest())
        upgradedManager.reportUpdateEvent("download_succeeded", 299, "1.5.83", "stable", "cnb-primary")
        assertEquals(0, sent.size)
        assertEquals(firstInstallId, upgradedManager.getOrCreateInstallId())
        assertNotNull(upgradedManager.toBridgeJson())
    }
}
