package io.github.huleixin.tingyu.minimal.ui

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.MinimalGraphemeTimeline
import io.github.huleixin.tingyu.minimal.MinimalLyricLine
import io.github.huleixin.tingyu.minimal.graphemeTimeline
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/ui/MinimalKaraokeFillTest.kt
//
// 逐字填充的**几何**回归（第 19 轮）。
//
// 这里不跑像素，直接把「唱到第几个字形」喂给填充算法，读它写出的裁剪矩形：
//   · 每个显示行各自一个矩形，第一行唱完就满，第二行从行首接上；
//   · 正常播放（游标只前进）时，任何一行的填充宽度都不许变小；
//   · 字内是连续插值，不是整字跳变。
//
// 同一个断言集同时跑一份**旧实现**（getLineForOffset + 两行位置相减）的复刻，
// 它会失败 —— 这就是"第一行回退"的取证，说明测试确实抓得住这个 bug。

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class MinimalKaraokeFillTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private class Case(val name: String, val text: String, val widthDp: Int, val sizeSp: Float, val seconds: Double)

    private val cases = listOf(
        Case("两行中文", "想起我们也曾是旁人最羡慕的一对", 250, 30f, 5.2),
        Case("三行中文", "最后我说的再见要多惭愧想起我们也曾是旁人最羡慕的一对", 250, 30f, 7.4),
        Case("英文折行", "the lighthouse stitches the sea into a line of light", 250, 30f, 6.0),
        Case("中英标点 Emoji", "灯塔把海面缝成一条线，然后 🌊 又散开，再缝一次", 250, 30f, 6.6),
        Case("放大字号", "想起我们也曾是旁人最羡慕的一对", 250, 34f, 5.2),
    )

    private val layouts = HashMap<String, TextLayoutResult>()

    /** 一次组合量出所有用例的排版；宽度固定，所以行边界是确定的。 */
    private fun measureAll() {
        if (layouts.isNotEmpty()) return
        val captured = HashMap<String, TextLayoutResult>()
        compose.setContent {
            Column {
                for (case in cases) {
                    Column(Modifier.width(case.widthDp.dp)) {
                        Text(
                            text = case.text,
                            fontSize = case.sizeSp.sp,
                            fontWeight = FontWeight.SemiBold,
                            lineHeight = case.sizeSp.sp * 1.22f,
                            letterSpacing = (case.sizeSp * -0.008f).sp,
                            onTextLayout = { result -> captured[case.name] = result },
                        )
                    }
                }
            }
        }
        compose.waitForIdle()
        layouts.putAll(captured)
    }

    private fun timelineOf(case: Case): MinimalGraphemeTimeline =
        MinimalLyricLine(text = case.text, startSec = 0.0, endSec = case.seconds).graphemeTimeline

    /** 按行 y 把矩形对回显示行：算法只会为有内容可填的行输出矩形。 */
    private fun widthOf(rects: List<Rect>, layout: TextLayoutResult, lineIndex: Int): Float {
        val top = layout.getLineTop(lineIndex)
        return rects.firstOrNull { kotlin.math.abs(it.top - top) < 0.5f }?.width ?: 0f
    }

    @Test
    fun everyLineFillsForwardAndTheFirstLineNeverGoesBack() {
        measureAll()
        for (case in cases) {
            val layout = layouts.getValue(case.name)
            val timeline = timelineOf(case)
            assertTrue("${case.name} 至少要换行", layout.lineCount >= 2)

            val steps = 400
            val last = timeline.graphemes.size.toFloat()
            var previous = FloatArray(layout.lineCount)
            var firstLineFullAt = -1
            var secondLineStartsAt = -1

            for (step in 0..steps) {
                val position = last * step / steps
                val rects = karaokeRects(layout, timeline, position)
                for (line in 0 until layout.lineCount) {
                    val width = widthOf(rects, layout, line)
                    assertTrue(
                        "${case.name} 第 $line 行在 position=$position 变窄了：${previous[line]} → $width",
                        width >= previous[line] - 0.01f,
                    )
                    previous[line] = width
                }
                if (firstLineFullAt < 0 &&
                    widthOf(rects, layout, 0) >= layout.getLineRight(0) - 0.5f
                ) {
                    firstLineFullAt = step
                }
                if (secondLineStartsAt < 0 && widthOf(rects, layout, 1) > 0.5f) {
                    secondLineStartsAt = step
                    assertTrue(
                        "${case.name} 第二行开始填充时第一行还没满",
                        widthOf(rects, layout, 0) >= layout.getLineRight(0) - 0.5f,
                    )
                }
            }
            assertTrue("${case.name} 第一行从未填满", firstLineFullAt >= 0)
            assertTrue("${case.name} 第二行从未开始填充", secondLineStartsAt >= 0)
            assertTrue(
                "${case.name} 第一行应在第二行之前（或同时）填满",
                firstLineFullAt <= secondLineStartsAt,
            )
            // 唱完之后整行都是满的。
            val end = karaokeRects(layout, timeline, last)
            for (line in 0 until layout.lineCount) {
                assertEquals(
                    "${case.name} 第 $line 行唱完后应填满",
                    layout.getLineRight(line).toDouble(),
                    widthOf(end, layout, line).toDouble(),
                    1.0,
                )
            }
        }
    }

    @Test
    fun fillIsContinuousInsideOneCharacter() {
        measureAll()
        val case = cases.first()
        val layout = layouts.getValue(case.name)
        val timeline = timelineOf(case)

        // 第一行的最后一个字符：0.5 的簇内进度必须落在它自己的起止之间，而不是整字跳。
        val lineEnd = layout.getLineEnd(0, visibleEnd = true)
        val charStart = layout.getHorizontalPosition(lineEnd - 1, usePrimaryDirection = false)
        // 行尾偏移的横坐标要取**本行右边界**：getHorizontalPosition(行尾) 会归到下一行。
        val charEnd = layout.getLineRight(0)
        assertTrue("测试前提：最后一字有宽度", charEnd - charStart > 1f)

        val at25 = widthOf(karaokeRects(layout, timeline, (lineEnd - 1) + 0.25f), layout, 0)
        val at50 = widthOf(karaokeRects(layout, timeline, (lineEnd - 1) + 0.50f), layout, 0)
        val at75 = widthOf(karaokeRects(layout, timeline, (lineEnd - 1) + 0.75f), layout, 0)

        assertTrue("25% 应已越过字首", at25 > charStart + 0.1f * (charEnd - charStart))
        assertTrue("50% 应在字中间", at50 > at25 && at50 < charEnd - 0.1f * (charEnd - charStart))
        assertTrue("75% 应继续前进", at75 > at50 && at75 <= charEnd + 0.01f)
    }

    @Test
    fun englishWrapKeepsTheFirstLineFull() {
        measureAll()
        val case = cases.first { it.name == "英文折行" }
        val layout = layouts.getValue(case.name)
        val timeline = timelineOf(case)
        val lineEnd = layout.getLineEnd(0, visibleEnd = true)

        // 从第一行最后一个字符开始，逐 0.05 字推进到第二行中间。
        var previous = 0f
        var position = (lineEnd - 1).toFloat()
        while (position <= lineEnd + 3f) {
            val width = widthOf(karaokeRects(layout, timeline, position), layout, 0)
            assertTrue("英文折行处第一行回退：$previous → $width @ $position", width >= previous - 0.01f)
            if (position > lineEnd) {
                assertEquals(
                    "第一行唱完后应整行填满",
                    layout.getLineRight(0).toDouble(),
                    width.toDouble(),
                    0.6,
                )
            }
            previous = width
            position += 0.05f
        }
    }

    @Test
    fun legacyGeometryRewindsTheFirstLineAtTheWrap() {
        measureAll()
        val case = cases.first()
        val layout = layouts.getValue(case.name)
        val timeline = timelineOf(case)
        val lineEnd = layout.getLineEnd(0, visibleEnd = true)

        // 旧实现在折行处把第一行从"整行"缩回"行首附近"：这正是用户看到的回退。
        val before = widthOf(legacyRects(layout, timeline, (lineEnd - 1) + 0.9f), layout, 0)
        val after = widthOf(legacyRects(layout, timeline, (lineEnd - 1) + 0.99f), layout, 0)
        assertTrue("旧实现应当在这里回退（取证用）", after < before - 1f)

        // 新实现在同一点继续前进。
        val newBefore = widthOf(karaokeRects(layout, timeline, (lineEnd - 1) + 0.9f), layout, 0)
        val newAfter = widthOf(karaokeRects(layout, timeline, (lineEnd - 1) + 0.99f), layout, 0)
        assertTrue("新实现不许回退", newAfter >= newBefore - 0.01f)

        // 取证数字：旧实现在这一字之内把第一行从多少缩到多少。
        val legacyCurve = (0..10).map { step ->
            widthOf(legacyRects(layout, timeline, (lineEnd - 1) + step / 10f), layout, 0)
        }
        println("LEGACY curve=${legacyCurve.map { "%.0f".format(it) }} lineRight=${layout.getLineRight(0)}")
        println("LEGACY before=%.0f after=%.0f newBefore=%.0f newAfter=%.0f".format(before, after, newBefore, newAfter))
    }

    /** 旧实现的原样复刻，只用于上面的取证断言。 */
    private fun legacyRects(
        layout: TextLayoutResult,
        timeline: MinimalGraphemeTimeline,
        position: Float,
    ): List<Rect> {
        if (position <= 0f) return emptyList()
        val textLength = layout.layoutInput.text.length
        var sungChars = 0
        var clusterStart = -1
        var clusterEnd = -1
        var clusterProgress = 0f
        var remaining = position
        for (grapheme in timeline.graphemes) {
            val length = grapheme.text.length
            if (remaining >= 1f) {
                sungChars += length
                remaining -= 1f
            } else {
                clusterStart = sungChars
                clusterEnd = sungChars + length
                clusterProgress = remaining.coerceIn(0f, 1f)
                break
            }
        }
        val allSung = clusterStart < 0 || sungChars >= textLength
        val sungLine = layout.getLineForOffset(
            (if (allSung) textLength else clusterStart).coerceIn(0, textLength),
        )
        val out = ArrayList<Rect>()
        for (lineIdx in 0 until layout.lineCount) {
            val top = layout.getLineTop(lineIdx)
            val bottom = layout.getLineBottom(lineIdx)
            when {
                lineIdx < sungLine -> out += Rect(0f, top, layout.size.width.toFloat(), bottom)
                lineIdx == sungLine -> {
                    val x = if (allSung) {
                        layout.size.width.toFloat()
                    } else {
                        val lineLeft = layout.getLineLeft(sungLine)
                        val lineRight = layout.getLineRight(sungLine)
                        val from = layout.getHorizontalPosition(
                            clusterStart.coerceIn(0, textLength), usePrimaryDirection = true,
                        )
                        val to = layout.getHorizontalPosition(
                            clusterEnd.coerceIn(0, textLength), usePrimaryDirection = true,
                        )
                        val a = from.coerceIn(lineLeft, lineRight)
                        val b = to.coerceIn(lineLeft, lineRight)
                        (if (b >= a) a + (b - a) * clusterProgress else a - (a - b) * clusterProgress)
                            .coerceIn(0f, layout.size.width.toFloat())
                    }
                    out += Rect(0f, top, x, bottom)
                }
            }
        }
        return out
    }
}
