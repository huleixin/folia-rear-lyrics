package io.github.huleixin.tingyu.update

import android.content.Context
import android.util.Base64
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.nio.charset.StandardCharsets
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec

// android/app/src/test/java/io/github/huleixin/tingyu/update/UpdateSystemTest.kt
// Android 原生更新系统完整单测：ECDSA-P256 验签、防重放、多节点裁决、离线宽限、暂停/紧急解除、七重 APK 校验与持久化恢复。

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class UpdateSystemTest {
    private lateinit var context: Context
    private lateinit var keyPair: KeyPair
    private lateinit var trustedKeys: Map<String, String>
    private val keyId = "test-policy-k1"
    private val baseNow = 1_795_000_000_000L

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        keyPair = kpg.generateKeyPair()
        val spkiB64 = Base64.encodeToString(keyPair.public.encoded, Base64.NO_WRAP)
        trustedKeys = mapOf(keyId to spkiB64)
    }

    private fun buildSignedManifestJson(
        policyRevision: Long = 1L,
        policyAction: String = "normal",
        updateEnabled: Boolean = true,
        latestVersionName: String = "1.5.79",
        latestVersionCode: Long = 294L,
        minSupportedVersionCode: Long = 290L,
        channel: String = "stable",
        publishedAtMs: Long = baseNow - 60_000L,
        expiresAtMs: Long = baseNow + 30L * 86400_000L,
        offlineGraceHours: Int = 168,
        apkSizeBytes: Long = 4096L * 1024L,
        sha256: String = "a".repeat(64),
        certSha256: String = UpdateTrustAnchors.EXPECTED_RELEASE_CERT_SHA256,
        minSdk: Int = 24,
        abis: List<String> = listOf("arm64-v8a", "armeabi-v7a"),
        signingKey: KeyPair = keyPair,
        signingKeyId: String = keyId,
    ): String {
        val obj = JSONObject().apply {
            put("schemaVersion", 1)
            put("appId", UpdateTrustAnchors.APP_ID)
            put("channel", channel)
            put("policyRevision", policyRevision)
            put("policyAction", policyAction)
            put("updateEnabled", updateEnabled)
            put("latestVersionName", latestVersionName)
            put("latestVersionCode", latestVersionCode)
            put("minSupportedVersionCode", minSupportedVersionCode)
            put("releaseId", "rel-$latestVersionName-$latestVersionCode")
            put("gitCommit", "48511843")
            put("releaseNotes", "1. 新增原生软件内更新\n2. 支持 CNB 与 GitHub 双节点容灾")
            put("publishedAt", "2026-11-18T02:00:00Z")
            put("publishedAtEpochMs", publishedAtMs)
            put("policyExpiresAt", "2026-12-18T02:00:00Z")
            put("policyExpiresAtEpochMs", expiresAtMs)
            put("offlineGraceHours", offlineGraceHours)
            put("apkSizeBytes", apkSizeBytes)
            put("sha256", sha256)
            put("apkCertSha256", certSha256)
            put("minSdk", minSdk)
            put("supportedAbis", JSONArray(abis))
            put(
                "downloadUrls",
                JSONArray()
                    .put(JSONObject().put("id", "cnb").put("label", "CNB 国内节点").put("url", "https://cnb.cool/tingyu-2026/releases/-/releases/download/v1.5.79/tingyu-1.5.79-release.apk").put("priority", 1))
                    .put(JSONObject().put("id", "github").put("label", "GitHub 备用节点").put("url", "https://github.com/huleixin/folia-rear-lyrics/releases/download/v1.5.79/tingyu-1.5.79-release.apk").put("priority", 2)),
            )
            put("signatureAlgorithm", UpdateTrustAnchors.SIGNATURE_ALGORITHM)
            put("keyId", signingKeyId)
        }
        val canonical = UpdatePolicy.canonicalizeJsonObject(obj, stripTopSignature = true)
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(signingKey.private)
        signer.update(canonical.toByteArray(StandardCharsets.UTF_8))
        val sigB64 = Base64.encodeToString(signer.sign(), Base64.NO_WRAP)
        obj.put("signature", sigB64)
        return obj.toString()
    }

    @Test
    fun `verifies valid ECDSA-P256 manifest and rejects tampered fields or untrusted key`() {
        val validJson = buildSignedManifestJson()
        val verified = UpdatePolicy.verifyManifest(validJson, trustedKeys)
        assertTrue("Expected valid manifest, got $verified", verified is ManifestVerifyResult.Valid)

        // 篡改 minSupportedVersionCode (290 -> 293, <= latest 294) 企图伪造强制更新 -> 签名必须立即拒绝
        val tamperedObj = JSONObject(validJson).put("minSupportedVersionCode", 293L)
        val tamperedRes = UpdatePolicy.verifyManifest(tamperedObj.toString(), trustedKeys)
        assertTrue(tamperedRes is ManifestVerifyResult.Invalid)
        assertEquals("invalid_signature", (tamperedRes as ManifestVerifyResult.Invalid).code)

        // 未知 keyId -> 拒绝
        val unknownKeyJson = buildSignedManifestJson(signingKeyId = "attacker-key")
        val unknownRes = UpdatePolicy.verifyManifest(unknownKeyJson, trustedKeys)
        assertTrue(unknownRes is ManifestVerifyResult.Invalid)
        assertEquals("untrusted_key_id", (unknownRes as ManifestVerifyResult.Invalid).code)
    }

    @Test
    fun `evaluates none, optional, force, pause, emergency unlock and versionCode integer comparison`() {
        // 即使 versionName 字典序看似更小（如 "1.5.9" vs "1.5.78"），只按整数 versionCode 比较
        val optionalJson = buildSignedManifestJson(
            latestVersionName = "1.5.9",
            latestVersionCode = 300L,
            minSupportedVersionCode = 290L,
        )
        val optionalManifest = (UpdatePolicy.verifyManifest(optionalJson, trustedKeys) as ManifestVerifyResult.Valid).manifest

        // 无更新 (current = 300)
        assertEquals(UpdateDecisionMode.NONE, UpdatePolicy.evaluateDecision(300L, optionalManifest, baseNow).mode)
        // 普通更新 (current = 293 >= min 290, < latest 300)
        assertEquals(UpdateDecisionMode.OPTIONAL_UPDATE, UpdatePolicy.evaluateDecision(293L, optionalManifest, baseNow).mode)
        // 强制更新 (current = 285 < min 290)
        assertEquals(UpdateDecisionMode.FORCE_UPDATE, UpdatePolicy.evaluateDecision(285L, optionalManifest, baseNow).mode)

        // 暂停推送 (pause)：普通更新停止弹窗推送
        val pausedJson = buildSignedManifestJson(policyAction = "pause", latestVersionCode = 300L, minSupportedVersionCode = 290L)
        val pausedManifest = (UpdatePolicy.verifyManifest(pausedJson, trustedKeys) as ManifestVerifyResult.Valid).manifest
        assertEquals(UpdateDecisionMode.NONE, UpdatePolicy.evaluateDecision(293L, pausedManifest, baseNow).mode)

        // 紧急解除强制更新 (emergency_unlock)：即使旧客户端原本被锁，立即解除强制拦截
        val unlockJson = buildSignedManifestJson(
            policyRevision = 5L,
            policyAction = "emergency_unlock",
            updateEnabled = false,
            latestVersionCode = 300L,
            minSupportedVersionCode = 1L,
        )
        val unlockManifest = (UpdatePolicy.verifyManifest(unlockJson, trustedKeys) as ManifestVerifyResult.Valid).manifest
        assertEquals(UpdateDecisionMode.NONE, UpdatePolicy.evaluateDecision(285L, unlockManifest, baseNow).mode)
    }

    @Test
    fun `multi-node selection chooses highest policyRevision and blocks replay or expired policies`() {
        val oldForce = buildSignedManifestJson(
            policyRevision = 10L,
            policyAction = "normal",
            latestVersionCode = 295L,
            minSupportedVersionCode = 295L,
        )
        val newerEmergencyUnlock = buildSignedManifestJson(
            policyRevision = 11L,
            policyAction = "emergency_unlock",
            updateEnabled = false,
            latestVersionCode = 295L,
            minSupportedVersionCode = 1L,
        )
        val expiredHighRev = buildSignedManifestJson(
            policyRevision = 99L,
            expiresAtMs = baseNow - 1000L,
        )

        val selection = UpdatePolicy.selectAuthoritativeManifest(
            candidates = listOf(
                UpdatePolicy.NodeCandidate("stale-cdn", oldForce),
                UpdatePolicy.NodeCandidate("live-edge", newerEmergencyUnlock),
                UpdatePolicy.NodeCandidate("expired-node", expiredHighRev),
            ),
            expectedChannel = "stable",
            nowMs = baseNow,
            minAcceptedRevision = 10L,
            trustedKeysSpki = trustedKeys,
        )

        assertEquals("live-edge", selection.selectedNodeId)
        assertEquals(11L, selection.manifest?.policyRevision)
        assertEquals("emergency_unlock", selection.manifest?.policyAction)

        // 重放旧序列号 (revision 10 < minAcceptedRevision 11) 必须被拒绝
        val replayCheck = UpdatePolicy.selectAuthoritativeManifest(
            candidates = listOf(UpdatePolicy.NodeCandidate("replay-attacker", oldForce)),
            expectedChannel = "stable",
            nowMs = baseNow,
            minAcceptedRevision = 11L,
            trustedKeysSpki = trustedKeys,
        )
        assertNull(replayCheck.manifest)
        assertTrue(replayCheck.rejections.any { it.second == "stale_policy_revision_replay" })
    }

    @Test
    fun `offline grace degrades force update to optional after grace window so offline local users are never bricked`() {
        val forceJson = buildSignedManifestJson(
            latestVersionCode = 300L,
            minSupportedVersionCode = 295L,
            offlineGraceHours = 48,
        )
        val manifest = (UpdatePolicy.verifyManifest(forceJson, trustedKeys) as ManifestVerifyResult.Valid).manifest

        // 离线 24 小时内：仍执行强制更新
        val after24h = baseNow + 24L * 3600_000L
        assertEquals(
            UpdateDecisionMode.FORCE_UPDATE,
            UpdatePolicy.evaluateDecision(293L, manifest, nowMs = after24h, lastVerifiedAtMs = baseNow).mode,
        )

        // 离线超过 48 小时宽限期（如纯离线本地音乐设备）：自动降级为普通提醒，不锁死用户
        val after72h = baseNow + 72L * 3600_000L
        assertEquals(
            UpdateDecisionMode.OPTIONAL_UPDATE,
            UpdatePolicy.evaluateDecision(293L, manifest, nowMs = after72h, lastVerifiedAtMs = baseNow).mode,
        )
    }

    @Test
    fun `state store persists verified policy, re-verifies signature on cold start, and manages snooze`() {
        val store = UpdateStateStore(context)
        val validJson = buildSignedManifestJson(policyRevision = 7L, latestVersionCode = 298L, minSupportedVersionCode = 295L)
        val manifest = (UpdatePolicy.verifyManifest(validJson, trustedKeys) as ManifestVerifyResult.Valid).manifest

        store.saveVerifiedPolicy(manifest, baseNow)
        val loaded = store.loadVerifiedPolicy("stable", trustedKeys)
        assertNotNull(loaded)
        assertEquals(7L, loaded?.highestPolicyRevision)
        assertEquals(298L, loaded?.manifest?.latestVersionCode)

        // 篡改本地 SharedPreferences 里的 JSON -> 冷启动重验签直接拒绝
        val corruptedJson = JSONObject(validJson).put("minSupportedVersionCode", 297L).toString()
        context.getSharedPreferences("tingyu_native_update_state_v1", Context.MODE_PRIVATE)
            .edit()
            .putString("verified_manifest_json:stable", corruptedJson)
            .commit()
        assertNull(store.loadVerifiedPolicy("stable", trustedKeys))

        // 普通更新稍后提醒冷却
        store.snoozeOptionalUpdate(298L, baseNow + 3600_000L)
        assertTrue(store.isOptionalUpdateSnoozed(298L, baseNow + 1000L))
        assertFalse(store.isOptionalUpdateSnoozed(298L, baseNow + 7200_000L))
    }

    @Test
    fun `apk verifier blocks missing, size mismatch, and sha256 mismatch files before installation`() {
        val tempApk = File(context.cacheDir, "candidate-test.apk")
        tempApk.writeBytes(ByteArray(2 * 1024 * 1024) { 0x42 })
        val realSha = ApkVerifier.computeFileSha256(tempApk)

        // 1. 大小不符
        val wrongSizeManifest = (UpdatePolicy.verifyManifest(
            buildSignedManifestJson(apkSizeBytes = 3 * 1024 * 1024L, sha256 = realSha),
            trustedKeys,
        ) as ManifestVerifyResult.Valid).manifest
        val sizeRes = ApkVerifier.verifyDownloadedApk(context, tempApk, wrongSizeManifest, 293L)
        assertEquals("size_mismatch", (sizeRes as ApkVerifyResult.Invalid).code)

        // 2. SHA-256 摘要不符
        val wrongShaManifest = (UpdatePolicy.verifyManifest(
            buildSignedManifestJson(apkSizeBytes = 2 * 1024 * 1024L, sha256 = "b".repeat(64)),
            trustedKeys,
        ) as ManifestVerifyResult.Valid).manifest
        val shaRes = ApkVerifier.verifyDownloadedApk(context, tempApk, wrongShaManifest, 293L)
        assertEquals("sha256_mismatch", (shaRes as ApkVerifyResult.Invalid).code)

        // 3. 非法 APK 压缩包结构拦截
        val corruptArchiveManifest = (UpdatePolicy.verifyManifest(
            buildSignedManifestJson(apkSizeBytes = 2 * 1024 * 1024L, sha256 = realSha),
            trustedKeys,
        ) as ManifestVerifyResult.Valid).manifest
        val archiveRes = ApkVerifier.verifyDownloadedApk(context, tempApk, corruptArchiveManifest, 293L)
        assertEquals("invalid_apk_archive", (archiveRes as ApkVerifyResult.Invalid).code)

        tempApk.delete()
    }
}
