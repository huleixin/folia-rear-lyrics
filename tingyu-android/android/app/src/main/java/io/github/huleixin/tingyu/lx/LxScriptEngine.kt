package io.github.huleixin.tingyu.lx

import com.dokar.quickjs.QuickJs
import com.dokar.quickjs.binding.asyncFunction
import com.dokar.quickjs.binding.function
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.ObsoleteCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.newSingleThreadContext
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/** 一次解析的结果。成功时 value 是脚本返回的字符串（播放地址）。 */
data class LxOutcome(val ok: Boolean, val value: String?, val reason: String)

/**
 * 洛雪音源脚本的原生执行器 —— 后台链路里"谁来跑用户导入的 JS"这个问题的答案。
 *
 * 引擎是 QuickJS（与 WebView Worker 里那个同源），宿主 API 按洛雪移动版协议实现，
 * 见 {@link LxBootstrap}。整段代码不碰 Android Framework，因此可以在 JVM 上用
 * **真实脚本 + 真实网络**做集成实测（tools/lx-probe）。
 *
 * 资源边界：内存 64MB（真实脚本会缓存链路结果，24MB 会在第 5 首左右 OOM，见 tools/lx-probe 记录）、
 * 栈 256KB、单次 evaluate 有超时、HTTP 有超时与体积上限、
 * 引擎固定跑在一个守护线程上，不持有任何 Android 组件引用。
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class LxScriptEngine(private val hooks: LxHooks = LxHooks.NONE) {

    // QuickJS 的句柄必须固定在同一个线程上用：单线程上下文 + 守护线程。
    @OptIn(ObsoleteCoroutinesApi::class, ExperimentalCoroutinesApi::class)
    private val dispatcher = newSingleThreadContext("tingyu-lx")
    private val scope = CoroutineScope(dispatcher + SupervisorJob())

    private var quickJs: QuickJs? = null
    private val pending = ConcurrentHashMap<Long, CompletableDeferred<LxOutcome>>()
    private val serial = AtomicLong(0)

    @Volatile
    var capabilities: Map<String, List<String>> = emptyMap()
        private set

    @Volatile
    var started = false
        private set

    /** 初始化脚本：装宿主 API → 注入脚本信息 → 执行脚本 → 等 inited。 */
    suspend fun start(code: String, info: JSONObject, timeoutMs: Long = 20_000) {
        withContext(dispatcher) {
            closeLocked()
            val engine = QuickJs.create(Dispatchers.IO)
            quickJs = engine
            engine.memoryLimit = 64L * 1024 * 1024
            engine.maxStackSize = 256L * 1024
            engine.function("__emit") { args -> emit(args.firstOrNull()?.toString().orEmpty()); "" }
            engine.function("__utility") { args -> LxUtility.handle(args.firstOrNull()?.toString().orEmpty()) }
            engine.asyncFunction("__http") { args -> http(args) }
            engine.asyncFunction("__sleep") { args -> sleep(args) }
            // 超时由这里统一兜住：不是所有平台的 QuickJS 封装都提供 evaluationTimeout。
            withTimeout(timeoutMs) {
                engine.evaluate<Any?>(LxBootstrap.SHIM)
                engine.evaluate<Any?>("lx.currentScriptInfo=" + info.toString() + ";")
                engine.evaluate<Any?>(code)
            }
            if (capabilities.isEmpty()) throw IllegalStateException("音源脚本未声明可用的 musicUrl 平台")
            started = true
            hooks.note("lx-init", JSONObject()
                .put("sources", capabilities.keys.joinToString(","))
                .put("bytes", code.length))
        }
    }

    /** 向脚本发一次 musicUrl（或 lyric / pic）请求，等到它给出结果或超时。 */
    suspend fun request(payload: JSONObject, timeoutMs: Long = 45_000): LxOutcome = withContext(dispatcher) {
        val engine = quickJs
            ?: return@withContext LxOutcome(false, null, "音源引擎未启动")
        val id = serial.incrementAndGet()
        val deferred = CompletableDeferred<LxOutcome>()
        pending[id] = deferred
        try {
            engine.evaluate<Any?>("__request(" +
                JSONObject().put("id", id).put("payload", payload).toString() + ");")
        } catch (failure: Throwable) {
            pending.remove(id)
            deferred.cancel()
            hooks.note("lx-request-error", JSONObject().put("reason", describe(failure)))
            return@withContext LxOutcome(false, null, describe(failure))
        }
        val outcome = try {
            withTimeout(timeoutMs) { deferred.await() }
        } catch (_: TimeoutCancellationException) {
            LxOutcome(false, null, "音源取流超时")
        } finally {
            pending.remove(id)
        }
        outcome
    }

    /** 关闭引擎。必须在引擎自己的线程上释放 QuickJS 句柄，所以是 suspend。 */
    suspend fun close() {
        withContext(dispatcher) { closeLocked() }
    }

    private fun closeLocked() {
        try {
            quickJs?.close()
        } catch (_: Throwable) {
            // 关闭失败也要继续：句柄必须清掉，否则下次请求会打到一个死引擎上。
        }
        quickJs = null
        started = false
        pending.values.forEach { if (!it.isCompleted) it.cancel() }
        pending.clear()
    }

    /** 彻底释放：先关引擎，再关线程。之后这个实例不能再用了。 */
    suspend fun shutdown() {
        close()
        scope.cancel()
        dispatcher.close()
    }

    // ------------------------------------------------------------------ host API

    private fun emit(raw: String) {
        if (raw.isEmpty()) return
        val message = try {
            JSONObject(raw)
        } catch (_: Throwable) {
            return
        }
        when (message.optString("kind")) {
            "inited" -> {
                capabilities = LxPlatform.validateCapabilities(message.opt("data")?.let {
                    (it as? JSONObject)?.opt("sources") ?: JSONObject.NULL
                })
                hooks.note("lx-inited", JSONObject().put("sources", capabilities.keys.joinToString(",")))
            }
            "updateAlert" -> hooks.note("lx-update-alert", JSONObject())
            "result" -> {
                val id = message.optLong("id", -1L)
                val deferred = pending[id] ?: return
                val outcome = if (message.has("error")) {
                    LxOutcome(false, null, message.optString("error", "音源返回错误").take(160))
                } else {
                    val value = message.opt("value")
                    if (value is String && value.isNotBlank()) LxOutcome(true, value.trim(), "")
                    else LxOutcome(false, null, "音源未返回播放地址")
                }
                deferred.complete(outcome)
            }
        }
    }

    private suspend fun http(args: Array<Any?>): String {
        val url = args.getOrNull(0)?.toString() ?: throw IllegalArgumentException("missing url")
        val options = when (val raw = args.getOrNull(1)) {
            is JSONObject -> raw
            is String -> try {
                JSONObject(raw)
            } catch (_: Throwable) {
                JSONObject()
            }
            else -> JSONObject()
        }
        return withContext(Dispatchers.IO) {
            val host = LxHttp.hostOf(url)
            try {
                val text = LxHttp.request(url, options)
                hooks.http(host, statusOf(text), text.length)
                text
            } catch (failure: Throwable) {
                hooks.http(host, -1, 0)
                throw failure
            }
        }
    }

    private suspend fun sleep(args: Array<Any?>): String {
        val ms = when (val raw = args.getOrNull(0)) {
            is Number -> raw.toLong()
            is String -> raw.toLongOrNull() ?: 0L
            else -> 0L
        }
        delay(ms.coerceIn(0, 15_000))
        return ""
    }

    private fun statusOf(text: String): Int = try {
        JSONObject(text).optInt("statusCode", 0)
    } catch (_: Throwable) {
        0
    }

    private fun describe(failure: Throwable): String {
        val message = failure.message?.take(160) ?: ""
        return (failure.javaClass.simpleName + (if (message.isEmpty()) "" else ": $message"))
    }
}
