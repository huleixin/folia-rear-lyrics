package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.Color
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
    fun `玻璃材质参数为轻量克制值`() {
        assertTrue(TyTopGlass.BlurDp in 6..14)
        assertTrue(TyTopGlass.TailDp in 24..40)
        assertTrue(TyTopGlass.TintAlphaDark in 0.3f..0.7f)
        assertTrue(TyTopGlass.TintAlphaLight in 0.3f..0.7f)
    }
}
