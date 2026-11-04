package io.github.huleixin.tingyu.minimal.ui

import android.annotation.SuppressLint
import android.os.SystemClock
import android.view.Choreographer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalFrameProbe.kt
//
// 帧耗时探针（第 15 轮，诊断角标专用）：diag 开启时挂在 Choreographer 上统计帧间隔。
//
// 用途：真机上验证极简页切页/弹窗动画是否掉帧，不接 adb 也能读数 ——
// 长按分页点打开 diag 角标，角标下方实时显示最近约 3 秒的
// 「帧均 · 卡顿帧占比 · 最差帧」。diag 关闭时零开销（回调不挂）。
//
// 不引 JankStats 依赖；窗口按条数滚动（200 条 ≈ 60fps 下 3.3 秒）。

private const val PROBE_WINDOW_FRAMES = 200
private const val PROBE_JANK_MS = 20L

@SuppressLint("Recycle")
@Composable
internal fun rememberFrameProbeText(): String {
    val text = remember { mutableStateOf("") }
    val deltas = remember { ArrayDeque<Long>() }
    DisposableEffect(Unit) {
        val choreographer = Choreographer.getInstance()
        var last = 0L
        val callback = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                if (last != 0L) {
                    deltas.addLast((frameTimeNanos - last) / 1_000_000L)
                    while (deltas.size > PROBE_WINDOW_FRAMES) deltas.removeFirst()
                }
                last = frameTimeNanos
                choreographer.postFrameCallback(this)
            }
        }
        choreographer.postFrameCallback(callback)
        onDispose { choreographer.removeFrameCallback(callback) }
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(500)
            val snapshot = synchronized(deltas) { deltas.toList() }
            text.value = if (snapshot.size < 30) "" else run {
                val average = snapshot.average()
                val jank = snapshot.count { it >= PROBE_JANK_MS }
                val worst = snapshot.max()
                "帧均 %.1fms · 卡顿 %d%% (≥%dms) · 峰 %dms".format(
                    average, jank * 100 / snapshot.size, PROBE_JANK_MS, worst,
                )
            }
        }
    }
    return text.value
}
