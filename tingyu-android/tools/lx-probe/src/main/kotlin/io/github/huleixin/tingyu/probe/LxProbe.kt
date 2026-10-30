package io.github.huleixin.tingyu.probe

import io.github.huleixin.tingyu.lx.LxHooks
import io.github.huleixin.tingyu.lx.LxOutcome
import io.github.huleixin.tingyu.lx.LxPlatform
import io.github.huleixin.tingyu.lx.LxScriptEngine
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

// 真实脚本 + 真实网络 + 真实 QuickJS。
//
// 引擎源码与 APK 共用同一份（build.gradle 里直接把 .../lx 目录当作 sourceDir），
// 所以这里跑通的流程，就是原生后台真正会跑的流程，只是宿主换成 JVM。
private val CLIENT = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(25, TimeUnit.SECONDS)
    .followRedirects(true)
    .build()

class ProbeHooks : LxHooks {
    val hosts = LinkedHashMap<String, Int>()
    override fun note(event: String, fields: JSONObject) {
        println("  [engine] $event ${fields.toString().take(200)}")
    }

    override fun http(host: String, status: Int, bytes: Int) {
        hosts[host] = status
        println("  [http ] $host -> $status (${bytes}B)")
    }
}

fun main(args: Array<String>) {
    if (args.isEmpty()) {
        println("usage: probe <script.js> [songmid...]")
        return
    }
    val code = File(args[0]).readText()
    val mids = args.drop(1)
    val hooks = ProbeHooks()
    val engine = LxScriptEngine(hooks)
    runBlocking {
        println("== init ==")
        try {
            engine.start(code, JSONObject().put("name", "probe").put("version", "0"))
        } catch (failure: Throwable) {
            println("INIT FAILED: ${failure.javaClass.simpleName}: ${failure.message?.take(200)}")
            return@runBlocking
        }
        println("capabilities: ${engine.capabilities}")

        val source = if (engine.capabilities.containsKey("tx")) "tx" else engine.capabilities.keys.firstOrNull()
        if (source == null) {
            println("NO PLATFORM DECLARED")
            return@runBlocking
        }
        val qualitys = engine.capabilities[source] ?: emptyList()
        val type = LxPlatform.qualityFor("high", qualitys)
        println("== musicUrl: source=$source type=$type ==")

        var ok = 0
        mids.forEachIndexed { index, mid ->
            val info = LxPlatform.musicInfo(
                source, "qq", mid, "晴天", "周杰伦", "叶惠美", 269, "", "", qualitys
            )
            val payload = JSONObject()
                .put("source", source)
                .put("action", "musicUrl")
                .put("info", JSONObject().put("type", type).put("musicInfo", info))
            val outcome: LxOutcome = engine.request(payload)
            if (!outcome.ok) {
                println("#${index + 1} $mid FAILED: ${outcome.reason.take(160)}")
            } else {
                val url = outcome.value ?: ""
                val host = try { java.net.URI(url).host } catch (_: Throwable) { "?" }
                val probe = probeUrl(url)
                println("#${index + 1} $mid OK host=$host probe=$probe")
                if (probe.startsWith("200") || probe.startsWith("206")) ok++
            }
        }
        println("== summary: ${ok}/${mids.size} playable ==")
        engine.close()
    }
}

/** 只用 1 字节 Range 请求确认地址真的能出音频流，不下载整首。 */
private fun probeUrl(url: String): String = try {
    val request = Request.Builder().url(url).header("Range", "bytes=0-0").get().build()
    CLIENT.newCall(request).execute().use { response ->
        val type = response.header("Content-Type") ?: "-"
        val length = response.header("Content-Range") ?: response.header("Content-Length") ?: "-"
        "${response.code} type=$type range=$length"
    }
} catch (failure: Throwable) {
    "PROBE FAILED ${failure.javaClass.simpleName}"
}
