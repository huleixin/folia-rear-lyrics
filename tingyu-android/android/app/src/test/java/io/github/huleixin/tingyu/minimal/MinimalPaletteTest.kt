package io.github.huleixin.tingyu.minimal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/MinimalPaletteTest.kt
// 取色移植的回归：色相绕行、直方图过滤、五个颜色的区间、逐字高亮色的对比度守卫。
class MinimalPaletteTest {

    @Test fun hueBlendTakesTheShortWayAround() {
        // 350° → 10° 走 +20°（经过 0°），不是 -340°
        assertEquals(0f, blendHue(350f, 10f, 0.5f), 0.001f)
        assertEquals(188f, blendHue(170f, 200f, 0.6f), 0.001f)
    }

    @Test fun hslRoundTripsPrimaryColours() {
        val red = rgbToHsl(Rgb(255, 0, 0))
        assertEquals(0f, red.h, 0.01f)
        assertEquals(1f, red.s, 0.01f)
        assertEquals(0.5f, red.l, 0.01f)
        val back = hslToRgb(red)
        assertEquals(255, back.r)
        assertEquals(0, back.g)
        assertEquals(0, back.b)
        assertEquals(120f, rgbToHsl(Rgb(0, 255, 0)).h, 0.01f)
        assertEquals(240f, rgbToHsl(Rgb(0, 0, 255)).h, 0.01f)
    }

    @Test fun histogramDropsNearBlackWhiteAndGrey() {
        val buckets = quantizeSamples(
            listOf(
                Rgb(4, 4, 4),          // 近黑
                Rgb(250, 250, 250),    // 近白
                Rgb(128, 128, 128),    // 灰，没有色相
                Rgb(220, 90, 40),      // 橙
                Rgb(215, 85, 45),
            )
        )
        // 只有橙色那几个桶留下
        assertTrue(buckets.isNotEmpty())
        assertTrue(buckets.all { rgbToHsl(Rgb(it.r.toInt(), it.g.toInt(), it.b.toInt())).s > 0.04f })
    }

    @Test fun tooFewColourSamplesMeansNoPalette() {
        // 总权重不足 12：宁可退回主题色，也不要从一个像素里发明色相
        assertNull(pickCoverColors(quantizeSamples(listOf(Rgb(220, 90, 40), Rgb(222, 92, 42)))))
    }

    @Test fun monochromeCoverGetsNoInventedHue() {
        val grey = (0 until 64).map { Rgb(120 + it % 8, 120 + it % 8, 120 + it % 8) }
        // 灰样本被直方图过滤掉了 —— 取色返回 null，背景退回主题色
        assertNull(pickCoverColors(quantizeSamples(grey)))
    }

    @Test fun sunsetCoverProducesWarmPageWithoutOlive() {
        val samples = (0 until 200).map { index ->
            when (index % 3) {
                0 -> Rgb(232, 140, 70)
                1 -> Rgb(196, 96, 58)
                else -> Rgb(120, 60, 40)
            }
        }
        val colors = pickCoverColors(quantizeSamples(samples))
        assertNotNull(colors)
        val palette = buildMinimalPalette(colors, light = false)
        assertTrue(palette.derived)
        // 地板色相被钉在 188° 附近（偏蓝的青绿），不会被暖色封面拉成黄绿
        val base = rgbToHsl(Rgb((palette.base shr 16) and 0xFF, (palette.base shr 8) and 0xFF, palette.base and 0xFF))
        assertTrue("base hue ${base.h}", base.h in 170f..205f)
        // 亮度落在深色区间
        assertTrue("base lightness ${base.l}", base.l in 0.08f..0.14f)
    }

    @Test fun lightThemeStaysOnPaper() {
        val samples = (0 until 200).map { Rgb(60 + it % 40, 110 + it % 30, 130 + it % 20) }
        val palette = buildMinimalPalette(pickCoverColors(quantizeSamples(samples)), light = true)
        val base = rgbToHsl(Rgb((palette.base shr 16) and 0xFF, (palette.base shr 8) and 0xFF, palette.base and 0xFF))
        assertTrue("light base ${base.l}", base.l > 0.9f)
    }

    @Test fun lyricAccentKeepsReadableContrastOnTheDarkFloor() {
        val accent = buildLyricAccent(
            primary = Hsl(210f, 0.5f, 0.3f),
            accentSource = Hsl(200f, 0.6f, 0.4f),
            light = false,
            derived = true,
            average = Hsl(210f, 0.3f, 0.25f),
        )
        val rgb = hslToRgb(accent)
        val contrast = listOf(Rgb(96, 96, 96), Rgb(112, 112, 112)).minOf { contrastRatio(rgb, it) }
        assertTrue("contrast ${contrast}", contrast >= 3.0)
        assertTrue("lightness ${accent.l}", accent.l in 0.6f..0.9f)
    }

    @Test fun nullColoursStillPaintWithThemeValues() {
        val palette = buildMinimalPalette(null, light = false)
        assertTrue(!palette.derived)
        assertEquals(255, (palette.base ushr 24) and 0xFF)
    }
}
