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
    @Volatile private var lastMethod = ""
    @Volatile private var lastOptionKeys = ""
    @Volatile private var lastHttpError = ""
    @Volatile private var lastHttpErrorAt = 0L

    private val hooks = object : LxHooks {
        override fun note(event: String, fields: JSONObject) {
            // 网络失败的「谁关的这条连接」必须留在快照里，否则真机报告只有 status=-1。
            if (event == "lx-http-error") {
                lastHttpError = "type=" + fields.optString("type") +
                    " cause=" + fields.optString("cause").ifEmpty { "-" } +
                    " msg=" + fields.optString("message").ifEmpty { "-" } +
                    " host=" + fields.optString("host") +
                    " ms=" + fields.optLong("elapsedMs")
                lastHttpErrorAt = System.currentTimeMillis()
            }
            PlaybackDiagnostics.note(event, fields)
        }

        override fun http(host: String, status: Int, bytes: Int) {
            lastHost = host
            lastStatus = status
            PlaybackDiagnostics.note("lx-http", JSONObject()
                .put("host", host.take(48))
                .put("status", status)
                .put("method", lastMethod)
                .put("bytes", bytes))
        }

        /**
         * 只记"脚本要的是什么"，不记值：options 一旦在宿主管卡上被丢光，
         * 诊断里就只剩 404 —— 上一轮真机正是因为缺这一行，才看不出 POST 被发成了 GET。
         */
        override fun request(url: String, options: JSONObject) {
            lastMethod = options.optString("method", "GET").uppercase()
            lastOptionKeys = options.keys().asSequence().toList().sorted().joinToString(",").take(48)
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

    /** 上一次初始化失败的原因。解析器的诊断要区分"没装脚本"和"装了但起不来"。 */
    fun lastInitError(): String? = lastError

    /**
     * 显式把引擎拉起来，不解析任何歌。
     *
     * 用途有两个：① 用户导入/切换脚本后立刻预热，后台真要取地址时引擎已经是热的；
     * ② 让"脚本能不能在原生跑起来"这件事在**前台**就暴露，而不是等到后台续播失败时
     * 才在诊断里看到 `started=no`。会阻塞调用线程，别在主线程调。
     */
    fun warmUp(): Boolean {
        val script = installed ?: return false
        val live = ensureEngine(script)
        PlaybackDiagnostics.note("lx-warmup", JSONObject()
            .put("started", live?.started == true)
            .put("sources", live?.capabilities?.keys?.joinToString(",") ?: "")
            .put("reason", redact(lastError).take(160)))
        return live != null
    }

    /**
     * 解析器专用：先确保引擎起来了，再给出这个 provider 的能力表。
     *
     * 之前的写法是"先看能力表，能力表为空就判 UNSUPPORTED"，而能力表只有引擎起来之后
     * 才有 —— 于是原生洛雪链路永远走不到真正执行脚本那一步。这里把顺序倒过来。
     *
     * 返回 null 有两种含义，调用方必须分开报告：
     * - 没装脚本 → SCRIPT_NOT_INSTALLED（用户没启用自定义源，不是故障）；
     * - 装了但引擎起不来，或脚本没声明这个平台 → SOURCE_NOT_READY。
     */
    fun prepare(providerId: String): List<String>? {
        val source = LxPlatform.sourceFor(providerId) ?: return null
        val script = installed ?: return null
        val live = ensureEngine(script) ?: return null
        return live.capabilities[source]
    }

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
            // 脚本给出的错误里可能带着播放地址或签名，进诊断前必须抹掉。
            .put("reason", redact(outcome.reason).take(160)))
        // 返回给调用方的原因同样要干净：它会原样进续播的失败诊断。
        return if (outcome.ok) outcome else outcome.copy(reason = redact(outcome.reason).take(160))
    }

    /** 用户主动停止播放：引擎释放，脚本保留。 */
    fun release() {
        synchronized(lock) {
            val live = engine
            engine = null
            // 下一次播放是全新的一次机会：别让上一次的失败冷却期挡住它。
            initFailedAt = 0L
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
            .put("lastMethod", lastMethod)
            .put("lastOptionKeys", lastOptionKeys)
            .put("lastError", redact(lastError).take(160))
            .put("lastHttpError", lastHttpError.take(200))
            .put("lastHttpErrorAgeMs", if (lastHttpErrorAt <= 0L) -1L
                else System.currentTimeMillis() - lastHttpErrorAt)
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
                lastError = redact(failure.message ?: failure.javaClass.simpleName).take(160)
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

    /**
     * 脚本返回的错误文本里可能夹着播放地址或签名参数，进诊断报告前一律抹掉。
     * 与 JS 侧 `resolveLxSource` 的处理规则一致。
     */
    private val URL_PATTERN = Regex("https?://[^\\s\"'<>]+")

    private fun redact(text: String?): String = (text ?: "")
        .replace(URL_PATTERN, "[地址]")
        .replace(Regex("[\\r\\n\\t]"), " ")

    /** 诊断字段里出现的文本统一裁剪，避免脚本把大段内容塞进诊断。 */
    private fun String.take(max: Int) = if (length <= max) this else substring(0, max)

    private fun String?.orEmpty() = this ?: ""
}
