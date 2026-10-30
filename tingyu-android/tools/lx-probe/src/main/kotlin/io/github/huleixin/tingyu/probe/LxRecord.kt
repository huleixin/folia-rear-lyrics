package io.github.huleixin.tingyu.probe

import io.github.huleixin.tingyu.lx.LxHooks
import io.github.huleixin.tingyu.lx.LxHttp
import io.github.huleixin.tingyu.lx.LxOutcome
import io.github.huleixin.tingyu.lx.LxPlatform
import io.github.huleixin.tingyu.lx.LxScriptEngine
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.util.concurrent.TimeUnit

// 原生侧的"请求取证"探针：跑真实脚本、打真实网络，但把每一次外出请求
// 都按统一格式记下来（方法 / 主机 / 路径 / query 键 / Content-Type / 请求体形状），
// 与 WebView 侧的取证结果逐字段对照。
//
// 用法：record <script.js> <musicInfo.json> <source> <quality> <mid>
//   musicInfo.json 由另一侧先生成，保证两个引擎拿到的是**同一首歌的同一个身份**。

private val PROBE_CLIENT = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(25, TimeUnit.SECONDS)
    .followRedirects(true)
    .build()

class RecordHooks : LxHooks {
    val records = JSONArray()

    override fun note(event: String, fields: JSONObject) = Unit

    override fun http(host: String, status: Int, bytes: Int) = Unit

    override fun request(url: String, options: JSONObject) {
        val plan = try {
            LxHttp.plan(url, options)
        } catch (failure: Throwable) {
            null
        }
        val record = JSONObject()
            .put("url", Redact.url(url))
            .put("method", plan?.method ?: "?")
            .put("host", Redact.host(url))
            .put("path", Redact.path(url))
            .put("queryKeys", Redact.queryKeys(url))
            .put("contentType", plan?.headers?.entries?.firstOrNull { it.key.equals("Content-Type", true) }?.value ?: "")
            .put("body", Redact.body(plan?.body))
            .put("optionKeys", Redact.optionKeys(options))
        records.put(record)
    }
}

object Redact {
    fun host(url: String): String = try {
        URI(url).host ?: "?"
    } catch (_: Throwable) {
        "?"
    }

    fun path(url: String): String = try {
        URI(url).path ?: "/"
    } catch (_: Throwable) {
        "/"
    }

    /** 只留 query 的参数名，值一律抹掉 —— 签名/令牌都在值里。 */
    fun queryKeys(url: String): String = try {
        val query = URI(url).query ?: return ""
        query.split('&').mapNotNull { part ->
            part.substringBefore('=').takeIf { it.isNotEmpty() }
        }.sorted().joinToString(",")
    } catch (_: Throwable) {
        ""
    }

    /** 请求体只留形状：对象的键名与值的类型/长度，不落任何真实取值。 */
    fun body(value: String?): String {
        if (value.isNullOrEmpty()) return ""
        val parsed = try {
            JSONObject(value)
        } catch (_: Throwable) {
            return "text(len=${value.length})"
        }
        return parsed.keys().asSequence().toList().sorted().joinToString(",") { key ->
            val item = parsed.opt(key)
            "$key:" + when (item) {
                is JSONObject -> "obj{${item.keys().asSequence().toList().sorted().joinToString(",")}}"
                is JSONArray -> "arr(${item.length()})"
                is Number -> "num"
                is Boolean -> "bool"
                else -> "str(${item.toString().length})"
            }
        }
    }

    /** options 里到底有哪些键：这次故障的关键就是"method/body 根本没到宿主"。 */
    fun optionKeys(options: JSONObject): String =
        options.keys().asSequence().toList().sorted().joinToString(",")

    fun url(url: String): String {
        val host = host(url)
        val path = path(url)
        val query = queryKeys(url)
        return if (query.isEmpty()) "$host$path" else "$host$path?[$query]"
    }
}

fun main(args: Array<String>) {
    if (args.size < 5) {
        println("usage: record <script.js> <musicInfo.json> <source> <quality> <mid>")
        return
    }
    val code = File(args[0]).readText()
    val musicInfo = JSONObject(File(args[1]).readText())
    val source = args[2]
    val quality = args[3]
    val mid = args[4]

    val hooks = RecordHooks()
    val engine = LxScriptEngine(hooks)
    val out = JSONObject()
    val outFile = args.getOrNull(5)
    runBlocking {
        try {
            engine.start(code, JSONObject().put("name", "record").put("version", "0"))
        } catch (failure: Throwable) {
            out.put("initError", failure.message?.take(200) ?: failure.javaClass.simpleName)
            emit(out, outFile)
            return@runBlocking
        }
        val payload = JSONObject()
            .put("source", source)
            .put("action", "musicUrl")
            .put("info", JSONObject().put("type", quality).put("musicInfo", musicInfo))
        val outcome: LxOutcome = engine.request(payload)
        out.put("records", hooks.records)
        out.put("ok", outcome.ok)
        out.put("reason", outcome.reason.take(200))
        out.put("resolvedHost", if (outcome.ok) Redact.host(outcome.value ?: "") else "")
        out.put("resolved", outcome.value ?: "")
        if (outcome.ok) out.put("playable", probeUrl(outcome.value ?: ""))
        emit(out, outFile)
        engine.close()
    }
}

/** 写文件优先（Windows 控制台不是 UTF-8），没有给路径才打 stdout。 */
private fun emit(out: JSONObject, outFile: String?) {
    if (outFile.isNullOrBlank()) println(out.toString())
    else File(outFile).writeText(out.toString(), Charsets.UTF_8)
}

private fun probeUrl(url: String): String = try {
    val request = Request.Builder().url(url).header("Range", "bytes=0-0").get().build()
    PROBE_CLIENT.newCall(request).execute().use { response ->
        "${response.code} ${response.header("Content-Type") ?: "-"}"
    }
} catch (failure: Throwable) {
    "PROBE FAILED ${failure.javaClass.simpleName}"
}
