package io.github.huleixin.tingyu.update

import android.content.Context
import android.content.SharedPreferences

// android/app/src/main/java/io/github/huleixin/tingyu/update/UpdateStateStore.kt
// 更新状态持久化：保存最近一次经签名校验通过的权威策略、防重放序列号、普通更新稍后提醒冷却及待恢复下载记录。

class UpdateStateStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    data class PersistedPolicyRecord(
        val manifest: UpdateManifest,
        val verifiedAtMs: Long,
        val highestPolicyRevision: Long,
    )

    fun loadVerifiedPolicy(
        expectedChannel: String,
        trustedKeysSpki: Map<String, String> = UpdateTrustAnchors.TRUSTED_PUBLIC_KEYS_SPKI,
        expectedAppId: String = UpdateTrustAnchors.APP_ID,
    ): PersistedPolicyRecord? {
        val raw = prefs.getString(keyForChannel(KEY_VERIFIED_MANIFEST, expectedChannel), null) ?: return null
        val verifiedAt = prefs.getLong(keyForChannel(KEY_VERIFIED_AT_MS, expectedChannel), 0L)
        val highestRev = prefs.getLong(keyForChannel(KEY_HIGHEST_REVISION, expectedChannel), 0L)
        // 启动恢复时再次执行完整 ECDSA 签名验证，防止本地持久化被篡改伪造强制更新。
        return when (val res = UpdatePolicy.verifyManifest(raw, trustedKeysSpki, expectedAppId)) {
            is ManifestVerifyResult.Valid -> {
                if (res.manifest.channel != expectedChannel) null
                else PersistedPolicyRecord(
                    manifest = res.manifest,
                    verifiedAtMs = verifiedAt,
                    highestPolicyRevision = maxOf(highestRev, res.manifest.policyRevision),
                )
            }
            is ManifestVerifyResult.Invalid -> null
        }
    }

    fun getHighestPolicyRevision(channel: String): Long =
        prefs.getLong(keyForChannel(KEY_HIGHEST_REVISION, channel), 0L)

    fun saveVerifiedPolicy(manifest: UpdateManifest, verifiedAtMs: Long) {
        val ch = manifest.channel
        val prevRev = getHighestPolicyRevision(ch)
        val nextRev = maxOf(prevRev, manifest.policyRevision)
        prefs.edit()
            .putString(keyForChannel(KEY_VERIFIED_MANIFEST, ch), manifest.rawJson)
            .putLong(keyForChannel(KEY_VERIFIED_AT_MS, ch), verifiedAtMs)
            .putLong(keyForChannel(KEY_HIGHEST_REVISION, ch), nextRev)
            .apply()
    }

    fun snoozeOptionalUpdate(versionCode: Long, snoozeUntilMs: Long) {
        prefs.edit()
            .putLong(KEY_SNOOZED_VERSION_CODE, versionCode)
            .putLong(KEY_SNOOZED_UNTIL_MS, snoozeUntilMs)
            .apply()
    }

    fun isOptionalUpdateSnoozed(versionCode: Long, nowMs: Long): Boolean {
        val snoozedCode = prefs.getLong(KEY_SNOOZED_VERSION_CODE, -1L)
        val until = prefs.getLong(KEY_SNOOZED_UNTIL_MS, 0L)
        return snoozedCode == versionCode && nowMs < until
    }

    fun clearSnooze() {
        prefs.edit()
            .remove(KEY_SNOOZED_VERSION_CODE)
            .remove(KEY_SNOOZED_UNTIL_MS)
            .apply()
    }

    fun getLastAutoCheckAtMs(): Long = prefs.getLong(KEY_LAST_AUTO_CHECK_MS, 0L)
    fun setLastAutoCheckAtMs(atMs: Long) {
        prefs.edit().putLong(KEY_LAST_AUTO_CHECK_MS, atMs).apply()
    }

    fun getLastManualCheckAtMs(): Long = prefs.getLong(KEY_LAST_MANUAL_CHECK_MS, 0L)
    fun setLastManualCheckAtMs(atMs: Long) {
        prefs.edit().putLong(KEY_LAST_MANUAL_CHECK_MS, atMs).apply()
    }

    fun saveVerifiedApkRecord(versionCode: Long, sha256: String, filePath: String) {
        prefs.edit()
            .putLong(KEY_READY_APK_VERSION_CODE, versionCode)
            .putString(KEY_READY_APK_SHA256, sha256.lowercase())
            .putString(KEY_READY_APK_PATH, filePath)
            .apply()
    }

    data class ReadyApkRecord(val versionCode: Long, val sha256: String, val filePath: String)

    fun loadVerifiedApkRecord(): ReadyApkRecord? {
        val vc = prefs.getLong(KEY_READY_APK_VERSION_CODE, -1L)
        val sha = prefs.getString(KEY_READY_APK_SHA256, null)
        val path = prefs.getString(KEY_READY_APK_PATH, null)
        if (vc < 1L || sha.isNullOrBlank() || path.isNullOrBlank()) return null
        return ReadyApkRecord(vc, sha, path)
    }

    fun clearVerifiedApkRecord() {
        prefs.edit()
            .remove(KEY_READY_APK_VERSION_CODE)
            .remove(KEY_READY_APK_SHA256)
            .remove(KEY_READY_APK_PATH)
            .apply()
    }

    private fun keyForChannel(base: String, channel: String): String = "$base:$channel"

    companion object {
        private const val PREFS_NAME = "tingyu_native_update_state_v1"
        private const val KEY_VERIFIED_MANIFEST = "verified_manifest_json"
        private const val KEY_VERIFIED_AT_MS = "verified_at_ms"
        private const val KEY_HIGHEST_REVISION = "highest_policy_revision"
        private const val KEY_SNOOZED_VERSION_CODE = "snoozed_version_code"
        private const val KEY_SNOOZED_UNTIL_MS = "snoozed_until_ms"
        private const val KEY_LAST_AUTO_CHECK_MS = "last_auto_check_ms"
        private const val KEY_LAST_MANUAL_CHECK_MS = "last_manual_check_ms"
        private const val KEY_READY_APK_VERSION_CODE = "ready_apk_version_code"
        private const val KEY_READY_APK_SHA256 = "ready_apk_sha256"
        private const val KEY_READY_APK_PATH = "ready_apk_path"
    }
}
