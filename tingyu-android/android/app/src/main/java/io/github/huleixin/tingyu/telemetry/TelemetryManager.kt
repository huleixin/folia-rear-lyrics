package io.github.huleixin.tingyu.telemetry

import android.content.Context
import android.os.Build
import android.os.SystemClock
import io.github.huleixin.tingyu.BuildConfig
import io.github.huleixin.tingyu.update.UpdateManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID

// android/app/src/main/java/io/github/huleixin/tingyu/telemetry/TelemetryManager.kt
// 听屿轻量化匿名使用统计模块：
// 1. 新安装及首次升级至支持统计功能且未手动关闭过的用户默认开启（enabled = true）；
//    用户在设置页主动关闭后立即取消心跳协程并停止一切上报，持久化保存选择，后续版本升级绝不重新开启。
// 2. 持久化随机匿名安装编号（UUIDv4），正常覆盖升级保持不变；严禁采集手机号、IMEI、OAID、音乐账号、Cookie、歌单或播放曲目。
// 3. 低功耗调度：冷启动延迟非阻塞上报一次；仅在前台使用或后台正在播放音乐时每 15 分钟（或按服务端降频周期）上报一次；
//    退入后台且未播放音乐时自动停止循环，网络失败静默丢弃不重试，绝不创建任何额外常驻服务。

