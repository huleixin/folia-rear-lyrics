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
import java.nio.charset.StandardCharsets
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PrivateBetaUpdateTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences("tingyu_native_update_state_v1", Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences("tingyu_private_beta_auth_v1", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun ordinaryUserCannotSwitchToPrivateBetaOrTesting() {
        val manager = UpdateManager(context)
        assertEquals("stable", manager.state.value.channel)
        assertFalse(manager.state.value.betaAuthorized)

        manager.switchChannel("private_beta")
        assertEquals("stable", manager.state.value.channel)
        assertFalse(manager.state.value.betaAuthorized)

        manager.switchChannel("testing")
        assertEquals("stable", manager.state.value.channel)
    }

    @Test
    fun legacyTestingUserMigratesToStableWithoutTouchingOtherPrefs() {
        val store = UpdateStateStore(context)
        store.setPreferredChannel("testing")
        store.saveVerifiedApkRecord(299L, "a".repeat(64), "/tmp/nonexistent-legacy.apk")

        val unrelatedPrefs = context.getSharedPreferences("tingyu_unrelated_user_prefs", Context.MODE_PRIVATE)
        unrelatedPrefs.edit().putString("favorite_sync", "preserved").commit()

        val manager = UpdateManager(context)
        assertEquals("stable", manager.state.value.channel)
        assertEquals("stable", store.getPreferredChannel("stable"))
        assertNull(store.loadVerifiedApkRecord())
        assertEquals("preserved", unrelatedPrefs.getString("favorite_sync", null))
    }

    @Test
    fun authorizedBetaUserPersistsChannelAndLeaveRevertsToStable() {
        val authStore = BetaAuthStore(context)
        val now = System.currentTimeMillis()
        authStore.saveAuthorization(
            BetaAuthorizationRecord(
                deviceId = "dev_test_001",
                deviceToken = "tok_secret_value_123",
                role = "tester",
                note = "QA phone",
                activatedAtMs = now - 1000L,
                expiresAtMs = now + 30L * 86400_000L,
                lastVerifiedAtMs = now,
            )
        )

        val manager1 = UpdateManager(context)
        assertTrue(manager1.state.value.betaAuthorized)
        assertEquals("tester", manager1.state.value.betaRole)

        manager1.switchChannel("private_beta")
        assertEquals("private_beta", manager1.state.value.channel)

        // Simulate app restart
        val manager2 = UpdateManager(context)
        assertTrue(manager2.state.value.betaAuthorized)
        assertEquals("private_beta", manager2.state.value.channel)

        // Revocation clears beta auth, caches, and reverts cleanly to stable without network blocking
        manager2.handleBetaAuthorizationRevoked(triggerCheck = false)
        assertFalse(manager2.state.value.betaAuthorized)
        assertEquals("stable", manager2.state.value.channel)
        assertNull(authStore.loadAuthorization())
    }

    @Test
    fun higherVersionBetaDoesNotDowngradeAgainstLowerStableManifest() {
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        val kp = kpg.generateKeyPair()
        val spki = Base64.encodeToString(kp.public.encoded, Base64.NO_WRAP)
        val now = System.currentTimeMillis()

        val unsigned = JSONObject().apply {
            put("schemaVersion", 1)
            put("appId", UpdateTrustAnchors.APP_ID)
            put("channel", "stable")
            put("policyRevision", 10L)
            put("policyAction", "normal")
            put("updateEnabled", true)
            put("latestVersionName", "1.5.84")
            put("latestVersionCode", 300L)
            put("minSupportedVersionCode", 300L)
            put("releaseId", "rel-stable-1.5.84-300")
            put("gitCommit", "abc12345")
            put("releaseNotes", "Stable baseline")
            put("publishedAt", "2026-11-19T00:00:00Z")
            put("publishedAtEpochMs", now - 60_000L)
            put("policyExpiresAt", "2026-12-19T00:00:00Z")
            put("policyExpiresAtEpochMs", now + 30L * 86400_000L)
            put("offlineGraceHours", 168)
            put("apkSizeBytes", 1024L * 1024L)
            put("sha256", "b".repeat(64))
            put("apkCertSha256", UpdateTrustAnchors.EXPECTED_RELEASE_CERT_SHA256)
            put("minSdk", 24)
            put("supportedAbis", JSONArray(listOf("arm64-v8a")))
            put(
                "downloadUrls",
                JSONArray().put(
                    JSONObject()
                        .put("id", "cnb")
                        .put("label", "CNB")
                        .put("url", "https://cnb.cool/tingyu-2026/releases/-/releases/download/v1.5.84/tingyu-1.5.84-release.apk")
                        .put("priority", 1)
                )
            )
            put("signatureAlgorithm", UpdateTrustAnchors.SIGNATURE_ALGORITHM)
            put("keyId", "k-test")
        }
        val canonical = UpdatePolicy.canonicalizeJsonObject(unsigned, stripTopSignature = true)
        val sig = Signature.getInstance("SHA256withECDSA").apply {
            initSign(kp.private)
            update(canonical.toByteArray(StandardCharsets.UTF_8))
        }.sign()
        unsigned.put("signature", Base64.encodeToString(sig, Base64.NO_WRAP))

        val verifyResult = UpdatePolicy.verifyManifest(
            rawJson = unsigned.toString(),
            trustedKeysSpki = mapOf("k-test" to spki),
            expectedAppId = UpdateTrustAnchors.APP_ID,
        )
        assertTrue("Expected valid manifest, got $verifyResult", verifyResult is ManifestVerifyResult.Valid)
        val verified = verifyResult as ManifestVerifyResult.Valid

        // Beta device installed 1.5.85-beta (versionCode 305) reverting to stable (300) must NOT prompt downgrade/update
        val decision = UpdatePolicy.evaluateDecision(
            currentVersionCode = 305L,
            manifest = verified.manifest,
            nowMs = System.currentTimeMillis(),
            lastVerifiedAtMs = System.currentTimeMillis(),
        )
        assertEquals(UpdateDecisionMode.NONE, decision.mode)
    }

    @Test
    fun betaAuthStoreGeneratesIndependentInstallIdAndVerifiablePop() {
        val store = BetaAuthStore(context)
        val id1 = store.getOrCreateBetaInstallId()
        val id2 = BetaAuthStore(context).getOrCreateBetaInstallId()
        assertEquals(id1, id2)
        assertTrue(id1.matches(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")))

        val spkiB64 = store.getOrCreateDevicePublicKeySpki()
        val payload = "POST\n/api/beta/policy\n1795000000000\nnonce123"
        val sigB64 = store.signPopPayload(payload)

        val pubKey = KeyFactory.getInstance("EC")
            .generatePublic(X509EncodedKeySpec(Base64.decode(spkiB64, Base64.NO_WRAP)))
        val verifier = Signature.getInstance("SHA256withECDSA")
        verifier.initVerify(pubKey)
        verifier.update(payload.toByteArray(StandardCharsets.UTF_8))
        assertTrue(verifier.verify(Base64.decode(sigB64, Base64.NO_WRAP)))
    }
}
