package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.Color
import io.github.huleixin.tingyu.minimal.Hsl
import io.github.huleixin.tingyu.minimal.Rgb
import io.github.huleixin.tingyu.minimal.rgbToHsl
import io.github.huleixin.tingyu.minimal.ui.softenAmbience
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.roundToInt

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/MinimalAmbienceBandTest.kt
//
// 1.3.182 启动闪退的回归（errors.txt: `Cannot coerce value to an empty range:
// maximum 0.6 is less than minimum 0.93098044`）。
//
// `softenAmbience` 用 base 的明度派生出场色的允许区间，直接交给 `coerceIn(min, max)`。
// 只要 base 落在主题假设之外（浅色配色被当成深色主题画，或反过来），派生的两端就会倒过来，
// 而 Kotlin 的 `coerceIn(min, max)` 在 min > max 时抛 IllegalArgumentException —— 这一抛出
// 发生在**组合期间**，于是整页连同进程一起结束。
//
// 这里的固定输入就是崩溃现场：base 的 8bit 通道 243/242 → 明度 0.95098，正是日志里
// `0.93098044 + 0.02`。断言只有两条：不许抛，并且场色必须仍然落在主题的上限之内。

class MinimalAmbienceBandTest {

    private fun hslOf(color: Color): Hsl = rgbToHsl(
        Rgb(
            (color.red * 255f).roundToInt(),
            (color.green * 255f).roundToInt(),
            (color.blue * 255f).roundToInt(),
        )
    )

    /** 崩溃现场的 base：明度 0.95098，只有浅色配色的 base 带（0.95~0.972）能产出这个值。 */
    private val lightBase = Color(0xFFF3F2F2)

    /** 场色三格用一个明显不同于 base 的深色，确保整形真的发生。 */
    private fun palette(base: Color): List<Color> = listOf(
        base,
        Color(0xFF1B2A26),
        Color(0xFF23303A),
        Color(0xFF2A2F33),
        Color(0xFF66E0C2),
        Color(0xFF9BE8D2),
    )

    @Test
    fun `light palette on dark theme does not throw and stays under the dark ceiling`() {
        // 前提：这个 base 确实是浅色配色的明度带，也就是日志里那个最小值。
        assertEquals(0.95098f, hslOf(lightBase).l, 0.0005f)

        val softened = softenAmbience(palette(lightBase), light = false)

        assertEquals(6, softened.size)
        // base 不参与整形：页面文字的对比度锚在它上面。
        assertEquals(lightBase, softened[0])
        // 深色主题的上限 0.60 —— 场色压在背景深处，不会因为配色错位把整页刷白。
        for (index in 1..3) {
            assertEquals("field #$index", 0.60f, hslOf(softened[index]).l, 0.005f)
            assertTrue("field #$index saturation", hslOf(softened[index]).s <= 0.55f + 1e-6f)
        }
    }

    @Test
    fun `dark palette on light theme does not throw either`() {
        // 反方向同样会倒区间：baseL < 0.04 时 (baseL+0.06) 低于浅色带的地板 0.10。
        val darkBase = Color(0xFF050505)
        assertEquals(0.0196f, hslOf(darkBase).l, 0.0005f)

        val softened = softenAmbience(palette(darkBase), light = true)

        assertEquals(6, softened.size)
        for (index in 1..3) {
            val hsl = hslOf(softened[index])
            assertTrue("field #$index lightness", hsl.l in 0f..1f)
            assertTrue("field #$index saturation", hsl.s <= 0.55f + 1e-6f)
        }
    }

    @Test
    fun `every base lightness is clamped in both themes`() {
        for (step in 0..32) {
            val channel = step * 255 / 32
            val argb = (0xFF shl 24) or (channel shl 16) or (channel shl 8) or channel
            val base = Color(argb)
            for (light in listOf(false, true)) {
                val softened = softenAmbience(palette(base), light)
                assertEquals(6, softened.size)
                for (index in 1..3) {
                    val hsl = hslOf(softened[index])
                    assertTrue("base=$channel light=$light field #$index l=${hsl.l}", hsl.l in 0f..1f)
                    assertTrue("base=$channel light=$light field #$index s=${hsl.s}", hsl.s <= 0.55f + 1e-6f)
                }
            }
        }
    }

    /**
     * 合法输入下结果必须和旧公式逐位一致 —— 这次只允许改「越界时不崩」，不允许改配色。
     *
     * 旧公式：`l.coerceIn((baseL - Δ).coerceAtLeast(floor), (baseL + Δ').coerceAtMost(ceiling))`。
     * 8bit 量化会带来 ±1/255 的差，所以按这个量级比较。
     */
    @Test
    fun `in-band palettes keep the exact old formula`() {
        // 两个主题真实会产出的 base 明度带（DARK 0.09~0.12 / LIGHT 0.95~0.972）。
        val bands = listOf(false to 0.09f..0.12f, true to 0.95f..0.972f)
        for ((light, band) in bands) {
            var baseL = band.start
            while (baseL <= band.endInclusive + 1e-4f) {
                val baseChannel = (baseL * 255f).roundToInt()
                val base = Color((0xFF shl 24) or (baseChannel shl 16) or (baseChannel shl 8) or baseChannel)
                val measuredBase = hslOf(base).l
                for (channel in listOf(10, 60, 120, 200, 250)) {
                    val field = Color((0xFF shl 24) or (channel shl 16) or (channel shl 8) or channel)
                    val fieldL = hslOf(field).l
                    val old = if (light) {
                        fieldL.coerceIn(
                            (measuredBase - 0.20f).coerceAtLeast(0.10f),
                            (measuredBase + 0.06f).coerceAtMost(0.92f),
                        )
                    } else {
                        fieldL.coerceIn(
                            (measuredBase - 0.02f).coerceAtLeast(0.05f),
                            (measuredBase + 0.20f).coerceAtMost(0.60f),
                        )
                    }
                    val actual = hslOf(softenAmbience(palette(base).toMutableList().also { it[1] = field }, light)[1]).l
                    assertEquals("base=${baseChannel} field=$channel light=$light", old, actual, 1f / 255f)
                }
                baseL += 0.005f
            }
        }
    }
}
