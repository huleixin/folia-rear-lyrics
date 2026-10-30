package io.github.huleixin.tingyu.lx

import android.content.Context
import io.github.huleixin.tingyu.playback.PlaybackDiagnostics
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.io.File

// 洛雪音源运行时的宿主 —— **由播放进程拥有，不属于 MainActivity，也不属于任何 Capacitor 插件实例**。
//
// 生命周期：
// - attach()：拿的是 applicationContext，Activity 重建与它无关；
// - install()：用户启用/切换脚本时，JS 把脚本交给原生，落盘到 app 私有目录，
//   进程被系统杀掉后再起来也能自己把引擎拉起来，不需要等 WebView；
// - resolve()：后台线程直接调用（阻塞在引擎自己的线程上），与 Media3 回调线程分离；
// - release()：用户主动停止播放后释放引擎，脚本留着；
// - 没有任何定时器、唤醒锁或心跳。
object LxRuntimeHost {

    private const val DIR = "lx-source"
    private const val FILE = "active.json"
    private const val INIT_COOLDOWN_MS = 120_000L

    private data class Installed(
        val id: String,
        val name: String,
        val version: String,
        val description: String,
        val author: String,
        val homepage: String,
        val code: String,
    )

    private val lock = Any()

    @Volatile private var appContext: Context? = null
    @Volatile private var installed: Installed? = null
    @Volatile private var engine: LxScriptEngine? = null
    @Volatile private var lastError: String? = null
    @Volatile private var initFailedAt = 0L
    @Volatile private var requests = 0
    @Volatile private var successes = 0
    @Volatile private var failures = 0
    @Volatile private var lastHost = ""
    @Volatile private var lastStatus = 0

    private val hooks = object : LxHooks {
        override fun note(event: String, fields: JSONObject) {
            PlaybackDiagnostics.note(event, fields)
        }

        override fun http(host: String, status: Int, bytes: Int) {
            lastHost = host
            lastStatus = status
            PlaybackDiagnostics.note("lx-http", JSONObject()
                .put("host", host.take(48))
                .put("status", status)
                .put("bytes", bytes))
        }
    }

    fun attach(context: Context) {
        appContext = context.applicationContext
        synchronized(lock) {
            if (installed == null) installed = read()
        }
        if (installed != null) {
            PlaybackDiagnostics.note("lx-restored", JSONObject()
                .put("name", installed?.name?.take(32) ?: "")
                .put("bytes", installed?.code?.length ?: 0))
        }
    }

    /** 用户启用/切换脚本。空 code 表示停用。 */
    fun install(id: String, name: String, version: String, description: String, author: String, homepage: String, code: String): Boolean {
        if (code.isBlank()) {
            clear()
            return false
        }
        if (code.length > 1_048_576) {
            PlaybackDiagnostics.note("lx-install", JSONObject().put("result", "too-large"))
            return false
        }
        val next = Installed(id, name.take(64), version.take(24), description.take(120), author.take(48), homepage.take(120), code)
        synchronized(lock) {
            val changed = installed?.code != code
            installed = next
            if (changed) {
                // 换脚本：正在跑的引擎必须整个废掉，迟到的旧结果一律不要。
                val stale = engine
                engine = null
                if (stale != null) runBlocking { stale.close() }
                initFailedAt = 0L
            }
        }
        write(next)
        PlaybackDiagnostics.note("lx-install", JSONObject()
            .put("name", next.name.take(32))
            .put("version", next.version)
            .put("bytes", code.length))
        return true
    }

    fun clear() {
        synchronized(lock) {
            val stale = engine
            engine = null
            installed = null
            if (stale != null) runBlocking { stale.close() }
        }
        appContext?.let { File(it.filesDir, DIR).resolve(FILE).delete() }
        PlaybackDiagnostics.note("lx-install", JSONObject().put("result", "cleared"))
    }

    /** 有没有装脚本（不管引擎有没有起来）。用于决定"要不要尝试"，而不是"能不能成功"。 */
    fun hasScript(): Boolean = installed != null

    /** 这个 provider 原生能不能自己取地址（脚本装了且声明了对应平台）。 */
    fun capabilitiesFor(providerId: String): List<String>? {
        val source = LxPlatform.sourceFor(providerId) ?: return null
        val script = installed ?: return null
        synchronized(lock) {
            val live = engine?.capabilities
            if (live != null) return live[source]
        }
        return null
    }

