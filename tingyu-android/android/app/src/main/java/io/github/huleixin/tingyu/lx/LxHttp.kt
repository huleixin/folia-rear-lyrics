package io.github.huleixin.tingyu.lx

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.IDN
import java.net.URI
import java.util.Locale
import java.util.concurrent.TimeUnit

// 脚本的 lx.request —— 底层走 OkHttp，规则与 WebView 侧 http.ts 逐一对应。
//
// 边界（这一条比"能不能用"更重要）：
// - 只认公网 http(s)，userinfo、内网、localhost、本机代理端口一律拒绝；
// - cookie / host / origin 三个头不给脚本设置（与 http.ts 同规则），避免脚本冒充；
// - 单次请求体 ≤1MB、响应 ≤2MB、重定向 ≤5 跳且跨域时剥掉授权头；
// - 不携带任何本应用的用户凭据，脚本拿什么头自己给。
object LxHttp {

    private const val MAX_BODY = 1_048_576
    private const val MAX_RESPONSE = 2_097_152
    private const val MAX_REDIRECTS = 5
    private val METHODS = setOf("GET", "POST", "PUT", "DELETE", "PATCH", "HEAD")
    private val BLOCKED_HEADERS = setOf("cookie", "host", "origin")
    private val SENSITIVE_HEADERS = setOf("authorization", "cookie", "x-token")

    private val CLIENT = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .build()

    /**
     * 执行脚本的一次请求，返回交给 JS 的 JSON 文本：{statusCode, headers, body}。
     * 失败直接抛，由引擎映射成脚本回调里的 err。
     */
    fun request(rawUrl: String, options: JSONObject): String {
        val url = validateUrl(rawUrl)
        val headers = LinkedHashMap<String, String>()
        val declared = options.opt("headers")
        if (declared is JSONObject) {
            val keys = declared.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                if (!BLOCKED_HEADERS.contains(key.lowercase(Locale.US))) headers[key] = declared.opt(key).toString()
            }
        }
        val timeout = clamp(options.opt("timeout"), 1_000, 30_000).toLong()
        val method = options.optString("method", "GET").uppercase(Locale.US).let { if (it.isEmpty()) "GET" else it }
        if (!METHODS.contains(method)) throw IllegalArgumentException("HTTP method unsupported: $method")

