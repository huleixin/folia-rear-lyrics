package io.github.huleixin.tingyu.update

import android.content.Context
import android.os.Build
import io.github.huleixin.tingyu.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID

// android/app/src/main/java/io/github/huleixin/tingyu/update/BetaAuthManager.kt
// 私有内测权限管理器：邀请码兑换激活、Keystore PoP 请求签名、授权状态校验、私有内测策略/历史拉取与退出内测。

class BetaAuthManager(
    context: Context,
    private val httpClient: OkHttpClient = UpdateApi.defaultHttpClient(),
) {
    private val store = BetaAuthStore(context)

    sealed class RedeemResult {
        data class Success(val record: BetaAuthorizationRecord) : RedeemResult()
        data class Failed(val code: String, val message: String) : RedeemResult()
    }

    sealed class VerifyResult {
        data class Valid(val record: BetaAuthorizationRecord) : VerifyResult()
        data class Rejected(val code: String) : VerifyResult()
        data class NetworkUnavailable(val reason: String) : VerifyResult()
    }

    sealed class PrivatePolicyResult {
        data class Success(val nodeId: String, val rawJson: String) : PrivatePolicyResult()
        data class Rejected(val code: String) : PrivatePolicyResult()
        data class NetworkError(val reason: String) : PrivatePolicyResult()
    }

    fun getAuthorizationSnapshot(nowMs: Long = System.currentTimeMillis()): BetaAuthorizationRecord? {
        val rec = store.loadAuthorization() ?: return null
        return if (rec.isCurrentlyValid(nowMs)) rec else null
    }

    fun hasActiveAuthorization(nowMs: Long = System.currentTimeMillis()): Boolean =
        getAuthorizationSnapshot(nowMs) != null

    fun clearLocalAuthorization() {
        store.clearAuthorization()
    }

    suspend fun redeemInviteCode(
        code: String,
        baseUrls: List<String> = UpdateTrustAnchors.betaBaseUrls(),
    ): RedeemResult = withContext(Dispatchers.IO) {
        val trimmed = code.trim()
        if (trimmed.length < 6) {
            return@withContext RedeemResult.Failed("invite_invalid", "请输入有效的内测邀请码")
        }
        val installId = store.getOrCreateBetaInstallId()
        val spki = store.getOrCreateDevicePublicKeySpki()
        val payload = JSONObject().apply {
            put("code", trimmed)
            put("installId", installId)
            put("publicKeySpki", spki)
            put("deviceModel", Build.MODEL ?: "")
            put("androidVersion", Build.VERSION.RELEASE ?: "")
            put("appVersionName", BuildConfig.VERSION_NAME)
            put("appVersionCode", BuildConfig.VERSION_CODE)
        }.toString()

        var lastNetworkErr = "network_error"
        for (base in baseUrls) {
            if (!isAllowedBaseUrl(base)) continue
            val req = Request.Builder()
                .url("${base.trimEnd('/')}/api/beta/redeem")
                .post(payload.toRequestBody(JSON_MEDIA))
                .header("Accept", "application/json")
                .header("User-Agent", "Tingyu-Android-BetaAuth/1.0")
                .build()
            try {
                httpClient.newCall(req).execute().use { res ->
                    val raw = res.body?.string().orEmpty()
                    val obj = runCatching { JSONObject(raw) }.getOrNull()
                    if (res.isSuccessful && obj?.optBoolean("authorized", false) == true) {
                        val now = System.currentTimeMillis()
                        val rec = BetaAuthorizationRecord(
                            deviceId = obj.optString("deviceId", ""),
                            deviceToken = obj.optString("deviceToken", ""),
                            role = obj.optString("role", "tester"),
                            note = obj.optString("note", ""),
                            activatedAtMs = obj.optLong("activatedAt", now),
                            expiresAtMs = obj.optLong("expiresAt", 0L),
                            lastVerifiedAtMs = now,
                        )
                        if (rec.deviceId.isNotBlank() && rec.deviceToken.isNotBlank()) {
                            store.saveAuthorization(rec)
                            return@withContext RedeemResult.Success(rec)
                        }
                    }
                    val errCode = obj?.optString("error", "").orEmpty().ifBlank { "http_${res.code}" }
                    if (res.code in 400..499) {
                        return@withContext RedeemResult.Failed(errCode, mapRedeemErrorMessage(errCode))
                    }
                    lastNetworkErr = errCode
                }
            } catch (e: Exception) {
                lastNetworkErr = e.javaClass.simpleName
            }
        }
        RedeemResult.Failed("network_error", "网络异常，请检查网络连接后重试 ($lastNetworkErr)")
    }

    suspend fun verifyAuthorization(
        activeChannel: String = "stable",
        baseUrls: List<String> = UpdateTrustAnchors.betaBaseUrls(),
    ): VerifyResult = withContext(Dispatchers.IO) {
        val current = store.loadAuthorization() ?: return@withContext VerifyResult.Rejected("not_authorized")
        val now = System.currentTimeMillis()
        if (current.expiresAtMs > 0L && current.expiresAtMs <= now) {
            return@withContext VerifyResult.Rejected("beta_expired")
        }
        val installId = store.getOrCreateBetaInstallId()
        val body = JSONObject().apply {
            put("installId", installId)
            put("appVersionName", BuildConfig.VERSION_NAME)
            put("appVersionCode", BuildConfig.VERSION_CODE)
            put("activeChannel", activeChannel)
        }.toString()

        var lastReason = "network_error"
        for (base in baseUrls) {
            if (!isAllowedBaseUrl(base)) continue
            val req = buildSignedBetaRequest(base, "/api/beta/verify", body, installId, current.deviceToken)
            try {
                httpClient.newCall(req).execute().use { res ->
                    val raw = res.body?.string().orEmpty()
                    val obj = runCatching { JSONObject(raw) }.getOrNull()
                    if (res.isSuccessful && obj?.optBoolean("authorized", false) == true) {
                        val verifiedAt = System.currentTimeMillis()
                        val nextExp = obj.optLong("expiresAt", current.expiresAtMs)
                        val nextRole = obj.optString("role", current.role)
                        val nextNote = obj.optString("note", current.note)
                        store.updateLastVerifiedAt(verifiedAt, nextExp, nextRole, nextNote)
                        val updated = current.copy(
                            role = nextRole,
                            note = nextNote,
                            expiresAtMs = nextExp,
                            lastVerifiedAtMs = verifiedAt,
                        )
                        return@withContext VerifyResult.Valid(updated)
                    }
                    val errCode = obj?.optString("error", "").orEmpty()
                    if (res.code == 401 || res.code == 403) {
                        return@withContext VerifyResult.Rejected(errCode.ifBlank { "beta_unauthorized" })
                    }
                    lastReason = errCode.ifBlank { "http_${res.code}" }
                }
            } catch (e: Exception) {
                lastReason = e.javaClass.simpleName
            }
        }
        VerifyResult.NetworkUnavailable(lastReason)
    }

    suspend fun fetchPrivateBetaPolicy(
        activeChannel: String = "private_beta",
        baseUrls: List<String> = UpdateTrustAnchors.betaBaseUrls(),
    ): PrivatePolicyResult = withContext(Dispatchers.IO) {
        val current = store.loadAuthorization() ?: return@withContext PrivatePolicyResult.Rejected("not_authorized")
        val now = System.currentTimeMillis()
        if (current.expiresAtMs > 0L && current.expiresAtMs <= now) {
            return@withContext PrivatePolicyResult.Rejected("beta_expired")
        }
        val installId = store.getOrCreateBetaInstallId()
        val body = JSONObject().apply {
            put("installId", installId)
            put("appVersionName", BuildConfig.VERSION_NAME)
            put("appVersionCode", BuildConfig.VERSION_CODE)
            put("activeChannel", activeChannel)
        }.toString()

        var lastReason = "network_error"
        for (base in baseUrls) {
            if (!isAllowedBaseUrl(base)) continue
            val req = buildSignedBetaRequest(base, "/api/beta/policy", body, installId, current.deviceToken)
            try {
                httpClient.newCall(req).execute().use { res ->
                    val raw = res.body?.string().orEmpty()
                    if (res.isSuccessful && raw.isNotBlank()) {
                        store.updateLastVerifiedAt(System.currentTimeMillis())
                        return@withContext PrivatePolicyResult.Success(base, raw)
                    }
                    val errCode = runCatching { JSONObject(raw).optString("error", "") }.getOrNull().orEmpty()
                    if (res.code == 401 || res.code == 403) {
                        return@withContext PrivatePolicyResult.Rejected(errCode.ifBlank { "beta_unauthorized" })
                    }
                    lastReason = errCode.ifBlank { "http_${res.code}" }
                }
            } catch (e: Exception) {
                lastReason = e.javaClass.simpleName
            }
        }
        PrivatePolicyResult.NetworkError(lastReason)
    }

    suspend fun fetchPrivateBetaHistory(
        currentVersionCode: Long,
        baseUrls: List<String> = UpdateTrustAnchors.betaBaseUrls(),
    ): List<ReleaseHistoryEntry> = withContext(Dispatchers.IO) {
        val current = store.loadAuthorization() ?: return@withContext emptyList()
        val installId = store.getOrCreateBetaInstallId()
        val body = JSONObject().apply {
            put("installId", installId)
            put("appVersionName", BuildConfig.VERSION_NAME)
            put("appVersionCode", BuildConfig.VERSION_CODE)
            put("activeChannel", "private_beta")
        }.toString()

        for (base in baseUrls) {
            if (!isAllowedBaseUrl(base)) continue
            val req = buildSignedBetaRequest(base, "/api/beta/history", body, installId, current.deviceToken)
            try {
                httpClient.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) return@use
                    val raw = res.body?.string().orEmpty()
                    val arr = JSONObject(raw).optJSONArray("items") ?: return@use
                    val out = mutableListOf<ReleaseHistoryEntry>()
                    for (i in 0 until arr.length()) {
                        val obj = arr.optJSONObject(i) ?: continue
                        val vName = obj.optString("versionName").trim()
                        val vCode = obj.optLong("versionCode", 0L)
                        val notes = obj.optString("releaseNotes").trim()
                        if (vName.isEmpty() || vCode <= 0L || notes.isEmpty()) continue
                        out.add(
                            ReleaseHistoryEntry(
                                id = obj.optString("id", "rel-$vCode"),
                                versionName = vName,
                                versionCode = vCode,
                                gitCommit = obj.optString("gitCommit", ""),
                                publishedAt = obj.optString("publishedAt", "").take(10),
                                releaseNotes = notes,
                                isCurrentInstalled = vCode == currentVersionCode,
                            )
                        )
                    }
                    return@withContext out
                }
            } catch (_: Exception) {
                // 尝试备用地址
            }
        }
        emptyList()
    }

    suspend fun leaveBetaProgram(baseUrls: List<String> = UpdateTrustAnchors.betaBaseUrls()) = withContext(Dispatchers.IO) {
        val current = store.loadAuthorization()
        if (current != null) {
            val installId = store.getOrCreateBetaInstallId()
            val body = JSONObject().apply { put("installId", installId) }.toString()
            for (base in baseUrls) {
                if (!isAllowedBaseUrl(base)) continue
                val req = buildSignedBetaRequest(base, "/api/beta/leave", body, installId, current.deviceToken)
                try {
                    httpClient.newCall(req).execute().use { res ->
                        if (res.isSuccessful) break
                    }
                } catch (_: Exception) {
                    // 尽力通知服务端后无论是否联网均清理本地授权
                }
            }
        }
        store.clearAuthorization()
    }

    private fun buildSignedBetaRequest(
        baseUrl: String,
        path: String,
        bodyJson: String,
        installId: String,
        deviceToken: String,
    ): Request {
        val timestamp = System.currentTimeMillis()
        val nonce = UUID.randomUUID().toString()
        val bodyHash = sha256Hex(bodyJson)
        val canonical = "POST|$path|$installId|$timestamp|$nonce|$bodyHash"
        val signature = store.signPopPayload(canonical)
        return Request.Builder()
            .url("${baseUrl.trimEnd('/')}$path")
            .post(bodyJson.toRequestBody(JSON_MEDIA))
            .header("Accept", "application/json")
            .header("User-Agent", "Tingyu-Android-BetaAuth/1.0")
            .header("X-Beta-Token", deviceToken)
            .header("X-Beta-Timestamp", timestamp.toString())
            .header("X-Beta-Nonce", nonce)
            .header("X-Beta-Signature", signature)
            .build()
    }

    private fun isAllowedBaseUrl(url: String): Boolean =
        url.startsWith("https://") || url.startsWith("http://127.0.0.1")

    private fun sha256Hex(text: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(text.toByteArray(StandardCharsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun mapRedeemErrorMessage(code: String): String = when (code) {
        "invite_used" -> "该邀请码已被使用，每个邀请码仅限绑定一台设备"
        "invite_expired" -> "邀请码已过期，请在开发者后台重新生成"
        "invite_cancelled" -> "该邀请码已被管理员取消作废"
        "rate_limit" -> "尝试过于频繁，请 15 分钟后再试"
        "invite_invalid", "invalid_install_id", "invalid_device_public_key" -> "邀请码无效，请核对后重试"
        else -> "授权验证失败（$code）"
    }

    companion object {
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
