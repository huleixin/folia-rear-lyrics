package io.github.huleixin.tingyu.lx

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

// lx.utils —— 洛雪移动版协议里脚本能用的那几个工具，逐一照协议实现。
//
// 只做脚本解析音源真正需要的事：字节与字符串互转、md5、随机字节、AES。
// 不提供任何文件、进程、反射或 Android 能力，也不接受脚本传来的任意类名或算法名。
object LxUtility {

    private const val MAX_BYTES = 1_048_576
    private val RANDOM = SecureRandom()

    /** 输入 {"op":..., "args":[...]}，输出 {"value":...} 或 {"error":...}。 */
    fun handle(input: String): String = try {
        val root = JSONObject(input)
        val op = root.optString("op")
        val args = root.optJSONArray("args") ?: JSONArray()
        when (op) {
            "buffer" -> ok(bytesToJson(from(args.opt(0), args.optString(1, "utf8"))))
            "string" -> ok(toStringValue(bytes(args.opt(0)), args.optString(1, "utf8")))
            "md5" -> ok(md5(md5Input(args.opt(0))))
            "random" -> ok(bytesToJson(randomBytes(args.opt(0))))
            "aes" -> ok(bytesToJson(aesEncrypt(
                bytes(args.opt(0)),
                args.optString(1).lowercase(Locale.US),
                bytes(args.opt(2)),
                bytes(args.opt(3)))))
            "btoa" -> ok(encodeBase64(utf8(args.opt(0).toString())))
            "atob" -> ok(String(decodeBase64(args.opt(0).toString()), Charsets.UTF_8))
            else -> error("Unsupported LX utility: $op")
        }
    } catch (failure: Throwable) {
        error(failure.message ?: failure.javaClass.simpleName)
    }

    // ------------------------------------------------------------------ conversions

    private fun from(value: Any?, format: String): ByteArray = when (value) {
        is JSONArray -> bytes(value)
        is ByteArray -> value
        is Number -> byteArrayOf(value.toByte())
        null -> ByteArray(0)
        else -> {
            val text = value.toString()
            when (format.lowercase(Locale.US)) {
                "hex" -> decodeHex(text)
                "base64" -> decodeBase64(text)
                else -> utf8(text)
            }
        }
    }

    private fun bytes(value: Any?): ByteArray {
        if (value is ByteArray) return value
        if (value !is JSONArray) return ByteArray(0)
        val size = minOf(value.length(), MAX_BYTES)
        val out = ByteArray(size)
        for (i in 0 until size) {
            val item = value.opt(i)
            out[i] = when (item) {
                is Number -> item.toInt().toByte()
                is String -> item.toIntOrNull()?.toByte() ?: 0
                else -> 0
            }
        }
        return out
    }

    private fun toStringValue(data: ByteArray, format: String): String = when (format.lowercase(Locale.US)) {
        "hex" -> encodeHex(data)
        "base64" -> encodeBase64(data)
        else -> String(data, Charsets.UTF_8)
    }

    private fun utf8(text: String) = text.toByteArray(Charsets.UTF_8)

    private fun bytesToJson(data: ByteArray): JSONArray {
        val out = JSONArray()
        for (byte in data) out.put(byte.toInt() and 0xFF)
        return out
    }

    // ------------------------------------------------------------------ crypto

    private fun md5Input(value: Any?): ByteArray = when (value) {
        is JSONArray -> bytes(value)
        is ByteArray -> value
        null -> ByteArray(0)
        else -> utf8(value.toString())
    }

    fun md5(data: ByteArray): String = encodeHex(MessageDigest.getInstance("MD5").digest(data))

    fun randomBytes(size: Any?): ByteArray {
        val count = when (size) {
            is Number -> size.toInt()
            is String -> size.toIntOrNull() ?: 0
            else -> 0
        }
        if (count < 0 || count > 4096) throw IllegalArgumentException("randomBytes size invalid")
        val out = ByteArray(count)
        RANDOM.nextBytes(out)
        return out
    }

    private val AES_MODES = setOf("aes-128-cbc", "aes-128-ecb", "aes-256-cbc", "aes-256-ecb")

    fun aesEncrypt(data: ByteArray, mode: String, key: ByteArray, iv: ByteArray): ByteArray {
        if (!AES_MODES.contains(mode)) throw IllegalArgumentException("AES mode unsupported")
        if (key.size != 16 && key.size != 32) throw IllegalArgumentException("AES key size unsupported")
        val ecb = mode.endsWith("ecb")
        val transformation = if (ecb) "AES/ECB/PKCS5Padding" else "AES/CBC/PKCS5Padding"
        val cipher = Cipher.getInstance(transformation)
        val secret = SecretKeySpec(key, "AES")
        if (ecb) cipher.init(Cipher.ENCRYPT_MODE, secret)
        else cipher.init(Cipher.ENCRYPT_MODE, secret, IvParameterSpec(padIv(iv, key.size)))
        return cipher.doFinal(data)
    }

    private fun padIv(iv: ByteArray, size: Int): ByteArray {
        if (iv.size >= size) return iv.copyOf(size)
        return ByteArray(size).also { iv.copyInto(it) }
    }

    // ------------------------------------------------------------------ codecs

    fun encodeHex(data: ByteArray): String {
        val out = StringBuilder(data.size * 2)
        for (byte in data) out.append(HEX[(byte.toInt() shr 4) and 0xF]).append(HEX[byte.toInt() and 0xF])
        return out.toString()
    }

    private fun decodeHex(text: String): ByteArray {
        val clean = text.filter { it.isDigit() || it in 'a'..'f' || it in 'A'..'F' }
        if (clean.length % 2 != 0) throw IllegalArgumentException("hex length invalid")
        val out = ByteArray(clean.length / 2)
        for (i in out.indices) out[i] = clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        return out
    }

    fun encodeBase64(data: ByteArray): String = java.util.Base64.getEncoder().encodeToString(data)

    fun decodeBase64(text: String): ByteArray = java.util.Base64.getDecoder().decode(text)

    private const val HEX = "0123456789abcdef"

    private fun ok(value: Any): String = JSONObject().put("value", value).toString()
    private fun error(message: String): String = JSONObject().put("error", message).toString()
}