        var body: String? = null
        val form = options.opt("form")
        if (form is JSONObject) {
            val encoded = StringBuilder()
            val keys = form.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                if (encoded.isNotEmpty()) encoded.append('&')
                encoded.append(enc(key)).append('=').append(enc(form.opt(key).toString()))
            }
            body = encoded.toString()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        } else if (options.has("formData")) {
            throw IllegalArgumentException("multipart unsupported")
        } else if (!options.isNull("body")) {
            val raw = options.opt("body")
            body = if (raw is String) raw else raw.toString()
            if (!headers.keys.any { it.equals("Content-Type", true) }) headers["Content-Type"] = "application/json"
        }
        if ((body?.length ?: 0) > MAX_BODY) throw IllegalArgumentException("Request too large")

        var target = url
        var activeMethod = method
        var activeBody = body
        var activeHeaders = headers
        var redirect = 0
        while (true) {
            val response = execute(target, activeMethod, activeHeaders, activeBody, timeout)
            val location = response.optString("location", "").takeIf { it.isNotEmpty() }
            val status = response.optInt("statusCode", 0)
            if (status in 301..308 && location != null) {
                if (++redirect > MAX_REDIRECTS) throw IllegalArgumentException("too many redirects")
                val next = validateUrl(URI(URI(target).toString()).resolve(location).toString(), allowRedirectTarget = true)
                val nextHeaders = LinkedHashMap(activeHeaders)
                if (hostOf(next) != hostOf(target)) nextHeaders.keys.removeAll { SENSITIVE_HEADERS.contains(it.lowercase(Locale.US)) }
                val downgrade = status == 303 || ((status == 301 || status == 302) && activeMethod == "POST")
                target = next
                if (downgrade) {
                    activeMethod = "GET"
                    activeBody = null
                }
                activeHeaders = nextHeaders
                continue
            }
            return response.toString()
        }
    }

    private fun execute(url: String, method: String, headers: Map<String, String>, body: String?, timeoutMs: Long): JSONObject {
        val builder = Request.Builder().url(url)
        headers.forEach { (key, value) -> builder.header(key, value) }
        if (body != null && method != "GET" && method != "HEAD") {
            builder.method(method, body.toRequestBody(contentType(headers)))
        } else {
            builder.method(method, if (method == "GET" || method == "HEAD") null else "".toRequestBody(null))
        }
        val call = CLIENT.newBuilder()
            .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .build()
            .newCall(builder.build())
        call.execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (text.length > MAX_RESPONSE) throw IllegalArgumentException("Response too large")
            val outHeaders = JSONObject()
            response.headers.forEach { pair -> outHeaders.put(pair.first, pair.second) }
            val parsed = try {
                if (text.isEmpty()) "" else JSONObject(text)
            } catch (_: Throwable) {
                try {
                    if (text.isEmpty()) "" else org.json.JSONArray(text)
                } catch (_: Throwable) {
                    text
                }
            }
            return JSONObject()
                .put("statusCode", response.code)
                .put("headers", outHeaders)
                .put("body", parsed ?: "")
        }
    }

    private fun contentType(headers: Map<String, String>) =
        (headers.entries.firstOrNull { it.key.equals("Content-Type", true) }?.value ?: "application/json").toMediaType()

    // ------------------------------------------------------------------ guards

    /** 公网 HTTP(S) 白名单校验，与 JS 侧 validateRemoteUrl 同规则。 */
    @JvmOverloads
    fun validateUrl(input: String, allowRedirectTarget: Boolean = false): String {
        val uri = URI(input.trim())
        val scheme = uri.scheme?.lowercase(Locale.US)
        if (scheme != "http" && scheme != "https") throw IllegalArgumentException("only http(s) is allowed")
        if (!uri.userInfo.isNullOrEmpty()) throw IllegalArgumentException("credentials in URL are not allowed")
        val host = (uri.host ?: throw IllegalArgumentException("missing host")).lowercase(Locale.US)
            .trim('[', ']').let { if (it.startsWith("xn--")) IDN.toUnicode(it) else it }
        if (!host.contains('.')) throw IllegalArgumentException("host must be public")
        if (host == "localhost" || host.endsWith(".local")) throw IllegalArgumentException("local host is not allowed")
        if (host == "127.0.0.1" || host == "0.0.0.0" || host == "::1") throw IllegalArgumentException("loopback is not allowed")
        val literal = host.matches(Regex("^\\d+(\\.\\d+){3}\$"))
        if (literal) {
            val parts = host.split('.').map { it.toInt() }
            val blocked = parts[0] == 10 || parts[0] == 127 || parts[0] == 0 ||
                (parts[0] == 192 && parts[1] == 168) ||
                (parts[0] == 169 && parts[1] == 254) ||
                (parts[0] == 172 && parts[1] in 16..31)
            if (blocked) throw IllegalArgumentException("private address is not allowed")
        }
        return uri.toString()
    }

    fun hostOf(url: String): String = try {
        URI(url).host?.lowercase(Locale.US) ?: ""
    } catch (_: Throwable) {
        ""
    }

    private fun clamp(value: Any?, min: Int, max: Int): Int {
        val number = when (value) {
            is Number -> value.toInt()
            is String -> value.toIntOrNull()
            else -> null
        } ?: return max.coerceAtMost(15_000)
        return number.coerceIn(min, max)
    }

    private fun enc(value: String) = java.net.URLEncoder.encode(value, "UTF-8")
}
