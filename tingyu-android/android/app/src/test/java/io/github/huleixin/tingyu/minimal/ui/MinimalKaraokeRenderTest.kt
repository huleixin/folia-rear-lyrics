package io.github.huleixin.tingyu.minimal.ui

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.MinimalClockSource
import io.github.huleixin.tingyu.minimal.MinimalLyricLine
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalTrack
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/ui/MinimalKaraokeRenderTest.kt
//
// 逐字填充的**像素**回归（第 19 轮）。和几何测试不同，这里画的是真东西：
// Robolectric 的 NATIVE 图形栈把 KaraokeLine 真正栅格化，然后逐帧读像素。
//
// 覆盖用户提的两个现场：
//   · 两行、三行、英文折行：第一行末尾跨入第二行的那几帧逐帧截图 + 逐行统计；
//   · 亮度层次：未唱（柔和灰白）与已唱（高亮白）在同一帧里的对比度，深色浅色各测一遍。
//
// 判定用的是**每行独立**的填充边界（该行最右侧的"已唱色"像素）与填充像素占比，
// 而不是整块平均亮度：平均亮度会被景深、翻译行、抗锯齿稀释，边界不会。

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class MinimalKaraokeRenderTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val outDir = File("build/screenshots/lyrics")

    private val darkPage = Color(0xFF1E2B33)
    private val lightPage = Color(0xFFF1F6F3)

    private class Shot(
        val name: String,
        val text: String,
        val widthDp: Int,
        val sizeSp: Float,
        val seconds: Double,
    )

    // 341dp = 393dp 屏幕减去左右各 26dp 内边距：和真机上这一页的内容宽度一致。
    private val twoLine = Shot("2line", "想起我们也曾是旁人最羡慕的一对", 341, 30f, 5.2)
    private val threeLine = Shot("3line", "最后我说的再见要多惭愧想起我们也曾是旁人最羡慕的一对", 250, 30f, 7.4)
    private val english = Shot("en", "the lighthouse stitches the sea into a line of light", 250, 30f, 6.0)

    // ---------------------------------------------------------------- 渲染骨架

    private var clock = mutableLongStateOf(0L)
    private var probe: TextLayoutResult? = null
    private var originX = 0f
    private var originY = 0f
    private var canvas: Bitmap? = null

    private fun playback() = MinimalPlayback(
        track = MinimalTrack(key = "tx:render", title = "渲染", durationMs = 0L),
        playing = true,
        anchorPositionMs = 0L,
        anchorElapsedMs = 0L,
        source = MinimalClockSource.ENGINE,
        epoch = "tx:render#1",
    )

    /** 每个测试只组合一次（Compose 规则不允许重置组合）。 */
    private fun start(shot: Shot, light: Boolean) {
        val ink = minimalInk(light)
        clock = mutableLongStateOf(0L)
        probe = null
        compose.mainClock.autoAdvance = false
        compose.setContent {
            Box(Modifier.fillMaxSize().background(if (light) lightPage else darkPage)) {
                Column(Modifier.width(shot.widthDp.dp)) {
                    // 同宽度、同样式的隐形副本：只为拿到真实排版的行边界。
                    Text(
                        text = shot.text,
                        color = Color.Transparent,
                        fontSize = shot.sizeSp.sp,
                        fontWeight = FontWeight.SemiBold,
                        lineHeight = shot.sizeSp.sp * 1.22f,
                        letterSpacing = (shot.sizeSp * -0.008f).sp,
                        onTextLayout = { probe = it },
                    )
                    Box(
                        Modifier.onGloballyPositioned {
                            originX = it.positionInRoot().x
                            originY = it.positionInRoot().y
                        },
                    ) {
                        KaraokeLine(
                            line = MinimalLyricLine(text = shot.text, startSec = 0.0, endSec = shot.seconds),
                            playback = playback(),
                            clock = clock,
                            color = ink.lyricUnsung(),
                            sungColor = ink.inkBright,
                            fontSize = shot.sizeSp.sp,
                        )
                    }
                }
            }
        }
        compose.mainClock.advanceTimeByFrame()
        compose.mainClock.advanceTimeByFrame()
    }

    /** 把时钟推到某一秒并抓一张整窗像素（缓冲区复用，避免 Robolectric 里的位图抖动）。 */
    private fun shootAt(seconds: Double): Bitmap {
        clock.longValue = (seconds * 1000).toLong()
        compose.mainClock.advanceTimeBy(16)
        compose.mainClock.advanceTimeByFrame()
        val view = compose.activity.window.decorView
        val buffer = canvas?.takeIf { it.width == view.width && it.height == view.height }
            ?: Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888).also { canvas = it }
        view.draw(AndroidCanvas(buffer))
        return buffer
    }

    private fun saveSpeech(bitmap: Bitmap, shot: Shot, name: String) {
        val layout = probe ?: error("probe layout missing")
        val x = originX.toInt().coerceAtLeast(0)
        val y = (originY.toInt() - 6).coerceIn(0, bitmap.height - 1)
        val w = min(layout.size.width + 8, bitmap.width - x)
        val h = min(layout.size.height + 12, bitmap.height - y)
        if (w <= 0 || h <= 0) return
        outDir.mkdirs()
        val crop = Bitmap.createBitmap(bitmap, x, y, w, h)
        FileOutputStream(File(outDir, "$name.png")).use {
            crop.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
    }

    // ---------------------------------------------------------------- 测量

    private fun relLum(argb: Int): Double {
        fun channel(v: Int): Double {
            val s = v / 255.0
            return if (s <= 0.03928) s / 12.92 else ((s + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * channel((argb shr 16) and 0xFF) +
            0.7152 * channel((argb shr 8) and 0xFF) +
            0.0722 * channel(argb and 0xFF)
    }

    private fun contrast(a: Double, b: Double): Double =
        (max(a, b) + 0.05) / (min(a, b) + 0.05)

    /** 半透明文字压在页面底色上的实际颜色（SrcOver 的 sRGB 近似）。 */
    private fun over(color: Color, page: Color): Int {
        val alpha = color.alpha
        fun mix(fg: Int, bg: Int) = (fg * alpha + bg * (1 - alpha)).toInt().coerceIn(0, 255)
        val fg = color.toArgb()
        val bg = page.toArgb()
        return (0xFF shl 24) or
            (mix((fg shr 16) and 0xFF, (bg shr 16) and 0xFF) shl 16) or
            (mix((fg shr 8) and 0xFF, (bg shr 8) and 0xFF) shl 8) or
            mix(fg and 0xFF, bg and 0xFF)
    }

    private class BandStat(val edge: Int, val filled: Int, val inked: Int, val peakLum: Double) {
        val fraction: Double get() = if (inked <= 0) 0.0 else filled.toDouble() / inked
    }

    private fun bandsOf(bitmap: Bitmap, shot: Shot, light: Boolean): List<BandStat> {
        val layout = probe ?: error("probe layout missing")
        val ink = minimalInk(light)
        val page = if (light) lightPage else darkPage
        val bgLum = relLum(page.toArgb())
        val unsungLum = relLum(over(ink.lyricUnsung(), page))
        val sungLum = relLum(over(ink.inkBright, page))
        val origin = originY.toInt()

        return (0 until layout.lineCount).map { index ->
            val top = (origin + layout.getLineTop(index).toInt()).coerceIn(0, bitmap.height - 1)
            val bottom = (origin + layout.getLineBottom(index).toInt()).coerceIn(top + 1, bitmap.height)
            val width = min(layout.size.width + 8, bitmap.width)
            var edge = -1
            var filled = 0
            var inked = 0
            var peak = bgLum
            val row = IntArray(width)
            for (y in top until bottom) {
                bitmap.getPixels(row, 0, width, 0, y, width, 1)
                for (x in 0 until width) {
                    val lum = relLum(row[x])
                    if (abs(lum - bgLum) > 0.02) {
                        inked++
                        // 取"离底色最远"的那个像素：深色页面文字比底色亮，浅色页面比底色暗。
                        if (abs(lum - bgLum) > abs(peak - bgLum)) peak = lum
                        // 离"已唱色"比离"未唱色"更近 → 这个像素算已唱。
                        if (abs(lum - sungLum) < abs(lum - unsungLum)) {
                            filled++
                            edge = max(edge, x)
                        }
                    }
                }
            }
            BandStat(edge, filled, inked, peak)
        }
    }

    // ---------------------------------------------------------------- 用例

    @Test
    fun twoLineWrapKeepsTheFirstLineFilled() = runWrapCase(twoLine, light = false)

    @Test
    fun threeLineWrapKeepsEveryFinishedLineFilled() = runWrapCase(threeLine, light = false)

    @Test
    fun englishWrapKeepsTheFirstLineFilled() = runWrapCase(english, light = false)

    /** 浅色页面上折行同样只前进（配色不同，几何相同，但一起跑才是真的两套主题都验过）。 */
    @Test
    fun lightThemeWrapKeepsTheFirstLineFilled() = runWrapCase(twoLine, light = true)

    private fun runWrapCase(shot: Shot, light: Boolean) {
        start(shot, light)
        val layout = probe ?: error("probe layout missing")
        assertTrue("${shot.name} 至少要换两行", layout.lineCount >= 2)

        // 参考值：整句唱完时每一行的填充占比（抗锯齿会让它略小于 1）。
        val doneStats = bandsOf(shootAt(shot.seconds), shot, light)
        val fullFraction = doneStats.map { it.fraction }
        assertTrue("${shot.name} 唱完后第一行应基本填满：${fullFraction[0]}", fullFraction[0] >= 0.8)

        val chars = shot.text.length
        val lineEnds = (0 until layout.lineCount).map { layout.getLineEnd(it, visibleEnd = true) }
        // 稀疏扫全程 + 在每条折行边界做逐帧密扫（1/12 个字一帧）。
        val dense = ArrayList<Double>()
        for (end in lineEnds.dropLast(1)) {
            var p = (end - 1).toDouble()
            val stop = (end + 3).coerceAtMost(chars).toDouble()
            while (p <= stop) {
                dense += p
                p += 1.0 / 12.0
            }
        }
        val sparse = (0..chars step 2).map { it.toDouble() - 0.5 }.filter { it >= 0.0 }
        val positions = (sparse + dense).distinct().sorted()

        val previousEdge = IntArray(layout.lineCount) { -1 }
        var sawFirstFull = false
        var secondLineStarted = false

        for ((frame, position) in positions.withIndex()) {
            val bitmap = shootAt(shot.seconds * position / chars)
            val stats = bandsOf(bitmap, shot, light)
            if (frame < 8 || position in dense) saveSpeech(bitmap, shot, "${shot.name}${if (light) "-light" else ""}-f%02d".format(frame))

            for (line in 0 until layout.lineCount) {
                val edge = stats[line].edge
                if (previousEdge[line] >= 0 && edge >= 0) {
                    assertTrue(
                        "${shot.name}(light=$light) 第 $line 行在第 $frame 帧回退：${previousEdge[line]} → $edge px @ $position",
                        edge >= previousEdge[line] - 2,
                    )
                }
                previousEdge[line] = max(previousEdge[line], edge)
            }

            // 行 i+1 已经开始填 → 行 i 必须已经整行填满（这就是"第一行不许变灰"）。
            for (line in 0 until layout.lineCount - 1) {
                if (stats[line + 1].fraction > 0.02 && stats[line + 1].edge > 4) {
                    secondLineStarted = secondLineStarted || line == 0
                    assertTrue(
                        "${shot.name} 第 $frame 帧第 ${line + 1} 行已开始填充，" +
                            "但第 $line 行只有 ${"%.2f".format(stats[line].fraction)}（应 ≈ ${"%.2f".format(fullFraction[line])}）",
                        stats[line].fraction >= fullFraction[line] - 0.03,
                    )
                }
            }
            if (stats[0].fraction >= fullFraction[0] - 0.03) sawFirstFull = true
        }

        assertTrue("${shot.name} 第一行从未真正填满", sawFirstFull)
        assertTrue("${shot.name} 第二行从未开始填充", secondLineStarted)
        println("WRAP ${shot.name} light=$light frames=${positions.size} ok")

        saveSpeech(shootAt(shot.seconds), shot, "${shot.name}${if (light) "-light" else ""}-done")
    }

    /** 未唱 / 已唱在同一帧里的对比度。 */
    @Test
    fun unsungAndSungStayReadableOnDarkPage() = contrastCase(light = false)

    @Test
    fun unsungAndSungStayReadableOnLightPage() = contrastCase(light = true)

    private fun contrastCase(light: Boolean) {
        val shot = twoLine
        start(shot, light)
        val page = if (light) lightPage else darkPage
        val bgLum = relLum(page.toArgb())

        val unsungLum = bandsOf(shootAt(0.0), shot, light)[0].peakLum
        val sungLum = bandsOf(shootAt(shot.seconds), shot, light)[0].peakLum
        val sungVsUnsung = contrast(sungLum, unsungLum)
        val unsungVsPage = contrast(unsungLum, bgLum)
        println(
            "CONTRAST light=$light unsung=%.4f sung=%.4f sung/unsung=%.2f unsung/page=%.2f"
                .format(unsungLum, sungLum, sungVsUnsung, unsungVsPage),
        )
        saveSpeech(shootAt(shot.seconds * 0.35), shot, "contrast${if (light) "-light" else "-dark"}")

        assertTrue("浅色=$light 未唱文字与页面底色对比不足：$unsungVsPage", unsungVsPage >= 3.0)
        assertTrue("浅色=$light 已唱与未唱分辨度不足：$sungVsUnsung", sungVsUnsung >= 1.8)
    }

    /**
     * 抖动与 seek 的分界：正常播放里的几十毫秒回退不许让已唱范围倒退；
     * 但用户真把进度条往回拖，必须按新位置重算。
     */
    @Test
    fun smallRewindIsIgnoredButSeekRecomputes() {
        val shot = twoLine
        start(shot, light = false)
        fun fractionAt(seconds: Double) = bandsOf(shootAt(seconds), shot, false)[0].fraction

        val mid = fractionAt(2.6)
        val jitter = fractionAt(2.45)      // 倒退 0.15s < SEEK_RESET_SEC：按抖动处理
        val seek = fractionAt(0.6)         // 倒退 2.0s：真实 seek，重算
        println("SEEK mid=%.2f jitter=%.2f seek=%.2f".format(mid, jitter, seek))

        assertTrue("抖动不该让已唱回退：$mid → $jitter", jitter >= mid - 0.01)
        assertTrue("seek 之后应按新位置重算：mid=$mid seek=$seek", seek < mid - 0.1)
    }

    /** 字内连续：同一行内三个相邻时刻的填充边界必须依次外扩（不是整字跳）。 */
    @Test
    fun fillAdvancesInsideOneCharacter() {
        val shot = twoLine
        start(shot, light = false)
        val layout = probe ?: error("probe layout missing")
        val last = layout.getLineEnd(0, visibleEnd = true) - 1
        val secondsPerChar = shot.seconds / shot.text.length

        val edges = listOf(0.25, 0.5, 0.75).map { fraction ->
            bandsOf(shootAt((last + fraction) * secondsPerChar), shot, false)[0].edge
        }
        println("INCHAR edges=$edges")
        assertTrue("四分之一处应有填充：$edges", edges[0] > 0)
        assertTrue("半字应比四分之一更远：$edges", edges[1] > edges[0] + 2)
        assertTrue("四分之三应比半字更远：$edges", edges[2] > edges[1] + 2)
    }
}
