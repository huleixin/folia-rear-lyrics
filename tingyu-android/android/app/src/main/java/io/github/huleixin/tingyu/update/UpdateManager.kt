package io.github.huleixin.tingyu.update

import android.app.Activity
import android.content.Context
import io.github.huleixin.tingyu.BuildConfig
import io.github.huleixin.tingyu.CrashDiagnostics
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

// android/app/src/main/java/io/github/huleixin/tingyu/update/UpdateManager.kt
// 更新生命周期总控：冷启动恢复、后台非阻塞检查、回前台与低频轮询、手动限流检查、下载校验与系统安装衔接。

class UpdateManager private constructor(private val appContext: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val store = UpdateStateStore(appContext)
    private val api = UpdateApi()
    private val downloader = UpdateDownloader(appContext)

    private var checkJob: Job? = null
    private var downloadJob: Job? = null
    private var periodicJob: Job? = null
    private var coldStartScheduled = false

    val currentVersionName: String = BuildConfig.VERSION_NAME
    val currentVersionCode: Long = BuildConfig.VERSION_CODE.toLong()

    /**
     * 正式 Release 客户端严格锁定 `stable` 渠道，禁止在正式包启用任何 Mock 服务；
     * 仅 Debug 构建或显式测试渠道包允许通过本地联调开关切换 `testing` 渠道。
     */
    val activeChannel: String
        get() {
            if (!BuildConfig.DEBUG && !BuildConfig.VERSION_NAME.contains("test")) {
                return "stable"
            }
            val debugChannel = appContext
                .getSharedPreferences("tingyu_debug_update_prefs", Context.MODE_PRIVATE)
                .getString("channel", null)
            return if (debugChannel == "testing") "testing" else "stable"
        }

    private val _state = MutableStateFlow(
        UpdateUiState(
            currentVersionName = currentVersionName,
            currentVersionCode = currentVersionCode,
            channel = activeChannel,
        )
    )
    val state: StateFlow<UpdateUiState> = _state.asStateFlow()

    init {
        hydrateFromPersistedPolicy()
    }

    private fun hydrateFromPersistedPolicy() {
        val now = System.currentTimeMillis()
        // 清理已覆盖安装完毕的旧版本残留 APK
        val readyRecord = store.loadVerifiedApkRecord()
        if (readyRecord != null && readyRecord.versionCode <= currentVersionCode) {
            store.clearVerifiedApkRecord()
            downloader.cleanObsoleteFiles()
        }

        val persisted = store.loadVerifiedPolicy(activeChannel)
        if (persisted != null) {
            val decision = UpdatePolicy.evaluateDecision(
                currentVersionCode = currentVersionCode,
                manifest = persisted.manifest,
                nowMs = now,
                lastVerifiedAtMs = persisted.verifiedAtMs,
            )
            val showDialog = when (decision.mode) {
                UpdateDecisionMode.FORCE_UPDATE -> true
                UpdateDecisionMode.OPTIONAL_UPDATE -> !store.isOptionalUpdateSnoozed(persisted.manifest.latestVersionCode, now)
                UpdateDecisionMode.NONE -> false
            }
            val restoredDownload = restoreReadyApkSnapshot(persisted.manifest)
            _state.update {
                it.copy(
                    channel = activeChannel,
                    decision = decision,
                    dialogVisible = showDialog,
                    selectedMirrorId = persisted.manifest.downloadUrls.firstOrNull()?.id.orEmpty(),
                    download = restoredDownload,
                )
            }
        }
    }

    private fun restoreReadyApkSnapshot(manifest: UpdateManifest): DownloadSnapshot {
        val ready = store.loadVerifiedApkRecord() ?: return DownloadSnapshot()
        if (ready.versionCode != manifest.latestVersionCode || !ready.sha256.equals(manifest.sha256, ignoreCase = true)) {
            return DownloadSnapshot()
        }
        val file = File(ready.filePath)
        if (!file.exists() || file.length() != manifest.apkSizeBytes) {
            store.clearVerifiedApkRecord()
            return DownloadSnapshot()
        }
        return DownloadSnapshot(
            phase = DownloadPhase.READY_TO_INSTALL,
            downloadedBytes = manifest.apkSizeBytes,
            totalBytes = manifest.apkSizeBytes,
            verifiedApkPath = file.absolutePath,
        )
    }

    fun onAppColdStart() {
        if (coldStartScheduled) return
        coldStartScheduled = true
        // 延迟 1.8 秒后台检查，绝不阻塞首帧渲染与播放器恢复
        scope.launch {
            delay(1_800L)
            checkIfDue(reason = "cold-start")
        }
    }

    fun onAppForegroundResume(activity: Activity?) {
        // 若用户刚从“未知来源安装授权”系统设置页返回且已授权，自动衔接启动系统安装器
        val current = _state.value
        if (current.download.phase == DownloadPhase.AWAITING_INSTALL_PERMISSION && ApkInstaller.canRequestPackageInstalls(appContext)) {
            val path = current.download.verifiedApkPath
            if (!path.isNullOrBlank()) {
                _state.update { it.copy(download = it.download.copy(phase = DownloadPhase.READY_TO_INSTALL, errorMessage = null)) }
                launchInstall(activity)
            }
        }

        checkIfDue(reason = "foreground-resume")
        startPeriodicLowFrequencyLoop()
    }

    fun onAppBackgroundPause() {
        periodicJob?.cancel()
        periodicJob = null
    }

    private fun startPeriodicLowFrequencyLoop() {
        if (periodicJob?.isActive == true) return
        periodicJob = scope.launch {
            while (isActive) {
                delay(AUTO_CHECK_INTERVAL_MS)
                checkIfDue(reason = "periodic-30m")
            }
        }
    }

    private fun checkIfDue(reason: String) {
        val now = System.currentTimeMillis()
        val lastAuto = store.getLastAutoCheckAtMs()
        // 强制更新激活期间允许更快拉取（2 分钟间隔），以便管理员紧急解除限制能尽快触达
        val interval = if (_state.value.isForceUpdateActive) 2 * 60_000L else AUTO_CHECK_INTERVAL_MS
        if (now - lastAuto < interval) return
        performCheck(manual = false, reason = reason)
    }

    fun checkNowManual() {
        val now = System.currentTimeMillis()
        if (_state.value.checkPhase == CheckPhase.CHECKING) return
        val lastManual = store.getLastManualCheckAtMs()
        if (now - lastManual < MANUAL_CHECK_COOLDOWN_MS && _state.value.lastCheckedAtMs > 0L) {
            // 限流保护：3.5 秒内重复手点直接展示当前已知真实结果（若有新版本则打开弹窗）
            if (_state.value.decision.mode != UpdateDecisionMode.NONE) {
                _state.update { it.copy(dialogVisible = true) }
            }
            return
        }
        store.setLastManualCheckAtMs(now)
        performCheck(manual = true, reason = "manual-settings")
    }

    private fun performCheck(manual: Boolean, reason: String) {
        if (checkJob?.isActive == true) return
        val channel = activeChannel
        if (!manual) store.setLastAutoCheckAtMs(System.currentTimeMillis())

        _state.update {
            it.copy(
                channel = channel,
                checkPhase = CheckPhase.CHECKING,
                checkMessage = if (manual) "正在检查新版本…" else it.checkMessage,
            )
        }

        checkJob = scope.launch {
            val minRev = store.getHighestPolicyRevision(channel)
            val now = System.currentTimeMillis()
            when (val outcome = api.fetchAuthoritativePolicy(channel = channel, minAcceptedRevision = minRev, nowMs = now)) {
                is UpdateApi.FetchOutcome.Success -> {
                    val manifest = outcome.manifest
                    store.saveVerifiedPolicy(manifest, now)
                    val decision = UpdatePolicy.evaluateDecision(
                        currentVersionCode = currentVersionCode,
                        manifest = manifest,
                        nowMs = now,
                        lastVerifiedAtMs = now,
                    )
                    val shouldOpenDialog = when (decision.mode) {
                        UpdateDecisionMode.FORCE_UPDATE -> true
                        UpdateDecisionMode.OPTIONAL_UPDATE -> manual || !store.isOptionalUpdateSnoozed(manifest.latestVersionCode, now)
                        UpdateDecisionMode.NONE -> false
                    }
                    val phase = if (decision.mode == UpdateDecisionMode.NONE) CheckPhase.UP_TO_DATE else CheckPhase.UPDATE_AVAILABLE
                    val msg = when (decision.mode) {
                        UpdateDecisionMode.NONE -> "当前已是最新版本"
                        UpdateDecisionMode.OPTIONAL_UPDATE -> "发现新版本 v${manifest.latestVersionName}"
                        UpdateDecisionMode.FORCE_UPDATE -> "发现重要必更版本 v${manifest.latestVersionName}"
                    }
                    val readySnap = restoreReadyApkSnapshot(manifest)
                    val currentDownload = _state.value.download
                    val mergedDownload = if (currentDownload.phase == DownloadPhase.DOWNLOADING || currentDownload.phase == DownloadPhase.VERIFYING) {
                        currentDownload
                    } else if (readySnap.phase == DownloadPhase.READY_TO_INSTALL) {
                        readySnap
                    } else {
                        DownloadSnapshot()
                    }
                    _state.update { prev ->
                        prev.copy(
                            checkPhase = phase,
                            checkMessage = msg,
                            lastCheckedAtMs = now,
                            decision = decision,
                            dialogVisible = if (decision.mode == UpdateDecisionMode.NONE) false else (prev.dialogVisible || shouldOpenDialog),
                            selectedMirrorId = prev.selectedMirrorId.takeIf { id -> manifest.downloadUrls.any { it.id == id } }
                                ?: manifest.downloadUrls.firstOrNull()?.id.orEmpty(),
                            download = mergedDownload,
                        )
                    }
                    recordDiagnostic("check-ok", "reason=$reason node=${outcome.selectedNodeId} rev=${manifest.policyRevision} mode=${decision.mode}")
                }
                is UpdateApi.FetchOutcome.Failure -> {
                    // 网络失败或无合法签名配置：绝不误判为强制更新，也绝不在手动检查时谎报“已是最新版本”
                    val cached = store.loadVerifiedPolicy(channel)
                    val fallbackDecision = if (cached != null) {
                        UpdatePolicy.evaluateDecision(currentVersionCode, cached.manifest, now, cached.verifiedAtMs)
                    } else {
                        UpdateDecision(UpdateDecisionMode.NONE, "check_failed")
                    }
                    _state.update { prev ->
                        prev.copy(
                            checkPhase = CheckPhase.CHECK_FAILED,
                            checkMessage = "检查更新失败，请检查网络后重试",
                            lastCheckedAtMs = now,
                            decision = fallbackDecision,
                            dialogVisible = if (fallbackDecision.mode == UpdateDecisionMode.FORCE_UPDATE) true else prev.dialogVisible,
                        )
                    }
                    recordDiagnostic("check-failed", "reason=$reason err=${outcome.reason}")
                }
            }
        }
    }

    fun openDialogIfUpdateAvailable() {
        if (_state.value.decision.mode != UpdateDecisionMode.NONE) {
            _state.update { it.copy(dialogVisible = true) }
        }
    }

    fun dismissOptionalDialog() {
        val snap = _state.value
        if (snap.isForceUpdateActive) return // 强制更新严禁关闭或绕过
        val manifest = snap.decision.manifest
        if (manifest != null) {
            store.snoozeOptionalUpdate(manifest.latestVersionCode, System.currentTimeMillis() + OPTIONAL_SNOOZE_MS)
        }
        _state.update { it.copy(dialogVisible = false) }
    }

    fun selectDownloadMirror(mirrorId: String) {
        _state.update { it.copy(selectedMirrorId = mirrorId) }
    }

    fun startOrResumeDownload(activity: Activity?, userConfirmedCellular: Boolean = false) {
        val current = _state.value
        val manifest = current.decision.manifest ?: return

        if (current.download.phase == DownloadPhase.READY_TO_INSTALL || current.download.phase == DownloadPhase.AWAITING_INSTALL_PERMISSION) {
            launchInstall(activity)
            return
        }
        if (downloadJob?.isActive == true) return

        // 移动流量提醒：首次检测到计费网络时提示用户确认后再下载
        if (!userConfirmedCellular && ApkInstaller.isActiveNetworkMetered(appContext) && current.download.phase != DownloadPhase.AWAITING_CELLULAR_CONFIRM) {
            _state.update {
                it.copy(
                    download = it.download.copy(
                        phase = DownloadPhase.AWAITING_CELLULAR_CONFIRM,
                        errorCode = "cellular_confirm",
                        errorMessage = "当前处于移动数据网络，安装包约 ${formatSizeMb(manifest.apkSizeBytes)}，再次点击「继续下载」开始下载。",
                    )
                )
            }
            return
        }

        val preferredId = current.selectedMirrorId
        downloadJob = scope.launch {
            _state.update {
                it.copy(
                    download = it.download.copy(
                        phase = DownloadPhase.DOWNLOADING,
                        errorCode = null,
                        errorMessage = null,
                    )
                )
            }

            when (val dl = downloader.downloadApk(manifest, preferredId) { progressSnap ->
                _state.update { s -> s.copy(download = progressSnap, selectedMirrorId = progressSnap.activeNodeId.ifBlank { s.selectedMirrorId }) }
            }) {
                is UpdateDownloader.DownloadResult.Success -> {
                    _state.update {
                        it.copy(
                            download = it.download.copy(
                                phase = DownloadPhase.VERIFYING,
                                downloadedBytes = manifest.apkSizeBytes,
                                totalBytes = manifest.apkSizeBytes,
                                speedBytesPerSec = 0L,
                            )
                        )
                    }
                    val verifyResult = kotlinx.coroutines.withContext(Dispatchers.IO) {
                        ApkVerifier.verifyDownloadedApk(
                            context = appContext,
                            apkFile = dl.apkFile,
                            manifest = manifest,
                            currentVersionCode = currentVersionCode,
                        )
                    }
                    when (verifyResult) {
                        is ApkVerifyResult.Valid -> {
                            downloader.cleanObsoleteFiles(manifest.latestVersionCode, manifest.sha256.take(12))
                            store.saveVerifiedApkRecord(manifest.latestVersionCode, manifest.sha256, verifyResult.apkFile.absolutePath)
                            _state.update {
                                it.copy(
                                    download = DownloadSnapshot(
                                        phase = DownloadPhase.READY_TO_INSTALL,
                                        downloadedBytes = manifest.apkSizeBytes,
                                        totalBytes = manifest.apkSizeBytes,
                                        activeNodeId = dl.node.id,
                                        activeNodeLabel = dl.node.label,
                                        verifiedApkPath = verifyResult.apkFile.absolutePath,
                                    )
                                )
                            }
                            recordDiagnostic("apk-verified", "vc=${manifest.latestVersionCode} node=${dl.node.id}")
                            launchInstall(activity)
                        }
                        is ApkVerifyResult.Invalid -> {
                            runCatching { dl.apkFile.delete() }
                            store.clearVerifiedApkRecord()
                            _state.update {
                                it.copy(
                                    download = DownloadSnapshot(
                                        phase = DownloadPhase.FAILED,
                                        errorCode = verifyResult.code,
                                        errorMessage = verifyResult.message,
                                    )
                                )
                            }
                            recordDiagnostic("apk-verify-rejected", "code=${verifyResult.code}")
                        }
                    }
                }
                is UpdateDownloader.DownloadResult.Failed -> {
                    _state.update {
                        it.copy(
                            download = it.download.copy(
                                phase = DownloadPhase.FAILED,
                                speedBytesPerSec = 0L,
                                errorCode = dl.errorCode,
                                errorMessage = dl.errorMessage,
                            )
                        )
                    }
                    recordDiagnostic("apk-download-failed", "code=${dl.errorCode}")
                }
            }
        }
    }

    fun cancelDownload() {
        downloadJob?.cancel(CancellationException("user_cancelled"))
        downloadJob = null
        _state.update {
            if (it.download.phase == DownloadPhase.DOWNLOADING || it.download.phase == DownloadPhase.AWAITING_CELLULAR_CONFIRM) {
                it.copy(
                    download = it.download.copy(
                        phase = DownloadPhase.IDLE,
                        speedBytesPerSec = 0L,
                        errorCode = null,
                        errorMessage = "已暂停下载，可随时继续。",
                    )
                )
            } else it
        }
    }

    fun switchToNextMirrorAndRetry(activity: Activity?) {
        val manifest = _state.value.decision.manifest ?: return
        val mirrors = manifest.downloadUrls
        if (mirrors.size > 1) {
            val currentIdx = mirrors.indexOfFirst { it.id == _state.value.selectedMirrorId }
            val nextMirror = mirrors[(currentIdx + 1).mod(mirrors.size)]
            _state.update { it.copy(selectedMirrorId = nextMirror.id) }
        }
        cancelDownload()
        startOrResumeDownload(activity, userConfirmedCellular = true)
    }

    fun launchInstall(activity: Activity?) {
        val path = _state.value.download.verifiedApkPath ?: return
        val apkFile = File(path)
        when (val res = ApkInstaller.launchSystemInstaller(activity ?: appContext, apkFile)) {
            is ApkInstaller.LaunchOutcome.Launched -> {
                recordDiagnostic("installer-launched", "vc=${_state.value.decision.manifest?.latestVersionCode}")
            }
            is ApkInstaller.LaunchOutcome.NeedsInstallPermission -> {
                _state.update {
                    it.copy(
                        download = it.download.copy(
                            phase = DownloadPhase.AWAITING_INSTALL_PERMISSION,
                            errorCode = "install_permission_required",
                            errorMessage = "请在系统设置中允许「听屿」安装应用，授权后返回即可自动继续安装。",
                        )
                    )
                }
                if (activity != null) {
                    ApkInstaller.openInstallPermissionSettings(activity)
                }
            }
            is ApkInstaller.LaunchOutcome.Error -> {
                _state.update {
                    it.copy(
                        download = it.download.copy(
                            phase = DownloadPhase.FAILED,
                            errorCode = "installer_error",
                            errorMessage = res.message,
                        )
                    )
                }
            }
        }
    }

    fun openManualDownloadFallback() {
        val manifest = _state.value.decision.manifest ?: return
        val chosen = manifest.downloadUrls.firstOrNull { it.id == _state.value.selectedMirrorId }
            ?: manifest.downloadUrls.firstOrNull()
            ?: return
        ApkInstaller.openManualDownloadInBrowser(appContext, chosen.url)
    }

    fun toBridgeJson(): JSONObject {
        val s = _state.value
        val m = s.decision.manifest
        return JSONObject().apply {
            put("currentVersionName", s.currentVersionName)
            put("currentVersionCode", s.currentVersionCode)
            put("channel", s.channel)
            put("checkPhase", s.checkPhase.name.lowercase())
            put("checkMessage", s.checkMessage)
            put("lastCheckedAtMs", s.lastCheckedAtMs)
            put("decisionMode", s.decision.mode.name.lowercase())
            put("forceUpdate", s.isForceUpdateActive)
            if (m != null) {
                put("latestVersionName", m.latestVersionName)
                put("latestVersionCode", m.latestVersionCode)
                put("minSupportedVersionCode", m.minSupportedVersionCode)
                put("releaseNotes", m.releaseNotes)
                put("apkSizeBytes", m.apkSizeBytes)
                put("publishedAt", m.publishedAt)
                put("policyRevision", m.policyRevision)
            }
        }
    }

    private fun recordDiagnostic(type: String, detail: String) {
        runCatching {
            CrashDiagnostics.recordText(appContext, "app-update", "main", type, detail, "")
        }
    }

    companion object {
        private const val AUTO_CHECK_INTERVAL_MS = 30 * 60_000L // 30 分钟
        private const val MANUAL_CHECK_COOLDOWN_MS = 3_500L
        private const val OPTIONAL_SNOOZE_MS = 12 * 3600_000L // 12 小时内不重复主动打扰

        @Volatile
        private var instance: UpdateManager? = null

        @JvmStatic
        fun getInstance(context: Context): UpdateManager {
            return instance ?: synchronized(this) {
                instance ?: UpdateManager(context.applicationContext).also { instance = it }
            }
        }

        internal fun formatSizeMb(bytes: Long): String {
            if (bytes <= 0L) return "未知大小"
            return String.format("%.1f MB", bytes.toDouble() / (1024.0 * 1024.0))
        }
    }
}