    /**
     * 后台取地址。调用方是续播编排器的工作线程，这里阻塞等待是刻意的：
     * 解析跑在引擎自己的守护线程上，不占 Media3 回调线程，也不占主线程。
     */
    @JvmOverloads
    fun resolve(source: String, quality: String, musicInfo: JSONObject, timeoutMs: Long = 45_000): LxOutcome {
        val script = installed ?: return LxOutcome(false, null, "未安装洛雪音源脚本")
        val live = ensureEngine(script)
            ?: return LxOutcome(false, null, lastError ?: "音源引擎不可用")
        requests++
        val payload = JSONObject()
            .put("source", source)
            .put("action", "musicUrl")
            .put("info", JSONObject().put("type", quality).put("musicInfo", musicInfo))
        val outcome = try {
            runBlocking { withTimeout(timeoutMs + 5_000) { live.request(payload, timeoutMs) } }
        } catch (failure: Throwable) {
            LxOutcome(false, null, failure.javaClass.simpleName)
        }
        if (outcome.ok) successes++ else failures++
        PlaybackDiagnostics.note(if (outcome.ok) "lx-resolved" else "lx-failed", JSONObject()
            .put("source", source)
            .put("quality", quality)
            .put("host", lastHost.take(48))
            .put("status", lastStatus)
            .put("reason", outcome.reason.take(160)))
        return outcome
    }

    /** 用户主动停止播放：引擎释放，脚本保留。 */
    fun release() {
        synchronized(lock) {
            val live = engine
            engine = null
            if (live != null) runBlocking { live.close() }
        }
        PlaybackDiagnostics.note("lx-release", JSONObject().put("requests", requests).put("ok", successes))
    }

    fun snapshot(): JSONObject {
        val script = installed
        val live = engine
        return JSONObject()
            .put("installed", script != null)
            .put("name", script?.name?.take(32) ?: "")
            .put("version", script?.version ?: "")
            .put("started", live?.started == true)
            .put("sources", (live?.capabilities?.keys?.joinToString(",")) ?: "")
            .put("requests", requests)
            .put("ok", successes)
            .put("failed", failures)
            .put("lastHost", lastHost.take(48))
            .put("lastStatus", lastStatus)
            .put("lastError", lastError?.take(160) ?: "")
    }

    // ------------------------------------------------------------------ internals

    private fun ensureEngine(script: Installed): LxScriptEngine? {
        synchronized(lock) {
            engine?.let { return it }
            if (System.currentTimeMillis() - initFailedAt < INIT_COOLDOWN_MS) return null
            val created = LxScriptEngine(hooks)
            val info = JSONObject()
                .put("name", script.name)
                .put("version", script.version)
                .put("description", script.description)
                .put("author", script.author)
                .put("homepage", script.homepage)
            return try {
                runBlocking { created.start(script.code, info) }
                lastError = null
                engine = created
                created
            } catch (failure: Throwable) {
                lastError = failure.message?.take(160) ?: failure.javaClass.simpleName
                initFailedAt = System.currentTimeMillis()
                runBlocking { created.close() }
                PlaybackDiagnostics.note("lx-init-failed", JSONObject().put("reason", lastError))
                null
            }
        }
    }

    private fun write(script: Installed) {
        val context = appContext ?: return
        try {
            val dir = File(context.filesDir, DIR)
            if (!dir.exists() && !dir.mkdirs()) return
            val payload = JSONObject()
                .put("id", script.id)
                .put("name", script.name)
                .put("version", script.version)
                .put("description", script.description)
                .put("author", script.author)
                .put("homepage", script.homepage)
                .put("code", script.code)
            File(dir, FILE).writeText(payload.toString())
        } catch (_: Throwable) {
            // 落盘失败不影响本次会话：内存里那份还在，只是进程重启后需要 JS 再同步一次。
        }
    }

    private fun read(): Installed? {
        val context = appContext ?: return null
        return try {
            val file = File(context.filesDir, DIR).resolve(FILE)
            if (!file.exists()) return null
            val payload = JSONObject(file.readText())
            val code = payload.optString("code", "")
            if (code.isBlank()) null else Installed(
                payload.optString("id", ""),
                payload.optString("name", ""),
                payload.optString("version", ""),
                payload.optString("description", ""),
                payload.optString("author", ""),
                payload.optString("homepage", ""),
                code,
            )
        } catch (_: Throwable) {
            null
        }
    }

    /** 诊断字段里出现的文本统一裁剪，避免脚本把大段内容塞进诊断。 */
    private fun String.take(max: Int) = if (length <= max) this else substring(0, max)

    private fun String?.orEmpty() = this ?: ""
}
