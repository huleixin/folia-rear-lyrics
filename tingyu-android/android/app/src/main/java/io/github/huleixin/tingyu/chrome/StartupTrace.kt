package io.github.huleixin.tingyu.chrome

import android.os.Process
import android.os.SystemClock
import android.util.Log
import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/StartupTrace.kt
//
// 冷启动首帧的结构化取证（2026-11-07 底栏闪烁专项）。
//
// 解决的是「报告里看不出底部到底发生了什么」：底栏的显隐由三条互不相同的状态驱动
// （路由 destination、live 包 liveChrome、缓存 seed 的存活条件），任何一条在启动窗口里
// 抖一下都只表现为「屏幕上闪了一下」，事后只有录屏能看见。这里把这几个决策点按发生
// 顺序记下来，带上足以复算的字段（id / session / enabled / top / height / inset）。
//
// 成本约束（这是诊断，不是埋点业务）：
//  · 只在进程启动后的 3 秒内记录，之后 enabled() 恒为 false，调用点全部短路；
//  · 最多 64 条，写满即停，不做滚动、不做 IO；
//  · detail 用 inline，关闭时连 JSONObject 都不会创建；
//  · 只在启动窗口写 logcat（TingyuStartup），报告里由 status() 一并导出。
internal object StartupTrace {
    private const val WINDOW_MS = 3_000L
    private const val CAP = 64
    /**
     * 单调时钟。探测一次：单元测试的 JVM 上 `android.os.SystemClock` 是空壳（方法直接抛），
     * 这时退回 `System.nanoTime`，同一份代码在设备与测试里都能跑。
     */
    private val elapsed: () -> Long = runCatching { SystemClock.elapsedRealtime() }.let { probe ->
        if (probe.isSuccess) ({ SystemClock.elapsedRealtime() }) else null
    } ?: ({ System.nanoTime() / 1_000_000L })
    private val origin = runCatching { Process.getStartElapsedRealtime() }.getOrElse { elapsed() }
    private val entries = ArrayList<JSONObject>(CAP)
    @Volatile private var active = true

    /** 是否仍在启动窗口内（且未写满）。调用点在构造任何对象之前先用它短路。 */
    fun enabled(): Boolean {
        if (!active) return false
        val since = elapsed() - origin
        if (since > WINDOW_MS || entries.size >= CAP) { active = false; return false }
        return true
    }

    fun mark(phase: String) {
        if (!enabled()) return
        append(phase, null)
    }

    /** 只在启动窗口内构造 detail；关闭后整段被 inline 掉。 */
    inline fun detail(phase: String, block: JSONObject.() -> Unit) {
        if (!StartupTrace.enabled()) return
        val json = JSONObject()
        try { json.block() } catch (_: Throwable) { }
        StartupTrace.record(phase, json)
    }

    @PublishedApi internal fun record(phase: String, detail: JSONObject?) {
        if (!enabled()) return
        append(phase, detail)
    }

    private fun append(phase: String, detail: JSONObject?) {
        val at = elapsed() - origin
        try {
            val entry = JSONObject().put("at", at).put("phase", phase)
            detail?.let { entry.put("detail", it) }
            synchronized(entries) {
                if (entries.size >= CAP) { active = false; return }
                entries.add(entry)
            }
            Log.i("TingyuStartup", "$at $phase ${detail ?: ""}")
        } catch (_: Throwable) {
            // 诊断永远不能影响启动。
        }
    }

    /** 报告用：启动窗口内的全部记录 + 采样口径。 */
    fun snapshot(): JSONObject = try {
        JSONObject().put("windowMs", WINDOW_MS).put("cap", CAP)
            .put("processOriginElapsed", origin)
            .put("entries", synchronized(entries) { org.json.JSONArray(entries.toList()) })
            .put("note", "只覆盖进程启动后 3 秒；at 是相对进程启动的毫秒数")
    } catch (_: Throwable) {
        JSONObject()
    }

    /** 测试用：回到「刚启动」的状态。 */
    internal fun resetForTest() {
        synchronized(entries) { entries.clear() }
        active = true
    }
}
