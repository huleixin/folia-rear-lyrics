package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.luminance
import dev.chrisbanes.haze.HazeState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/TopGlassMathTest.kt
// 沉浸式毛玻璃顶栏的纯数学部分（取色 / smoothstep / 玻璃蒙版分布）。
// 视觉与性能契约见 chrome/TopGlassBar.kt 文件头；双端参数由
// test/unit/ui/designTokenParity.test.ts 门禁锁定。
class TopGlassMathTest {

    @Test
    fun `衰减曲线是端点零斜率的 smoothstep`() {
        assertEquals(0f, TyTopGlass.ease(0f), 1e-6f)
        assertEquals(1f, TyTopGlass.ease(1f), 1e-6f)
        assertEquals(0.5f, TyTopGlass.ease(0.5f), 1e-6f)
        assertTrue(TyTopGlass.ease(0.1f) < 0.1f)
        assertTrue(TyTopGlass.ease(0.9f) > 0.9f)
    }

    @Test
    fun `玻璃蒙版主体保持全强度且底部平滑落到零`() {
        // 顶栏主体 120px + 衰减 32px。
        val stops = topGlassMaskStops(headerBottomPx = 120f, tailPx = 32f)
        // 位置单调不减；第一个是 0。
        assertTrue(stops.zipWithNext().all { (a, b) -> a.first <= b.first })
        assertEquals(0f, stops.first().first, 1e-6f)
        // 主体平台：位置 0 与 headerBottom 处 alpha 均为 1（玻璃全强度，无内部折点）。
        assertEquals(1f, stops[0].second.alpha, 1e-6f)
        assertEquals(1f, stops[1].second.alpha, 1e-6f)
        assertEquals(120f / 152f, stops[1].first, 1e-4f)
        // 最末段 alpha = 0：顶栏底缘与页面无缝衔接，无水平分界线。
        assertEquals(0f, stops.last().second.alpha, 1e-6f)
        // 衰减段与 Token 采样一致（数量 = DecayPositions.size，主体平台占两档）。
        assertEquals(TyTopGlass.DecayPositions.size + 1, stops.size)
    }

    @Test
    fun `玻璃材质参数保留透明感并锁定可读性基线`() {
        assertEquals(14, TyTopGlass.BlurDp)
        assertEquals(32, TyTopGlass.TailDp)
        assertEquals(0.55f, TyTopGlass.TintAlphaDark, 1e-6f)
        assertEquals(0.68f, TyTopGlass.TintAlphaLight, 1e-6f)
        assertTrue(TyTopGlass.BlurDp in 6..14)
        assertTrue(TyTopGlass.TailDp in 24..40)
        assertTrue(TyTopGlass.TintAlphaDark in 0.5f..0.75f)
        assertTrue(TyTopGlass.TintAlphaLight in 0.5f..0.75f)
        assertTrue(TyTopGlass.TintAlphaLight > TyTopGlass.TintAlphaDark)
    }

    @Test
    fun `不同密度和首帧估计高度的蒙版均保持平台和连续单调落零`() {
        for (density in listOf(1f, 2f, 2.75f, 3.5f)) {
            for (headerDp in listOf(52f, 120f, 240f)) {
                val stops = topGlassMaskStops(headerDp * density, TyTopGlass.TailDp * density)
                assertEquals(headerDp / (headerDp + TyTopGlass.TailDp), stops[1].first, 1e-6f)
                assertEquals(1f, stops.last().first, 1e-6f)
                assertEquals(0f, stops.last().second.alpha, 1e-6f)
                assertTrue(stops.all { it.first in 0f..1f && it.second.alpha in 0f..1f })
                assertTrue(stops.zipWithNext().all { (a, b) -> a.first <= b.first && a.second.alpha >= b.second.alpha })
                // 同一 mask 覆盖模糊与 tint：即使蒙层增强，尾端有效 alpha 仍为 0。
                assertEquals(0f, stops.last().second.alpha * TyTopGlass.TintAlphaLight, 1e-6f)
                assertEquals(0f, stops.last().second.alpha * TyTopGlass.TintAlphaDark, 1e-6f)
            }
        }
    }

