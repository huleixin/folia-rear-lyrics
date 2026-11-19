package io.github.huleixin.tingyu.update

import android.util.Base64
import io.github.huleixin.tingyu.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

// android/app/src/main/java/io/github/huleixin/tingyu/update/UpdatePolicy.kt
// 规范化 JSON 编码、ECDSA-P256-SHA256 签名验证、多节点最高 policyRevision 裁决与强制/普通/离线宽限策略计算。

object UpdatePolicy {
    private val HEX_64 = Regex("^[a-f0-9]{64}$")
    private val ALLOWED_CHANNELS = setOf("stable", "testing", "private_beta", "automotive")
    private val ALLOWED_ACTIONS = setOf("normal", "pause", "emergency_unlock")
    const val DEFAULT_OFFLINE_GRACE_HOURS = 168

    /**
     * 与服务端 shared/updateProtocol.mjs 逐字节一致的规范化 JSON 序列化：
     * 剥离顶层 `signature` 后，所有对象键按 UTF-16 码元升序排列，无多余空白。
     */
    fun canonicalizeJsonObject(obj: JSONObject, stripTopSignature: Boolean = false): String {
        val keys = mutableListOf<String>()
        val iter = obj.keys()
        while (iter.hasNext()) {
            val k = iter.next()
            if (stripTopSignature && k == "signature") continue
            if (!obj.isNull(k) || obj.has(k)) keys.add(k)
        }
        keys.sort()
        val sb = StringBuilder("{")
        var first = true
        for (k in keys) {
            val v = obj.opt(k)
            if (v == null) continue
            if (!first) sb.append(',')
            first = false
            sb.append(quoteJsonString(k)).append(':').append(canonicalizeAny(v))
        }
        sb.append('}')
        return sb.toString()
    }

    private fun canonicalizeAny(value: Any?): String = when (value) {
        null, JSONObject.NULL -> "null"
        is JSONObject -> canonicalizeJsonObject(value, stripTopSignature = false)
        is JSONArray -> {
            val sb = StringBuilder("[")
            for (i in 0 until value.length()) {
                if (i > 0) sb.append(',')
                sb.append(canonicalizeAny(value.opt(i)))
            }
            sb.append(']')
            sb.toString()
        }
        is Boolean -> if (value) "true" else "false"
        is Int, is Long -> value.toString()
        is Number -> {
            val d = value.toDouble()
            if (d.isFinite() && d == d.toLong().toDouble()) d.toLong().toString()
            else JSONObject.numberToString(value)
        }
        is String -> quoteJsonString(value)
        else -> quoteJsonString(value.toString())
    }

