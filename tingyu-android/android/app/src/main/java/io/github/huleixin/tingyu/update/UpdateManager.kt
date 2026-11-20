package io.github.huleixin.tingyu.update

import android.app.Activity
import android.content.Context
import io.github.huleixin.tingyu.BuildConfig
import io.github.huleixin.tingyu.CrashDiagnostics
import io.github.huleixin.tingyu.telemetry.TelemetryManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineExceptionHandler
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

class UpdateManager internal constructor(
    private val appContext: Context,
    private val betaAuth: BetaAuthManager = BetaAuthManager(appContext),
    private val api: UpdateApi = UpdateApi(),
) {
    private val scope = CoroutineScope(
        SupervisorJob() + Dispatchers.Main.immediate + CoroutineExceptionHandler { _, throwable ->
            recordDiagnostic("update-scope-exception", throwable.javaClass.simpleName)
        }
    )
    private val store = UpdateStateStore(appContext)
    private val downloader = UpdateDownloader(appContext)

    private var checkJob: Job? = null
    private var downloadJob: Job? = null
    private var periodicJob: Job? = null
    private var coldStartScheduled = false

    val currentVersionName: String = BuildConfig.VERSION_NAME
    val currentVersionCode: Long = BuildConfig.VERSION_CODE.toLong()

    /**
     * 更新渠道裁决（权限严格下沉至 UpdateManager 层）：
     * - 未持有有效私有内测授权的普通用户：始终固定返回 `stable`，自动迁移并清理历史旧版 `testing` 偏好与缓存；
     * - 持有有效内测授权的开发者/受邀设备：允许在 `stable` 与 `private_beta` 之间自由切换。
     */
    val activeChannel: String
        get() {
            val auth = betaAuth.getAuthorizationSnapshot()
            if (auth == null) {
                return "stable"
            }
            return when (store.getPreferredChannel("stable")) {
                "private_beta", "testing" -> "private_beta"
                else -> "stable"
            }
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
        migrateLegacyTestingChannelIfNeeded()
        hydrateFromPersistedPolicy()
    }

    /**
     * 存量用户自动迁移（v1.5.83 -> 新版）：
     * 无论旧版偏好是否为 `testing`，若当前设备不持有有效私有内测授权，立即回归 `stable` 并清理旧 `testing` 缓存与残留文件，
     * 绝不触碰用户收藏、歌单、账号、播放历史与本地音乐数据。
     */
    private fun migrateLegacyTestingChannelIfNeeded() {
        val preferred = store.getPreferredChannel("stable")
        val auth = betaAuth.getAuthorizationSnapshot()
        if (auth == null && (preferred == "testing" || preferred == "private_beta")) {
            store.setPreferredChannel("stable")
            store.clearChannelCache("testing")
            store.clearChannelCache("private_beta")
            store.clearVerifiedApkRecord()
            downloader.cleanObsoleteFiles()
        } else if (auth != null && preferred == "testing") {
            store.setPreferredChannel("private_beta")
            store.clearChannelCache("testing")
        }
    }

    private fun hydrateFromPersistedPolicy() {
        val now = System.currentTimeMillis()
        val auth = betaAuth.getAuthorizationSnapshot(now)
        val ch = activeChannel

        // 清理已覆盖安装完毕的旧版本残留 APK
        val readyRecord = store.loadVerifiedApkRecord()
        if (readyRecord != null && readyRecord.versionCode <= currentVersionCode) {
            store.clearVerifiedApkRecord()
            downloader.cleanObsoleteFiles()
        }

        val persisted = store.loadVerifiedPolicy(ch)
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
                    channel = ch,
                    betaAuthorized = auth != null,
                    betaRole = auth?.role.orEmpty(),
                    betaNote = auth?.note.orEmpty(),
                    betaExpiresAtMs = auth?.expiresAtMs ?: 0L,
                    decision = decision,
                    dialogVisible = showDialog,
                    selectedMirrorId = persisted.manifest.downloadUrls.firstOrNull()?.id.orEmpty(),
                    download = restoredDownload,
                )
            }
        } else {
            _state.update {
                it.copy(
                    channel = ch,
                    betaAuthorized = auth != null,
                    betaRole = auth?.role.orEmpty(),
                    betaNote = auth?.note.orEmpty(),
                    betaExpiresAtMs = auth?.expiresAtMs ?: 0L,
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
            val now = System.currentTimeMillis()
            try {
            // 若设备持有内测授权但当前处于 stable，也在后台静默校验内测授权是否被撤销或过期（网络异常不误杀）
            if (channel != "private_beta" && betaAuth.hasActiveAuthorization(now)) {
                when (betaAuth.verifyAuthorization(activeChannel = channel)) {
                    is BetaAuthManager.VerifyResult.Rejected -> handleBetaAuthorizationRevoked(triggerCheck = false)
                    else -> Unit
                }
            }

            val minRev = store.getHighestPolicyRevision(channel)
            var betaStatusMessage: String? = null
            var betaFallbackToStable = false
            val outcome: UpdateApi.FetchOutcome = if (channel == "private_beta") {
                when (val betaRes = betaAuth.fetchPrivateBetaPolicy(activeChannel = "private_beta")) {
                    is BetaAuthManager.PrivatePolicyResult.Success -> {
                        val selection = UpdatePolicy.selectAuthoritativeManifest(
                            candidates = listOf(UpdatePolicy.NodeCandidate(betaRes.nodeId, betaRes.rawJson)),
                            expectedChannel = "private_beta",
                            nowMs = now,
                            minAcceptedRevision = minRev,
                        )
                        val m = selection.manifest
                        if (m != null && selection.selectedNodeId != null) {
                            UpdateApi.FetchOutcome.Success(selection.selectedNodeId, m, selection.rejections)
                        } else {
                            val rejCode = selection.rejections.firstOrNull()?.second ?: "invalid_private_beta_policy"
                            UpdateApi.FetchOutcome.Failure(rejCode, selection.rejections)
                        }
                    }
                    is BetaAuthManager.PrivatePolicyResult.NoPublishedPolicy -> {
                        recordDiagnostic("beta-no-policy", "reason=$reason node=${betaRes.nodeId} code=${betaRes.code}")
                        betaStatusMessage = "当前暂无可用的内测版本"
                        betaFallbackToStable = true
                        UpdateApi.FetchOutcome.Failure("policy_not_published", listOf(betaRes.nodeId to betaRes.code))
                    }
                    is BetaAuthManager.PrivatePolicyResult.Revoked -> {
                        recordDiagnostic("beta-revoked", "reason=$reason code=${betaRes.code}")
                        handleBetaAuthorizationRevoked(triggerCheck = false)
                        return@launch
                    }
                    is BetaAuthManager.PrivatePolicyResult.AuthFailure -> {
                        UpdateApi.FetchOutcome.Failure("beta_auth_failure:${betaRes.code}:http_${betaRes.httpStatus}", emptyList())
                    }
                    is BetaAuthManager.PrivatePolicyResult.ServiceError -> {
                        UpdateApi.FetchOutcome.Failure("beta_service_error:${betaRes.reason}:http_${betaRes.httpStatus}", emptyList())
                    }
                    is BetaAuthManager.PrivatePolicyResult.NetworkError -> {
                        UpdateApi.FetchOutcome.Failure("beta_network_error:${betaRes.reason}", emptyList())
                    }
                }
            } else {
                api.fetchAuthoritativePolicy(channel = channel, minAcceptedRevision = minRev, nowMs = now)
            }

            if (betaFallbackToStable) {
                val stableMinRev = store.getHighestPolicyRevision("stable")
                val stableOutcome = api.fetchAuthoritativePolicy(channel = "stable", minAcceptedRevision = stableMinRev, nowMs = now)
                if (stableOutcome is UpdateApi.FetchOutcome.Success) {
                    val stableDecision = UpdatePolicy.evaluateDecision(currentVersionCode, stableOutcome.manifest, now, now)
                    if (stableDecision.mode != UpdateDecisionMode.NONE) {
                        store.saveVerifiedPolicy(stableOutcome.manifest, now)
                        val shouldOpen = stableDecision.mode == UpdateDecisionMode.FORCE_UPDATE ||
                            (manual || !store.isOptionalUpdateSnoozed(stableOutcome.manifest.latestVersionCode, now))
                        _state.update { prev ->
                            prev.copy(
                                checkPhase = CheckPhase.UPDATE_AVAILABLE,
                                checkMessage = "暂无可用内测版本，发现正式版更新 v${stableOutcome.manifest.latestVersionName}",
                                lastCheckedAtMs = now,
                                decision = stableDecision,
                                dialogVisible = prev.dialogVisible || shouldOpen,
                                selectedMirrorId = stableOutcome.manifest.downloadUrls.firstOrNull()?.id.orEmpty(),
                            )
                        }
                        recordDiagnostic("beta-fallback-stable-update", "node=${stableOutcome.selectedNodeId} ver=${stableOutcome.manifest.latestVersionCode}")
                        return@launch
                    }
                }
                _state.update { prev ->
                    prev.copy(
                        checkPhase = CheckPhase.UP_TO_DATE,
                        checkMessage = betaStatusMessage ?: "当前暂无可用的内测版本",
                        lastCheckedAtMs = now,
                        decision = UpdateDecision(UpdateDecisionMode.NONE, "policy_not_published"),
                        dialogVisible = false,
                    )
                }
                return@launch
            }

            when (outcome) {
                is UpdateApi.FetchOutcome.Success -> {
                    val manifest = outcome.manifest
                    store.saveVerifiedPolicy(manifest, now)
                    var decision = UpdatePolicy.evaluateDecision(
                        currentVersionCode = currentVersionCode,
                        manifest = manifest,
                        nowMs = now,
                        lastVerifiedAtMs = now,
                    )
                    var phase = if (decision.mode == UpdateDecisionMode.NONE) CheckPhase.UP_TO_DATE else CheckPhase.UPDATE_AVAILABLE
                    var msg = when (decision.mode) {
                        UpdateDecisionMode.NONE -> when {
                            channel == "private_beta" && decision.reason == "updates_paused_or_disabled" -> "内测更新已暂停"
                            channel == "private_beta" && currentVersionCode > manifest.latestVersionCode ->
                                "当前安装版本（Build $currentVersionCode）高于内测版本（Build ${manifest.latestVersionCode}）"
                            channel == "private_beta" -> "当前已是最新内测版本 v${manifest.latestVersionName}"
                            else -> "当前已是最新版本"
                        }
                        UpdateDecisionMode.OPTIONAL_UPDATE ->
                            if (channel == "private_beta") "发现新的内测版本 v${manifest.latestVersionName}" else "发现新版本 v${manifest.latestVersionName}"
                        UpdateDecisionMode.FORCE_UPDATE ->
                            if (channel == "private_beta") "发现重要必更内测版本 v${manifest.latestVersionName}" else "发现重要必更版本 v${manifest.latestVersionName}"
                    }

                    // 私有内测无更高版本或已暂停时，允许检查是否有适用的正式版更新（保留内测资格与偏好）
                    if (channel == "private_beta" && decision.mode == UpdateDecisionMode.NONE) {
                        val stableMinRev = store.getHighestPolicyRevision("stable")
                        val stableOutcome = api.fetchAuthoritativePolicy(channel = "stable", minAcceptedRevision = stableMinRev, nowMs = now)
                        if (stableOutcome is UpdateApi.FetchOutcome.Success) {
                            val stableDecision = UpdatePolicy.evaluateDecision(currentVersionCode, stableOutcome.manifest, now, now)
                            if (stableDecision.mode != UpdateDecisionMode.NONE) {
                                store.saveVerifiedPolicy(stableOutcome.manifest, now)
                                decision = stableDecision
                                phase = CheckPhase.UPDATE_AVAILABLE
                                msg = "暂无更高内测版本，发现正式版更新 v${stableOutcome.manifest.latestVersionName}"
                            }
                        }
                    }

                    val activeManifest = decision.manifest ?: manifest
                    val shouldOpenDialog = when (decision.mode) {
                        UpdateDecisionMode.FORCE_UPDATE -> true
                        UpdateDecisionMode.OPTIONAL_UPDATE -> manual || !store.isOptionalUpdateSnoozed(activeManifest.latestVersionCode, now)
                        UpdateDecisionMode.NONE -> false
                    }
                    val readySnap = restoreReadyApkSnapshot(activeManifest)
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
                            selectedMirrorId = prev.selectedMirrorId.takeIf { id -> activeManifest.downloadUrls.any { it.id == id } }
                                ?: activeManifest.downloadUrls.firstOrNull()?.id.orEmpty(),
                            download = mergedDownload,
                        )
                    }
                    recordDiagnostic("check-ok", "reason=$reason ch=$channel node=${outcome.selectedNodeId} rev=${activeManifest.policyRevision} mode=${decision.mode}")
                }
                is UpdateApi.FetchOutcome.Failure -> {
                    val cached = store.loadVerifiedPolicy(channel)
                    val fallbackDecision = if (cached != null) {
                        UpdatePolicy.evaluateDecision(currentVersionCode, cached.manifest, now, cached.verifiedAtMs)
                    } else {
                        UpdateDecision(UpdateDecisionMode.NONE, "check_failed")
                    }
                    val errSummary = formatFailureMessage(outcome.reason, outcome.nodeErrors)
                    _state.update { prev ->
                        prev.copy(
                            checkPhase = CheckPhase.CHECK_FAILED,
                            checkMessage = errSummary,
                            lastCheckedAtMs = now,
                            decision = fallbackDecision,
                            dialogVisible = if (fallbackDecision.mode == UpdateDecisionMode.FORCE_UPDATE) true else prev.dialogVisible,
                        )
                    }
                    val nodeDetail = outcome.nodeErrors.joinToString(",") { "${it.first}:${it.second}" }.take(180)
                    recordDiagnostic("check-failed", "reason=$reason ch=$channel err=${outcome.reason} nodes=[$nodeDetail]")
                }
            }
            } catch (ce: CancellationException) {
                throw ce
            } catch (t: Throwable) {
                _state.update { prev ->
                    prev.copy(
                        checkPhase = CheckPhase.CHECK_FAILED,
                        checkMessage = if (manual) "检查更新失败，请稍后重试" else prev.checkMessage,
                        lastCheckedAtMs = now,
                    )
                }
                recordDiagnostic("check-exception", "reason=$reason ch=$channel err=${t.javaClass.simpleName}")
            }
        }
    }

    private fun formatFailureMessage(reason: String, nodeErrors: List<Pair<String, String>>): String {
        val codes = (listOf(reason) + nodeErrors.map { it.second }).joinToString(" ")
        return when {
            codes.contains("invalid_signature") || codes.contains("untrusted_key_id") || codes.contains("missing_signature") || codes.contains("signature_verification_exception") ->
                "更新策略签名校验失败，已拒绝应用"
            codes.contains("policy_expired") ->
                "更新策略已过期，请稍后重试"
            reason.startsWith("beta_auth_failure:") ->
                "内测请求鉴权失败，请检查系统时间或稍后重试"
            reason.startsWith("beta_service_error:") || codes.contains("http_50") || codes.contains("http_429") ->
                "更新服务暂时异常，请稍后重试"
            else ->
                "检查更新失败，请检查网络后重试"
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
        val initialMirror = preferredId.ifBlank { manifest.downloadUrls.firstOrNull()?.id.orEmpty() }
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
            TelemetryManager.getInstance(appContext).reportUpdateEvent(
                event = "download_started",
                targetVersionCode = manifest.latestVersionCode,
                targetVersionName = manifest.latestVersionName,
                channel = manifest.channel,
                mirrorId = initialMirror,
            )

            var activeManifest = manifest
            var dl = downloader.downloadApk(activeManifest, preferredId) { progressSnap ->
                _state.update { s -> s.copy(download = progressSnap, selectedMirrorId = progressSnap.activeNodeId.ifBlank { s.selectedMirrorId }) }
            }
            // 若私有内测短期下载凭据已过期（HTTP 401/403），且设备仍具备有效内测授权，则自动重新申领凭据并续传一次
            if (dl is UpdateDownloader.DownloadResult.Failed && activeManifest.channel == "private_beta" && (dl.errorCode == "http_401" || dl.errorCode == "http_403")) {
                when (val refreshed = betaAuth.fetchPrivateBetaPolicy("private_beta")) {
                    is BetaAuthManager.PrivatePolicyResult.Success -> {
                        val sel = UpdatePolicy.selectAuthoritativeManifest(
                            candidates = listOf(UpdatePolicy.NodeCandidate(refreshed.nodeId, refreshed.rawJson)),
                            expectedChannel = "private_beta",
                            nowMs = System.currentTimeMillis(),
                            minAcceptedRevision = store.getHighestPolicyRevision("private_beta"),
                        )
                        val newManifest = sel.manifest
                        if (newManifest != null) {
                            store.saveVerifiedPolicy(newManifest, System.currentTimeMillis())
                            activeManifest = newManifest
                            dl = downloader.downloadApk(activeManifest, "") { progressSnap ->
                                _state.update { s -> s.copy(download = progressSnap, selectedMirrorId = progressSnap.activeNodeId.ifBlank { s.selectedMirrorId }) }
                            }
                        }
                    }
                    is BetaAuthManager.PrivatePolicyResult.Revoked -> {
                        handleBetaAuthorizationRevoked(triggerCheck = false)
                        return@launch
                    }
                    else -> Unit
                }
            }
            when (dl) {
                is UpdateDownloader.DownloadResult.Success -> {
                    _state.update {
                        it.copy(
                            download = it.download.copy(
                                phase = DownloadPhase.VERIFYING,
                                downloadedBytes = activeManifest.apkSizeBytes,
                                totalBytes = activeManifest.apkSizeBytes,
                                speedBytesPerSec = 0L,
                            )
                        )
                    }
                    val verifyResult = kotlinx.coroutines.withContext(Dispatchers.IO) {
                        ApkVerifier.verifyDownloadedApk(
                            context = appContext,
                            apkFile = dl.apkFile,
                            manifest = activeManifest,
                            currentVersionCode = currentVersionCode,
                        )
                    }
                    when (verifyResult) {
                        is ApkVerifyResult.Valid -> {
                            downloader.cleanObsoleteFiles(activeManifest.latestVersionCode, activeManifest.sha256.take(12))
                            store.saveVerifiedApkRecord(activeManifest.latestVersionCode, activeManifest.sha256, verifyResult.apkFile.absolutePath)
                            _state.update {
                                it.copy(
                                    download = DownloadSnapshot(
                                        phase = DownloadPhase.READY_TO_INSTALL,
                                        downloadedBytes = activeManifest.apkSizeBytes,
                                        totalBytes = activeManifest.apkSizeBytes,
                                        activeNodeId = dl.node.id,
                                        activeNodeLabel = dl.node.label,
                                        verifiedApkPath = verifyResult.apkFile.absolutePath,
                                    )
                                )
                            }
                            TelemetryManager.getInstance(appContext).reportUpdateEvent(
                                event = "download_succeeded",
                                targetVersionCode = activeManifest.latestVersionCode,
                                targetVersionName = activeManifest.latestVersionName,
                                channel = activeManifest.channel,
                                mirrorId = dl.node.id,
                            )
                            recordDiagnostic("apk-verified", "vc=${activeManifest.latestVersionCode} node=${dl.node.id}")
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
                            TelemetryManager.getInstance(appContext).reportUpdateEvent(
                                event = "verify_failed",
                                targetVersionCode = activeManifest.latestVersionCode,
                                targetVersionName = activeManifest.latestVersionName,
                                channel = activeManifest.channel,
                                mirrorId = dl.node.id,
                            )
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
                    TelemetryManager.getInstance(appContext).reportUpdateEvent(
                        event = "download_failed",
                        targetVersionCode = activeManifest.latestVersionCode,
                        targetVersionName = activeManifest.latestVersionName,
                        channel = activeManifest.channel,
                        mirrorId = initialMirror,
                    )
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

    fun switchChannel(nextChannel: String): String {
        val requested = if (nextChannel == "testing") "private_beta" else nextChannel
        if (requested != "stable" && requested != "private_beta") return activeChannel
        // 权限统一在更新管理器层校验：未获有效内测授权者严禁切换至测试通道
        if (requested == "private_beta" && !betaAuth.hasActiveAuthorization()) {
            store.setPreferredChannel("stable")
            hydrateFromPersistedPolicy()
            return "stable"
        }
        checkJob?.cancel()
        store.setPreferredChannel(requested)
        _state.update {
            it.copy(
                channel = requested,
                checkPhase = CheckPhase.IDLE,
                checkMessage = "",
                decision = UpdateDecision(UpdateDecisionMode.NONE, "channel_switched"),
                dialogVisible = false,
            )
        }
        hydrateFromPersistedPolicy()
        performCheck(manual = true, reason = "switch-channel-$requested")
        return requested
    }

    fun openBetaActivationDialog() {
        _state.update {
            it.copy(
                betaActivation = BetaActivationUiState(
                    visible = true,
                    phase = BetaActivationPhase.IDLE,
                )
            )
        }
    }

    fun dismissBetaActivationDialog() {
        _state.update {
            it.copy(betaActivation = BetaActivationUiState(visible = false))
        }
    }

    fun redeemBetaInvite(code: String) {
        if (_state.value.betaActivation.phase == BetaActivationPhase.VERIFYING) return
        _state.update {
            it.copy(
                betaActivation = BetaActivationUiState(
                    visible = true,
                    phase = BetaActivationPhase.VERIFYING,
                    statusMessage = "正在验证内测邀请码…",
                )
            )
        }
        scope.launch {
            when (val res = betaAuth.redeemInviteCode(code)) {
                is BetaAuthManager.RedeemResult.Success -> {
                    val rec = res.record
                    val roleLabel = if (rec.role == "developer") "开发者设备长期授权" else "受邀内测设备授权"
                    store.setPreferredChannel("private_beta")
                    _state.update {
                        it.copy(
                            channel = "private_beta",
                            betaAuthorized = true,
                            betaRole = rec.role,
                            betaNote = rec.note,
                            betaExpiresAtMs = rec.expiresAtMs,
                            betaActivation = BetaActivationUiState(
                                visible = true,
                                phase = BetaActivationPhase.SUCCESS,
                                statusCode = "ok",
                                statusMessage = "激活成功：$roleLabel",
                            ),
                        )
                    }
                    performCheck(manual = true, reason = "beta-activated")
                }
                is BetaAuthManager.RedeemResult.Failed -> {
                    _state.update {
                        it.copy(
                            betaActivation = BetaActivationUiState(
                                visible = true,
                                phase = BetaActivationPhase.FAILED,
                                statusCode = res.code,
                                statusMessage = res.message,
                            )
                        )
                    }
                }
            }
        }
    }

    fun leaveBetaProgram() {
        scope.launch {
            betaAuth.leaveBetaProgram()
            handleBetaAuthorizationRevoked(triggerCheck = true)
        }
    }

    internal fun handleBetaAuthorizationRevoked(triggerCheck: Boolean = true) {
        if (_state.value.decision.manifest?.channel == "private_beta") {
            downloadJob?.cancel(CancellationException("beta_revoked"))
            downloadJob = null
        }
        betaAuth.clearLocalAuthorization()
        store.setPreferredChannel("stable")
        store.clearChannelCache("private_beta")
        store.clearChannelCache("testing")
        store.clearVerifiedApkRecord()
        downloader.cleanObsoleteFiles()
        _state.update {
            it.copy(
                channel = "stable",
                betaAuthorized = false,
                betaRole = "",
                betaNote = "",
                betaExpiresAtMs = 0L,
                decision = UpdateDecision(UpdateDecisionMode.NONE, "beta_revoked_to_stable"),
                dialogVisible = false,
                download = DownloadSnapshot(),
                historyVisible = false,
                historyEntries = emptyList(),
            )
        }
        hydrateFromPersistedPolicy()
        if (triggerCheck) {
            performCheck(manual = false, reason = "beta-revoked-fallback")
        }
    }

    fun openReleaseHistoryDialog() {
        val ch = activeChannel
        _state.update { it.copy(historyVisible = true, historyLoading = true) }
        scope.launch {
            val remote = if (ch == "private_beta") {
                betaAuth.fetchPrivateBetaHistory(currentVersionCode)
            } else {
                api.fetchPublishedReleaseHistory(ch, currentVersionCode)
            }
            val merged = if (remote.isNotEmpty()) {
                remote
            } else {
                // 若远端暂无已发布历史列表，仅尝试读取本地已验签缓存策略中的真实听屿公告；无记录则保持空列表展示“暂无更新记录”
                val cached = store.loadVerifiedPolicy(ch)?.manifest
                if (cached != null && cached.updateEnabled && cached.releaseNotes.isNotBlank()) {
                    listOf(
                        ReleaseHistoryEntry(
                            id = cached.releaseId,
                            versionName = cached.latestVersionName,
                            versionCode = cached.latestVersionCode,
                            gitCommit = cached.gitCommit,
                            publishedAt = cached.publishedAt.take(10),
                            releaseNotes = cached.releaseNotes,
                            isCurrentInstalled = cached.latestVersionCode == currentVersionCode,
                        )
                    )
                } else {
                    emptyList()
                }
            }
            _state.update { it.copy(historyLoading = false, historyEntries = merged) }
        }
    }

    fun dismissReleaseHistoryDialog() {
        _state.update { it.copy(historyVisible = false) }
    }

    fun toBridgeJson(): JSONObject {
        val s = _state.value
        val m = s.decision.manifest
        return JSONObject().apply {
            put("currentVersionName", s.currentVersionName)
            put("currentVersionCode", s.currentVersionCode)
            put("channel", s.channel)
            put("betaAuthorized", s.betaAuthorized)
            put("betaRole", s.betaRole)
            put("betaNote", s.betaNote)
            put("betaExpiresAtMs", s.betaExpiresAtMs)
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