    @Test
    fun `实际蒙版在完整尾带内贴合 smoothstep 而不是五点突降折线`() {
        assertEquals(TyTopGlass.DecaySteps + 1, TyTopGlass.DecayPositions.size)
        assertEquals(TyTopGlass.DecayPositions.size, TyTopGlass.DecayAlphas.size)
        assertTrue(TyTopGlass.TailDp.toFloat() / TyTopGlass.DecaySteps <= 1f)
        for (density in listOf(1f, 2f, 2.75f, 3.5f)) {
            val header = 120f * density
            val tail = TyTopGlass.TailDp * density
            val stops = topGlassMaskStops(header, tail)
            for (step in 0..256) {
                val t = step / 256f
                val actual = maskAlphaAt(stops, header + t * tail, header + tail)
                // 包含实际 Color alpha 的 8-bit 量化及渐变线性插值误差。
                assertEquals("density=$density, t=$t", 1f - TyTopGlass.ease(t), actual, 0.003f)
            }
        }
    }

    @Test
    fun `主体和尾带交界两端半 dp 内的强度变化低于千分之三`() {
        val header = 120f
        val tail = TyTopGlass.TailDp.toFloat()
        val stops = topGlassMaskStops(header, tail)
        val total = header + tail
        assertEquals(1f, maskAlphaAt(stops, header - 0.5f, total), 1e-6f)
        assertEquals(1f, maskAlphaAt(stops, header, total), 1e-6f)
        assertTrue(1f - maskAlphaAt(stops, header + 0.5f, total) < 0.003f)
        assertTrue(maskAlphaAt(stops, total - 0.5f, total) < 0.003f)
        assertEquals(0f, maskAlphaAt(stops, total, total), 1e-6f)
        assertEquals(0f, maskAlphaAt(stops, total + 0.5f, total), 1e-6f)
    }

    @Test
    fun `浅色标题副标题音源标签与搜索文字在极端封面上仍有足够对比度`() {
        val foregrounds = listOf(InterfacePalette(true).topInk, InterfacePalette(true).topMuted, InterfacePalette(true).topAccent)
        // 黑白和彩色封面极值；真实 GPU 模糊及滚动观感需另行真机验证。
        val samples = listOf(Color.Black, Color.White, Color.Red, Color.Green, Color.Blue, Color.Cyan, Color.Magenta, Color.Yellow)
        for (pageColor in InterfacePalette(true).backgrounds) {
            val tint = pageColor.copy(alpha = TyTopGlass.TintAlphaLight)
            for (sample in samples) {
                val glass = tint.compositeOver(sample)
                val surfaces = listOf(glass, InterfacePalette(true).subtle.compositeOver(glass), InterfacePalette(true).selected.compositeOver(glass))
                for (surface in surfaces) {
                    for (foreground in foregrounds) {
                        val ratio = (surface.luminance() + 0.05f) / (foreground.luminance() + 0.05f)
                        assertTrue("contrast=$ratio, sample=$sample, foreground=$foreground", ratio >= 4.5f)
                    }
                }
            }
        }
    }

    @Test
    fun `高度测量前使用估计值测量后只覆盖顶栏加尾带`() {
        val state = TyTopGlassState(HazeState(initialBlurEnabled = false), 120f)
        assertEquals(120f, state.headerBottomDp, 1e-6f)
        assertEquals(152f, state.contentTop.value, 1e-6f)
        state.pxPerDp = 2f
        state.pageHeightPx = 800f
        state.reportOrigin(100f)
        state.reportHeader(100f, 280)
        assertEquals(140f, state.headerBottomDp, 1e-6f)
        assertEquals(172f, state.contentTop.value, 1e-6f)
    }

    @Test
    fun `误测整页高度回退估计值且估计值仍受页面百分之六十限制`() {
        val state = TyTopGlassState(HazeState(initialBlurEnabled = false), 120f)
        state.pxPerDp = 2f
        state.pageHeightPx = 800f
        state.reportOrigin(100f)
        state.reportHeader(100f, 800)
        assertEquals(120f, state.headerBottomDp, 1e-6f)
        state.headerBottomEstimateDp = 500f
        // 400f * 0.6f 的 Float 结果为 240.00002；容差远小于一个物理像素。
        assertEquals(240f, state.headerBottomDp, 1e-4f)
    }

    /** 沿实际蒙版色标做线性插值，测试边缘邻域而不只检查首尾两个色标。 */
    private fun maskAlphaAt(stops: List<Pair<Float, Color>>, yPx: Float, totalPx: Float): Float {
        val y = (yPx / totalPx).coerceIn(0f, 1f)
        val (a, b) = stops.zipWithNext().first { (a, b) -> y >= a.first && y <= b.first }
        val t = (y - a.first) / (b.first - a.first)
        return a.second.alpha + (b.second.alpha - a.second.alpha) * t
    }
}