    private fun quoteJsonString(s: String): String {
        val sb = StringBuilder(s.length + 2)
        sb.append('"')
        for (ch in s) {
            when (ch) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\b' -> sb.append("\\b")
                '\u000C' -> sb.append("\\f")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (ch.code < 0x20) {
                    sb.append(String.format("\\u%04x", ch.code))
                } else {
                    sb.append(ch)
                }
            }
        }
        sb.append('"')
        return sb.toString()
    }

    /**
     * 解析并严格校验更新配置结构与 ECDSA-P256-SHA256 数字签名。
     */
    fun verifyManifest(
        rawJson: String,
        trustedKeysSpki: Map<String, String> = UpdateTrustAnchors.TRUSTED_PUBLIC_KEYS_SPKI,
        expectedAppId: String = UpdateTrustAnchors.APP_ID,
    ): ManifestVerifyResult {
        if (rawJson.isBlank() || rawJson.length > 262_144) {
            return ManifestVerifyResult.Invalid("invalid_json_size")
        }
        val root = try {
            JSONObject(rawJson)
        } catch (e: Exception) {
            return ManifestVerifyResult.Invalid("malformed_json", e.message ?: "")
        }

        val schemaVersion = root.optInt("schemaVersion", -1)
        if (schemaVersion != UpdateTrustAnchors.SCHEMA_VERSION) {
            return ManifestVerifyResult.Invalid("unsupported_schema_version")
        }
        val appId = root.optString("appId", "")
        if (appId != expectedAppId) {
            return ManifestVerifyResult.Invalid("app_id_mismatch")
        }
        val channel = root.optString("channel", "")
        if (channel !in ALLOWED_CHANNELS) {
            return ManifestVerifyResult.Invalid("invalid_channel")
        }
        val policyRevision = root.optLong("policyRevision", -1L)
        if (policyRevision < 1L) {
            return ManifestVerifyResult.Invalid("invalid_policy_revision")
        }
        val policyAction = root.optString("policyAction", "")
        if (policyAction !in ALLOWED_ACTIONS) {
            return ManifestVerifyResult.Invalid("invalid_policy_action")
        }
        if (!root.has("updateEnabled") || root.opt("updateEnabled") !is Boolean) {
            return ManifestVerifyResult.Invalid("invalid_update_enabled")
        }
        val updateEnabled = root.getBoolean("updateEnabled")
        val latestVersionName = root.optString("latestVersionName", "").trim()
        if (latestVersionName.isEmpty()) {
            return ManifestVerifyResult.Invalid("invalid_latest_version_name")
        }
        val latestVersionCode = root.optLong("latestVersionCode", -1L)
        val minSupportedVersionCode = root.optLong("minSupportedVersionCode", -1L)
        if (latestVersionCode < 1L || minSupportedVersionCode < 1L) {
            return ManifestVerifyResult.Invalid("invalid_version_code")
        }
        if (minSupportedVersionCode > latestVersionCode) {
            return ManifestVerifyResult.Invalid("min_supported_exceeds_latest")
        }
        val releaseId = root.optString("releaseId", "").trim()
        if (releaseId.isEmpty()) {
            return ManifestVerifyResult.Invalid("invalid_release_id")
        }
        val gitCommit = root.optString("gitCommit", "").trim()
        val releaseNotes = root.optString("releaseNotes", "")
        val publishedAt = root.optString("publishedAt", "")
        val publishedAtEpochMs = root.optLong("publishedAtEpochMs", -1L)
        val policyExpiresAt = root.optString("policyExpiresAt", "")
        val policyExpiresAtEpochMs = root.optLong("policyExpiresAtEpochMs", -1L)
        if (publishedAtEpochMs <= 0L || policyExpiresAtEpochMs <= publishedAtEpochMs) {
            return ManifestVerifyResult.Invalid("invalid_policy_timestamps")
        }
        val offlineGraceHours = root.optInt("offlineGraceHours", DEFAULT_OFFLINE_GRACE_HOURS)
        if (offlineGraceHours !in 1..720) {
            return ManifestVerifyResult.Invalid("invalid_offline_grace_hours")
        }
        val apkSizeBytes = root.optLong("apkSizeBytes", 0L)
        val sha256 = root.optString("sha256", "").lowercase()
        val apkCertSha256 = root.optString("apkCertSha256", "").lowercase()
        val minSdk = root.optInt("minSdk", 24)
        if (minSdk < 21) {
            return ManifestVerifyResult.Invalid("invalid_min_sdk")
        }

        val abisArr = root.optJSONArray("supportedAbis")
        val supportedAbis = mutableListOf<String>()
        if (abisArr != null) {
            for (i in 0 until abisArr.length()) {
                val abi = abisArr.optString(i, "").trim()
                if (abi.isNotEmpty()) supportedAbis.add(abi)
            }
        }
        if (supportedAbis.isEmpty()) {
            return ManifestVerifyResult.Invalid("invalid_supported_abis")
        }

        val urlsArr = root.optJSONArray("downloadUrls")
        val downloadUrls = mutableListOf<DownloadMirror>()
        if (urlsArr != null) {
            for (i in 0 until urlsArr.length()) {
                val item = urlsArr.optJSONObject(i) ?: continue
                val id = item.optString("id", "").trim()
                val label = item.optString("label", "").trim()
                val url = item.optString("url", "").trim()
                val priority = item.optInt("priority", i + 1)
                val localTestBase = if (BuildConfig.DEBUG) BuildConfig.LOCAL_UPDATE_TEST_BASE_URL.trim().trimEnd('/') else ""
                val allowedLocalHttp = localTestBase.startsWith("http://") && url.startsWith("$localTestBase/")
                if (id.isEmpty() || label.isEmpty() || (!url.startsWith("https://") && !allowedLocalHttp)) {
                    return ManifestVerifyResult.Invalid("invalid_download_url_entry")
                }
                downloadUrls.add(DownloadMirror(id, label, url, priority))
            }
        }
        downloadUrls.sortBy { it.priority }

        if (updateEnabled) {
            if (apkSizeBytes < 1024L * 1024L) {
                return ManifestVerifyResult.Invalid("invalid_apk_size")
            }
            if (!HEX_64.matches(sha256)) {
                return ManifestVerifyResult.Invalid("invalid_apk_sha256")
            }
            if (!HEX_64.matches(apkCertSha256)) {
                return ManifestVerifyResult.Invalid("invalid_apk_cert_sha256")
            }
            if (downloadUrls.isEmpty()) {
                return ManifestVerifyResult.Invalid("missing_download_urls")
            }
        }

        val signatureAlgorithm = root.optString("signatureAlgorithm", "")
        if (signatureAlgorithm != UpdateTrustAnchors.SIGNATURE_ALGORITHM) {
            return ManifestVerifyResult.Invalid("unsupported_signature_algorithm")
        }
        val keyId = root.optString("keyId", "").trim()
        val spkiBase64 = trustedKeysSpki[keyId]
            ?: return ManifestVerifyResult.Invalid("untrusted_key_id", keyId)
        val signatureBase64 = root.optString("signature", "").trim()
        if (signatureBase64.length < 64) {
            return ManifestVerifyResult.Invalid("missing_signature")
        }

        val canonicalBytes = canonicalizeJsonObject(root, stripTopSignature = true)
            .toByteArray(StandardCharsets.UTF_8)
        val sigValid = try {
            val spkiBytes = Base64.decode(spkiBase64, Base64.DEFAULT)
            val sigBytes = Base64.decode(signatureBase64, Base64.DEFAULT)
            val publicKey = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(spkiBytes))
            val verifier = Signature.getInstance("SHA256withECDSA")
            verifier.initVerify(publicKey)
            verifier.update(canonicalBytes)
            verifier.verify(sigBytes)
        } catch (e: Exception) {
            return ManifestVerifyResult.Invalid("signature_verification_exception", e.message ?: "")
        }

        if (!sigValid) {
            return ManifestVerifyResult.Invalid("invalid_signature")
        }

        return ManifestVerifyResult.Valid(
            UpdateManifest(
                schemaVersion = schemaVersion,
                appId = appId,
                channel = channel,
                policyRevision = policyRevision,
                policyAction = policyAction,
                updateEnabled = updateEnabled,
                latestVersionName = latestVersionName,
                latestVersionCode = latestVersionCode,
                minSupportedVersionCode = minSupportedVersionCode,
                releaseId = releaseId,
                gitCommit = gitCommit,
                releaseNotes = releaseNotes,
                publishedAt = publishedAt,
                publishedAtEpochMs = publishedAtEpochMs,
                policyExpiresAt = policyExpiresAt,
                policyExpiresAtEpochMs = policyExpiresAtEpochMs,
                offlineGraceHours = offlineGraceHours,
                apkSizeBytes = apkSizeBytes,
                sha256 = sha256,
                apkCertSha256 = apkCertSha256,
                minSdk = minSdk,
                supportedAbis = supportedAbis,
                downloadUrls = downloadUrls,
                signatureAlgorithm = signatureAlgorithm,
                keyId = keyId,
                signature = signatureBase64,
                rawJson = rawJson,
            )
        )
    }

    data class NodeCandidate(val nodeId: String, val rawJson: String)
    data class SelectionOutcome(
        val selectedNodeId: String?,
        val manifest: UpdateManifest?,
        val rejections: List<Pair<String, String>>,
    )

    /**
     * 多节点裁决：仅接受有效签名、渠道一致、未过期且序列号不低于本地已知最大序列号的配置；
     * 在多个合法节点中按最高 `policyRevision`（而非 APK 版本号）选出权威策略，保证紧急解锁可立即覆盖旧强制更新。
     */
    fun selectAuthoritativeManifest(
        candidates: List<NodeCandidate>,
        expectedChannel: String,
        nowMs: Long,
        minAcceptedRevision: Long = 0L,
        trustedKeysSpki: Map<String, String> = UpdateTrustAnchors.TRUSTED_PUBLIC_KEYS_SPKI,
        expectedAppId: String = UpdateTrustAnchors.APP_ID,
    ): SelectionOutcome {
        var bestNode: String? = null
        var bestManifest: UpdateManifest? = null
        val rejections = mutableListOf<Pair<String, String>>()

        for (candidate in candidates) {
            when (val res = verifyManifest(candidate.rawJson, trustedKeysSpki, expectedAppId)) {
                is ManifestVerifyResult.Invalid -> {
                    rejections.add(candidate.nodeId to res.code)
                }
                is ManifestVerifyResult.Valid -> {
                    val m = res.manifest
                    if (m.channel != expectedChannel) {
                        rejections.add(candidate.nodeId to "channel_mismatch")
                        continue
                    }
                    if (m.policyExpiresAtEpochMs <= nowMs) {
                        rejections.add(candidate.nodeId to "policy_expired")
                        continue
                    }
                    if (m.policyRevision < minAcceptedRevision) {
                        rejections.add(candidate.nodeId to "stale_policy_revision_replay")
                        continue
                    }
                    if (bestManifest == null || m.policyRevision > bestManifest.policyRevision) {
                        bestNode = candidate.nodeId
                        bestManifest = m
                    }
                }
            }
        }
        return SelectionOutcome(bestNode, bestManifest, rejections)
    }

    /**
     * 使用整数 `versionCode` 判定当前版本更新策略（禁止使用 versionName 字符串比较）。
     */
    fun evaluateDecision(
        currentVersionCode: Long,
        manifest: UpdateManifest?,
        nowMs: Long,
        lastVerifiedAtMs: Long = nowMs,
    ): UpdateDecision {
        if (manifest == null) return UpdateDecision(UpdateDecisionMode.NONE, "no_manifest")
        if (manifest.policyExpiresAtEpochMs <= nowMs) {
            return UpdateDecision(UpdateDecisionMode.NONE, "policy_expired")
        }
        val graceMs = manifest.offlineGraceHours.toLong() * 3600_000L
        val withinOfflineGrace = (nowMs - lastVerifiedAtMs) <= graceMs

        if (manifest.policyAction == "emergency_unlock") {
            return if (manifest.updateEnabled && currentVersionCode < manifest.latestVersionCode) {
                UpdateDecision(UpdateDecisionMode.OPTIONAL_UPDATE, "emergency_unlocked_optional", manifest)
            } else {
                UpdateDecision(UpdateDecisionMode.NONE, "emergency_unlocked", manifest)
            }
        }

        val belowMinSupported = currentVersionCode < manifest.minSupportedVersionCode
        if (belowMinSupported && manifest.updateEnabled) {
            return if (withinOfflineGrace) {
                UpdateDecision(UpdateDecisionMode.FORCE_UPDATE, "below_min_supported_version_code", manifest)
            } else {
                // 长期离线本地音乐用户超过离线宽限期后，降级为普通提醒，避免永久锁死离线播放能力。
                UpdateDecision(UpdateDecisionMode.OPTIONAL_UPDATE, "offline_grace_exceeded", manifest)
            }
        }

        if (manifest.policyAction == "pause" || !manifest.updateEnabled) {
            return UpdateDecision(UpdateDecisionMode.NONE, "updates_paused_or_disabled", manifest)
        }

        if (currentVersionCode < manifest.latestVersionCode) {
            return UpdateDecision(UpdateDecisionMode.OPTIONAL_UPDATE, "newer_version_available", manifest)
        }

        return UpdateDecision(UpdateDecisionMode.NONE, "up_to_date", manifest)
    }
}
