package io.github.huleixin.tingyu.update

import java.io.File

// android/app/src/main/java/io/github/huleixin/tingyu/update/UpdateModels.kt
// 软件内更新领域模型：配置清单、决策模式、下载状态、校验错误及 UI 快照。

data class DownloadMirror(
    val id: String,
    val label: String,
    val url: String,
    val priority: Int,
)

data class UpdateManifest(
    val schemaVersion: Int,
    val appId: String,
    val channel: String,
    val policyRevision: Long,
    val policyAction: String, // "normal" | "pause" | "emergency_unlock"
    val updateEnabled: Boolean,
    val latestVersionName: String,
    val latestVersionCode: Long,
    val minSupportedVersionCode: Long,
    val releaseId: String,
    val gitCommit: String,
    val releaseNotes: String,
    val publishedAt: String,
    val publishedAtEpochMs: Long,
    val policyExpiresAt: String,
    val policyExpiresAtEpochMs: Long,
    val offlineGraceHours: Int,
    val apkSizeBytes: Long,
    val sha256: String,
    val apkCertSha256: String,
    val minSdk: Int,
    val supportedAbis: List<String>,
    val downloadUrls: List<DownloadMirror>,
    val signatureAlgorithm: String,
    val keyId: String,
    val signature: String,
    val rawJson: String,
)

enum class UpdateDecisionMode {
    NONE,
    OPTIONAL_UPDATE,
    FORCE_UPDATE,
}

data class UpdateDecision(
    val mode: UpdateDecisionMode,
    val reason: String,
    val manifest: UpdateManifest? = null,
)

enum class CheckPhase {
    IDLE,
    CHECKING,
    UP_TO_DATE,
    UPDATE_AVAILABLE,
    CHECK_FAILED,
}

enum class DownloadPhase {
    IDLE,
    AWAITING_CELLULAR_CONFIRM,
    DOWNLOADING,
    VERIFYING,
    READY_TO_INSTALL,
    AWAITING_INSTALL_PERMISSION,
    FAILED,
}

data class DownloadSnapshot(
    val phase: DownloadPhase = DownloadPhase.IDLE,
    val downloadedBytes: Long = 0L,
    val totalBytes: Long = -1L,
    val speedBytesPerSec: Long = 0L,
    val activeNodeId: String = "",
    val activeNodeLabel: String = "",
    val verifiedApkPath: String? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null,
) {
    val progressFraction: Float?
        get() = if (totalBytes > 0L && downloadedBytes >= 0L) {
            (downloadedBytes.toDouble() / totalBytes.toDouble()).toFloat().coerceIn(0f, 1f)
        } else null
}

data class ReleaseHistoryEntry(
    val id: String,
    val versionName: String,
    val versionCode: Long,
    val gitCommit: String = "",
    val publishedAt: String = "",
    val releaseNotes: String,
    val isCurrentInstalled: Boolean = false,
)

enum class BetaActivationPhase {
    IDLE,
    VERIFYING,
    SUCCESS,
    FAILED,
}

data class BetaActivationUiState(
    val visible: Boolean = false,
    val phase: BetaActivationPhase = BetaActivationPhase.IDLE,
    val statusCode: String = "",
    val statusMessage: String = "",
)

data class UpdateUiState(
    val currentVersionName: String,
    val currentVersionCode: Long,
    val channel: String,
    val betaAuthorized: Boolean = false,
    val betaRole: String = "",
    val betaNote: String = "",
    val betaExpiresAtMs: Long = 0L,
    val checkPhase: CheckPhase = CheckPhase.IDLE,
    val checkMessage: String = "",
    val lastCheckedAtMs: Long = 0L,
    val decision: UpdateDecision = UpdateDecision(UpdateDecisionMode.NONE, "initial"),
    val dialogVisible: Boolean = false,
    val selectedMirrorId: String = "",
    val download: DownloadSnapshot = DownloadSnapshot(),
    val historyVisible: Boolean = false,
    val historyLoading: Boolean = false,
    val historyEntries: List<ReleaseHistoryEntry> = emptyList(),
    val betaActivation: BetaActivationUiState = BetaActivationUiState(),
) {
    val isForceUpdateActive: Boolean
        get() = decision.mode == UpdateDecisionMode.FORCE_UPDATE && decision.manifest != null
}

sealed class ManifestVerifyResult {
    data class Valid(val manifest: UpdateManifest) : ManifestVerifyResult()
    data class Invalid(val code: String, val detail: String = "") : ManifestVerifyResult()
}

sealed class ApkVerifyResult {
    data class Valid(val apkFile: File, val packageName: String, val versionCode: Long, val sha256: String) : ApkVerifyResult()
    data class Invalid(val code: String, val message: String) : ApkVerifyResult()
}