class TelemetryManager internal constructor(
    private val appContext: Context,
    private val currentVersionName: String = BuildConfig.VERSION_NAME,
    private val currentVersionCode: Int = BuildConfig.VERSION_CODE,
    private val transport: ((String, JSONObject) -> JSONObject?)? = null,
) {
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Volatile
    private var isForeground: Boolean = false

    @Volatile
    private var isPlaying: Boolean = false

    @Volatile
    private var lastSentElapsedMs: Long = 0L

    @Volatile
    private var dynamicIntervalMs: Long = DEFAULT_HEARTBEAT_INTERVAL_MS

    private var coldStartScheduled = false
    private var loopJob: Job? = null

    /** 获取或首次生成持久化匿名安装 ID（覆盖升级保持不变）。 */
    @Synchronized
    fun getOrCreateInstallId(): String {
        val existing = prefs.getString(KEY_INSTALL_ID, null)
        if (!existing.isNullOrBlank() && UUID_V4_REGEX.matches(existing)) {
            return existing
        }
        val generated = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_INSTALL_ID, generated).apply()
        return generated
    }

    /**
     * 匿名使用统计开关状态：
     * - 若用户曾主动操作过开关（含 v1.5.82 已写入 KEY_ENABLED 的升级用户或写入 KEY_USER_CONFIGURED 的用户），严格以用户持久化选择为准，绝不重新开启；
     * - 新安装及从未手动操作过开关的首次升级用户，默认开启（true）。
     */
    fun isEnabled(): Boolean {
        if (prefs.contains(KEY_USER_CONFIGURED) || prefs.contains(KEY_ENABLED)) {
            return prefs.getBoolean(KEY_ENABLED, false)
        }
        return true
    }

    fun isUserConfigured(): Boolean = prefs.contains(KEY_USER_CONFIGURED) || prefs.contains(KEY_ENABLED)

    @Synchronized
    fun setEnabled(enabled: Boolean) {
        // 确保安装 ID 已持久化保存（开关切换不重置匿名 ID，避免重复计为新增设备）
        getOrCreateInstallId()
        prefs.edit()
            .putBoolean(KEY_ENABLED, enabled)
            .putBoolean(KEY_USER_CONFIGURED, true)
            .apply()
        if (!enabled) {
            loopJob?.cancel()
            loopJob = null
            return
        }
        syncLoopState(triggerImmediateIfEligible = true)
    }

    fun onAppColdStart() {
        if (coldStartScheduled) return
        coldStartScheduled = true
        // 预先记录本机已安装版本链：即使当前未开启统计，也维护本地版本号以便后续升级对比
        ensureBaselineVersionTracked()
        if (!isEnabled()) return
        scope.launch {
            delay(COLD_START_DELAY_MS)
            if (isEnabled()) {
                sendHeartbeatInternal(forceForVersionChange = true)
                syncLoopState(triggerImmediateIfEligible = false)
            }
        }
    }

    fun onForegroundChanged(foreground: Boolean) {
        val changed = isForeground != foreground
        isForeground = foreground
        if (!isEnabled()) {
            loopJob?.cancel()
            loopJob = null
            return
        }
        syncLoopState(triggerImmediateIfEligible = changed && foreground)
    }

    fun onPlaybackChanged(playing: Boolean) {
        val changed = isPlaying != playing
        isPlaying = playing
        if (!isEnabled()) {
            loopJob?.cancel()
            loopJob = null
            return
        }
        syncLoopState(triggerImmediateIfEligible = changed && playing && !isForeground)
    }

    @Synchronized
    private fun syncLoopState(triggerImmediateIfEligible: Boolean) {
        if (!isEnabled() || (!isForeground && !isPlaying)) {
            loopJob?.cancel()
            loopJob = null
            return
        }
        if (triggerImmediateIfEligible) {
            scope.launch {
                sendHeartbeatInternal(forceForVersionChange = false)
            }
        }
        if (loopJob?.isActive == true) return
        loopJob = scope.launch {
            while (isActive && isEnabled() && (isForeground || isPlaying)) {
                delay(dynamicIntervalMs)
                if (isEnabled() && (isForeground || isPlaying)) {
                    sendHeartbeatInternal(forceForVersionChange = false)
                }
            }
        }
    }

    private fun ensureBaselineVersionTracked() {
        val tracked = prefs.getInt(KEY_LAST_SEEN_LOCAL_VC, 0)
        if (tracked <= 0) {
            prefs.edit().putInt(KEY_LAST_SEEN_LOCAL_VC, currentVersionCode).apply()
        } else if (tracked < currentVersionCode && prefs.getInt(KEY_PENDING_UPGRADE_FROM_VC, 0) <= 0) {
            // 检测到覆盖安装升级：保存升级前版本号，待新版实际冷启动上报心跳时确认覆盖升级成功
            prefs.edit()
                .putInt(KEY_PENDING_UPGRADE_FROM_VC, tracked)
                .putInt(KEY_LAST_SEEN_LOCAL_VC, currentVersionCode)
                .apply()
        }
    }

    internal fun buildHeartbeatPayload(): JSONObject {
        ensureBaselineVersionTracked()
        val lastReportedVc = prefs.getInt(KEY_LAST_REPORTED_VC, 0)
        val pendingFromVc = prefs.getInt(KEY_PENDING_UPGRADE_FROM_VC, 0)
        val upgradeFrom = when {
            lastReportedVc in 1 until currentVersionCode -> lastReportedVc
            pendingFromVc in 1 until currentVersionCode -> pendingFromVc
            else -> 0
        }
        val channel = when (runCatching { UpdateManager.getInstance(appContext).activeChannel }.getOrDefault("stable")) {
            "private_beta" -> "private_beta"
            "testing" -> "testing"
            else -> "stable"
        }
        return JSONObject().apply {
            put("installId", getOrCreateInstallId())
            put("versionName", currentVersionName)
            put("versionCode", currentVersionCode)
            put("channel", channel)
            put("androidVersion", Build.VERSION.RELEASE ?: "")
            put("deviceModel", Build.MODEL ?: "")
            put("isForeground", isForeground)
            put("isPlaying", isPlaying)
            if (upgradeFrom > 0) {
                put("previousVersionCode", upgradeFrom)
            }
        }
    }

    internal fun sendHeartbeatNowForTest(): Boolean = sendHeartbeatInternal(forceForVersionChange = true)

    private fun sendHeartbeatInternal(forceForVersionChange: Boolean): Boolean {
        if (!isEnabled()) return false
        val nowElapsed = SystemClock.elapsedRealtime()
        val lastReportedVc = prefs.getInt(KEY_LAST_REPORTED_VC, 0)
        val versionChanged = lastReportedVc != currentVersionCode
        if (!forceForVersionChange && !versionChanged && lastSentElapsedMs > 0L && nowElapsed - lastSentElapsedMs < MIN_HEARTBEAT_GAP_MS) {
            return false
        }

        val payload = buildHeartbeatPayload()
        lastSentElapsedMs = nowElapsed
        val response = postJsonSafely(HEARTBEAT_URL, payload) ?: return false

        val nextSec = response.optLong("nextIntervalSec", 0L)
        if (nextSec in 300L..7200L) {
            dynamicIntervalMs = nextSec * 1_000L
        }
        if (response.optBoolean("ok", false)) {
            prefs.edit()
                .putInt(KEY_LAST_REPORTED_VC, currentVersionCode)
                .putInt(KEY_LAST_SEEN_LOCAL_VC, currentVersionCode)
                .putInt(KEY_PENDING_UPGRADE_FROM_VC, 0)
                .apply()
            return true
        }
        return false
    }

    /**
     * 上报软件内更新下载/校验匿名事件（仅当用户开启「匿名使用统计」时生效；失败绝不影响更新流程）。
     */
    fun reportUpdateEvent(
        event: String,
        targetVersionCode: Long,
        targetVersionName: String,
        channel: String,
        mirrorId: String,
    ) {
        if (!isEnabled()) return
        if (event !in ALLOWED_UPDATE_EVENTS) return
        val payload = JSONObject().apply {
            put("installId", getOrCreateInstallId())
            put("event", event)
            put("targetVersionCode", targetVersionCode)
            put("targetVersionName", targetVersionName)
            put("channel", when (channel) {
                "private_beta" -> "private_beta"
                "testing" -> "testing"
                else -> "stable"
            })
            put("mirrorId", mirrorId.ifBlank { "unknown" })
        }
        if (transport != null) {
            runCatching { transport?.invoke(UPDATE_EVENT_URL, payload) }
            return
        }
        scope.launch {
            postJsonSafely(UPDATE_EVENT_URL, payload)
        }
    }

    private fun postJsonSafely(url: String, payload: JSONObject): JSONObject? {
        if (transport != null) {
            return runCatching { transport?.invoke(url, payload) }.getOrNull()
        }
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = HTTP_TIMEOUT_MS
                readTimeout = HTTP_TIMEOUT_MS
                doInput = true
                doOutput = true
                useCaches = false
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("User-Agent", "Tingyu-Android/${BuildConfig.VERSION_NAME}")
            }
            val bytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
            conn.setFixedLengthStreamingMode(bytes.size)
            conn.outputStream.use { it.write(bytes) }
            val code = conn.responseCode
            if (code in 200..299) {
                val txt = conn.inputStream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
                JSONObject(txt)
            } else {
                null
            }
        } catch (_: Throwable) {
            // 网络异常不重试、不打日志刷屏、不影响任何功能
            null
        } finally {
            runCatching { conn?.disconnect() }
        }
    }

    fun toBridgeJson(): JSONObject = JSONObject().apply {
        put("enabled", isEnabled())
        put("userConfigured", isUserConfigured())
        put("intervalSec", (dynamicIntervalMs / 1000L).toInt())
    }

    companion object {
        internal const val PREFS_NAME = "tingyu_telemetry_prefs"
        internal const val KEY_INSTALL_ID = "install_id"
        internal const val KEY_ENABLED = "telemetry_enabled"
        internal const val KEY_USER_CONFIGURED = "telemetry_user_configured"
        internal const val KEY_LAST_REPORTED_VC = "last_reported_version_code"
        internal const val KEY_LAST_SEEN_LOCAL_VC = "last_seen_local_version_code"
        internal const val KEY_PENDING_UPGRADE_FROM_VC = "pending_upgrade_from_version_code"

        private const val HEARTBEAT_URL = "https://feedback.20262000.xyz/api/public/telemetry/heartbeat"
        private const val UPDATE_EVENT_URL = "https://feedback.20262000.xyz/api/public/telemetry/update-event"

        private const val COLD_START_DELAY_MS = 3_500L
        private const val DEFAULT_HEARTBEAT_INTERVAL_MS = 15 * 60_000L // 15 分钟
        private const val MIN_HEARTBEAT_GAP_MS = 90_000L // 生命周期切换去重间隔 90 秒
        private const val HTTP_TIMEOUT_MS = 6_000

        private val UUID_V4_REGEX = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
        private val ALLOWED_UPDATE_EVENTS = setOf("download_started", "download_succeeded", "download_failed", "verify_failed")

        @Volatile
        private var instance: TelemetryManager? = null

        @JvmStatic
        fun getInstance(context: Context): TelemetryManager {
            return instance ?: synchronized(this) {
                instance ?: TelemetryManager(context.applicationContext).also { instance = it }
            }
        }
    }
}
