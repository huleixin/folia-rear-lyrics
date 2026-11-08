package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.Color
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ChromeGlassMaterialTest.kt
//
// 液态玻璃参数护栏（1.3.189 玻璃专项）。
//
// 这些断言不是为了「测好看」——它们锁住三件曾经导致听屿玻璃偏绿、发浑、边缘假的事实：
//   1. 表面底色必须是中性灰（旧值 #F1F4ED / #303B36 / 边框 #315D43 全部带绿）；
//   2. 表面不透明度必须落在 Liquid Glass 的通透区间（旧值 52%/64% 是磨砂区间）；
//   3. 折射带/位移必须成对出现在官方量级（旧值 12/16.2 无法在 54dp 底栏上形成可见折射）。
class ChromeGlassMaterialTest {

    private fun channels(color: Color): List<Int> =
        listOf((color.red * 255f).toInt(), (color.green * 255f).toInt(), (color.blue * 255f).toInt())

    /** 中性色判据：RGB 三通道极差不超过 1/255（#FAFAFA / #121212 都是严格中性）。 */
    private fun isNeutral(color: Color): Boolean {
        val c = channels(color)
        return c.max() - c.min() <= 1
    }

    @Test fun defaultPresetIsTheGeometricallyScaledOne() {
        assertEquals("liquid", ChromeGlassPresets.Default.key)
        assertSame(ChromeGlassPresets.Liquid, ChromeGlassPresets.Default)
        // 未知 / 缺失的 key 必须回落到默认，不能抛异常（构建参数写错不允许白屏）。
        assertSame(ChromeGlassPresets.Default, ChromeGlassPresets.byKey(null))
        assertSame(ChromeGlassPresets.Default, ChromeGlassPresets.byKey(""))
        assertSame(ChromeGlassPresets.Default, ChromeGlassPresets.byKey("nope"))
        assertSame(ChromeGlassPresets.Official, ChromeGlassPresets.byKey("official"))
        assertSame(ChromeGlassPresets.Crisp, ChromeGlassPresets.byKey("crisp"))
        // 首次专项用过的 key 作为别名保留，避免旧环境变量静默换参数。
        assertSame(ChromeGlassPresets.Liquid, ChromeGlassPresets.byKey("proportional"))
    }

    @Test fun officialPresetKeepsTheKyantBaseline() {
        // 基线来自 tag 1.0.6 的 LiquidBottomTabs：blur 8dp / lens(24dp, 24dp) / 40% 表面。
        val official = ChromeGlassPresets.Official
        assertEquals(8f, official.blur.value, 0.001f)
        assertEquals(24f, official.lensHeight.value, 0.001f)
        assertEquals(24f, official.lensAmount.value, 0.001f)
        assertEquals(0.40f, official.lightSurface.alpha, 0.001f)
        assertEquals(0.40f, official.darkSurface.alpha, 0.001f)
        assertFalse(official.depthEffect)
    }

    @Test fun everyPresetUsesNeutralGlassNotBrandGreen() {
        for (preset in ChromeGlassPresets.all) {
            assertTrue("${preset.key} 浅色表面必须中性", isNeutral(preset.lightSurface))
            assertTrue("${preset.key} 深色表面必须中性", isNeutral(preset.darkSurface))
        }
    }

    @Test fun surfaceStaysInsideTheTransparentBand() {
        for (preset in ChromeGlassPresets.all) {
            val light = preset.surface(true, ChromeGlassPresets.NavFill).alpha
            val dark = preset.surface(false, ChromeGlassPresets.NavFill).alpha
            assertTrue("${preset.key} 浅色 ${light} 太薄", light >= 0.32f)
            assertTrue("${preset.key} 浅色 ${light} 回到磨砂区间", light <= 0.50f)
            assertTrue("${preset.key} 深色 ${dark} 太薄", dark >= 0.32f)
            assertTrue("${preset.key} 深色 ${dark} 回到蒙层区间", dark <= 0.50f)
        }
    }

    @Test fun miniPlayerIsDenserThanTheBarButSameMaterial() {
        for (preset in ChromeGlassPresets.all) {
            val bar = preset.surface(true, ChromeGlassPresets.NavFill).alpha
            val mini = preset.surface(true, ChromeGlassPresets.MiniFill).alpha
            assertTrue("迷你播放器应比底栏厚一档", mini > bar)
            assertTrue("但不应越过 0.56 变成实心条", mini <= 0.56f)
        }
    }

    @Test fun refractionIsPairedAndInsideTheOfficialMagnitude() {
        for (preset in ChromeGlassPresets.all) {
            assertTrue("${preset.key} 模糊半径过高会糊掉页面", preset.blur.value in 5f..9f)
            assertTrue("${preset.key} 折射带须在官方量级", preset.lensHeight.value in 14f..26f)
            assertTrue("${preset.key} 折射位移须在官方量级", preset.lensAmount.value in 12f..26f)
            // 位移小于折射带的 60% 时边缘几乎看不出弯折（旧值 12/16.2 = 74% 但带太薄）。
            assertTrue("${preset.key} 折射位移与折射带不匹配", preset.lensAmount.value >= preset.lensHeight.value * 0.6f)
        }
    }

    @Test fun edgeIsOpticsNotAStroke() {
        for (preset in ChromeGlassPresets.all) {
            assertTrue("高光厚度至少 0.5dp（库按 ceil(width*2) 出笔画）", preset.highlightWidth.value >= 0.5f)
            assertTrue("高光过厚会变白边", preset.highlightWidth.value <= 1.2f)
            assertTrue(preset.highlightAlpha in 0.5f..1f)
            assertTrue(preset.innerShadowRadius.value in 4f..12f)
            assertTrue(preset.innerShadowAlpha in 0f..0.6f)
        }
    }

    @Test fun surfaceFillOnlyMovesAlphaAndClamps() {
        val spec = ChromeGlassPresets.Liquid
        val base = spec.surface(true, 1f)
        assertEquals(spec.lightSurface.red, base.red, 0.0001f)
        assertEquals(0.40f, base.alpha, 0.001f)
        assertEquals(0.20f, spec.surface(true, 0.5f).alpha, 0.001f)
        assertEquals(1f, spec.surface(true, 99f).alpha, 0.001f)
        // fill 不能改色调：加厚只是更不透明，不会重新染色。
        assertEquals(spec.lightSurface.green, spec.surface(true, 3f).green, 0.0001f)
    }

    @Test fun legacyFallbackIsNeutralToo() {
        // API<31 没有 RenderEffect，只能半透明降级 —— 但同样不许再用品牌绿。
        for (preset in ChromeGlassPresets.all) {
            assertTrue(preset.fallbackLightAlpha in 0.7f..0.95f)
            assertTrue(preset.fallbackDarkAlpha in 0.7f..0.96f)
            assertTrue(abs(preset.fallbackLightAlpha - preset.fallbackDarkAlpha) < 0.2f)
        }
    }
}
