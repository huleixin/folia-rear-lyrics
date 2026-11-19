package io.github.huleixin.tingyu.update

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// android/app/src/main/java/io/github/huleixin/tingyu/update/BetaAuthStore.kt
// 私有内测设备凭据与密钥存储：
// 1. 独立随机 beta_install_id（绝不与 TelemetryManager 的统计 ID 混用，绝不采集硬件标识或音乐账号）。
// 2. 使用 Android Keystore 生成不可导出的 ECDSA P-256 设备密钥对用于服务端 PoP 验签，并使用 AES-256-GCM 加密保存设备令牌。
// 3. 仅在 JVM Robolectric 无 AndroidKeyStore 环境自动降级为内存/测试密钥以便自动化测试，真机强制优先使用 Keystore。

data class BetaAuthorizationRecord(
    val deviceId: String,
    val deviceToken: String,
    val role: String, // "developer" | "tester"
    val note: String,
    val activatedAtMs: Long,
    val expiresAtMs: Long, // 0 = 长期有效
    val lastVerifiedAtMs: Long,
) {
    fun isCurrentlyValid(nowMs: Long = System.currentTimeMillis()): Boolean =
        deviceId.isNotBlank() && deviceToken.isNotBlank() && (expiresAtMs == 0L || expiresAtMs > nowMs)
}

class BetaAuthStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun getOrCreateBetaInstallId(): String {
        val existing = prefs.getString(KEY_BETA_INSTALL_ID, null)
        if (!existing.isNullOrBlank() && UUID_V4_REGEX.matches(existing)) {
            return existing
        }
        val generated = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_BETA_INSTALL_ID, generated).apply()
        return generated
    }

    @Synchronized
    fun getOrCreateDevicePublicKeySpki(): String {
        return getOrCreateEcKeyPair().spkiBase64
    }

    @Synchronized
    fun signPopPayload(payload: String): String {
        val kp = getOrCreateEcKeyPair()
        val sig = Signature.getInstance("SHA256withECDSA")
        sig.initSign(kp.privateKey)
        sig.update(payload.toByteArray(StandardCharsets.UTF_8))
        return Base64.encodeToString(sig.sign(), Base64.NO_WRAP)
    }

    fun saveAuthorization(record: BetaAuthorizationRecord) {
        val encryptedToken = encryptToken(record.deviceToken)
        prefs.edit()
            .putString(KEY_DEVICE_ID, record.deviceId)
            .putString(KEY_DEVICE_TOKEN_ENC, encryptedToken)
            .putString(KEY_ROLE, record.role)
            .putString(KEY_NOTE, record.note)
            .putLong(KEY_ACTIVATED_AT, record.activatedAtMs)
            .putLong(KEY_EXPIRES_AT, record.expiresAtMs)
            .putLong(KEY_LAST_VERIFIED_AT, record.lastVerifiedAtMs)
            .apply()
    }

    fun loadAuthorization(): BetaAuthorizationRecord? {
        val deviceId = prefs.getString(KEY_DEVICE_ID, null)?.trim().orEmpty()
        val encToken = prefs.getString(KEY_DEVICE_TOKEN_ENC, null)?.trim().orEmpty()
        if (deviceId.isEmpty() || encToken.isEmpty()) return null
        val token = decryptToken(encToken) ?: return null
        return BetaAuthorizationRecord(
            deviceId = deviceId,
            deviceToken = token,
            role = prefs.getString(KEY_ROLE, "tester") ?: "tester",
            note = prefs.getString(KEY_NOTE, "") ?: "",
            activatedAtMs = prefs.getLong(KEY_ACTIVATED_AT, 0L),
            expiresAtMs = prefs.getLong(KEY_EXPIRES_AT, 0L),
            lastVerifiedAtMs = prefs.getLong(KEY_LAST_VERIFIED_AT, 0L),
        )
    }

    fun updateLastVerifiedAt(atMs: Long, expiresAtMs: Long? = null, role: String? = null, note: String? = null) {
        val editor = prefs.edit().putLong(KEY_LAST_VERIFIED_AT, atMs)
        if (expiresAtMs != null) editor.putLong(KEY_EXPIRES_AT, expiresAtMs)
        if (!role.isNullOrBlank()) editor.putString(KEY_ROLE, role)
        if (note != null) editor.putString(KEY_NOTE, note)
        editor.apply()
    }

    fun clearAuthorization() {
        prefs.edit()
            .remove(KEY_DEVICE_ID)
            .remove(KEY_DEVICE_TOKEN_ENC)
            .remove(KEY_ROLE)
            .remove(KEY_NOTE)
            .remove(KEY_ACTIVATED_AT)
            .remove(KEY_EXPIRES_AT)
            .remove(KEY_LAST_VERIFIED_AT)
            .apply()
    }

    private data class EcKeyBundle(val privateKey: PrivateKey, val spkiBase64: String)

    @Volatile
    private var fallbackKeyPair: KeyPair? = null

    private fun getOrCreateEcKeyPair(): EcKeyBundle {
        // 优先使用 AndroidKeyStore 硬件/系统隔离私钥
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val existingPriv = ks.getKey(EC_KEY_ALIAS, null) as? PrivateKey
            val existingCert = ks.getCertificate(EC_KEY_ALIAS)
            if (existingPriv != null && existingCert != null) {
                val spki = Base64.encodeToString(existingCert.publicKey.encoded, Base64.NO_WRAP)
                return EcKeyBundle(existingPriv, spki)
            }
            val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
            kpg.initialize(
                KeyGenParameterSpec.Builder(EC_KEY_ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                    .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build()
            )
            val pair = kpg.generateKeyPair()
            return EcKeyBundle(pair.private, Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP))
        } catch (_: Throwable) {
            // 仅在 Robolectric 等无 AndroidKeyStore 的 JVM 测试环境降级
            val kp = fallbackKeyPair ?: KeyPairGenerator.getInstance("EC").apply {
                initialize(ECGenParameterSpec("secp256r1"))
            }.generateKeyPair().also { fallbackKeyPair = it }
            return EcKeyBundle(kp.private, Base64.encodeToString(kp.public.encoded, Base64.NO_WRAP))
        }
    }

    private fun getOrCreateAesKey(): SecretKey? = try {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = ks.getKey(AES_KEY_ALIAS, null) as? SecretKey
        if (existing != null) existing
        else {
            val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            kg.init(
                KeyGenParameterSpec.Builder(AES_KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
            kg.generateKey()
        }
    } catch (_: Throwable) {
        null
    }

    private fun encryptToken(plain: String): String {
        val key = getOrCreateAesKey()
        if (key != null) {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val iv = cipher.iv
            val enc = cipher.doFinal(plain.toByteArray(StandardCharsets.UTF_8))
            val combined = ByteArray(iv.size + enc.size)
            System.arraycopy(iv, 0, combined, 0, iv.size)
            System.arraycopy(enc, 0, combined, iv.size, enc.size)
            return "ks:" + Base64.encodeToString(combined, Base64.NO_WRAP)
        }
        return "raw:" + Base64.encodeToString(plain.toByteArray(StandardCharsets.UTF_8), Base64.NO_WRAP)
    }

    private fun decryptToken(encoded: String): String? = try {
        if (encoded.startsWith("ks:")) {
            val key = getOrCreateAesKey() ?: return null
            val payload = Base64.decode(encoded.removePrefix("ks:"), Base64.NO_WRAP)
            if (payload.size <= 12) return null
            val iv = payload.copyOfRange(0, 12)
            val ct = payload.copyOfRange(12, payload.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
            String(cipher.doFinal(ct), StandardCharsets.UTF_8)
        } else if (encoded.startsWith("raw:")) {
            String(Base64.decode(encoded.removePrefix("raw:"), Base64.NO_WRAP), StandardCharsets.UTF_8)
        } else {
            null
        }
    } catch (_: Throwable) {
        null
    }

    companion object {
        internal const val PREFS_NAME = "tingyu_beta_auth_v1"
        private const val EC_KEY_ALIAS = "tingyu_beta_pop_ec_v1"
        private const val AES_KEY_ALIAS = "tingyu_beta_token_aes_v1"

        private const val KEY_BETA_INSTALL_ID = "beta_install_id"
        private const val KEY_DEVICE_ID = "beta_device_id"
        private const val KEY_DEVICE_TOKEN_ENC = "beta_device_token_enc"
        private const val KEY_ROLE = "beta_role"
        private const val KEY_NOTE = "beta_note"
        private const val KEY_ACTIVATED_AT = "beta_activated_at"
        private const val KEY_EXPIRES_AT = "beta_expires_at"
        private const val KEY_LAST_VERIFIED_AT = "beta_last_verified_at"

        private val UUID_V4_REGEX = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
    }
}
