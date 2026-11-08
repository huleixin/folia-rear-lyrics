package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/TopScrollScrimMathTest.kt
// Top Scroll Scrim 的纯数学部分（融合取色 / 缓落曲线 / 色标分布）。
// 视觉与性能契约见 chrome/TopScrollScrim.kt 文件头；双端参数由
// test/unit/ui/designTokenParity.test.ts 门禁锁定。
class TopScrollScrimMathTest {

    @Test
    fun `页面渐变取色与 Brush 垂直插值同口径`() {
        val colors = listOf(Color(0xFF102D25), Color(0xFF010E0D), Color(0xFF010D0C))
        // 0 与 1 处必须取到端点原值。
        assertEquals(Color(0xFF102D25), pageGradientColorAt(colors, 0f))
        assertEquals(Color(0xFF010D0C), pageGradientColorAt(colors, 1f))
        // 中点：两段各插一半 —— 0.5 落在 stop0→stop1 的末端 = colors[1]。
        assertEquals(Color(0xFF010E0D), pageGradientColorAt(colors, 0.5f))
        // 0.25 = 第一段中点：#102D25 与 #010E0D 的线性中值（逐通道校验）。
        val quarter = pageGradientColorAt(colors, 0.25f)
        assertEquals((0x10 + 0x01) / 2f, quarter.red * 255f, 0.51f)
        assertEquals((0x2D + 0x0E) / 2f, quarter.green * 255f, 0.51f)
        assertEquals((0x25 + 0x0D) / 2f, quarter.blue * 255f, 0.51f)
        // 越界收敛，不抛异常。
        assertEquals(Color(0xFF102D25), pageGradientColorAt(colors, -3f))
        assertEquals(Color(0xFF010D0C), pageGradientColorAt(colors, 2f))
    }

    @Test
    fun `缓落曲线是端点零斜率的 smoothstep`() {
        assertEquals(0f, TyScrollScrim.ease(0f), 1e-6f)
        assertEquals(1f, TyScrollScrim.ease(1f), 1e-6f)
        assertEquals(0f, TyScrollScrim.ease(-1f), 1e-6f)
        assertEquals(1f, TyScrollScrim.ease(1.5f), 1e-6f)
        assertEquals(0.5f, TyScrollScrim.ease(0.5f), 1e-6f)
        // 端点零斜率：0.1 处的值必须明显低于线性值（起步平缓 = 静止更干净）。
        assertTrue(TyScrollScrim.ease(0.1f) < 0.1f)
        assertTrue(TyScrollScrim.ease(0.9f) > 0.9f)
    }

    @Test
    fun `滚动激活度在静止时为0并随行程收敛到1`() {
        val rampPx = 100f
        // 静止：首项偏移 0 → 完全干净（不画任何遮罩）。
        assertEquals(0f, scrimActivation(androidx.compose.foundation.lazy.LazyListState(0, 0), rampPx), 1e-6f)
        // 行程中点 → smoothstep(0.5) = 0.5。
        assertEquals(0.5f, scrimActivation(androidx.compose.foundation.lazy.LazyListState(0, 50), rampPx), 1e-3f)
        // 深入列表（index > 0）→ 完全消隐。
        assertEquals(1f, scrimActivation(androidx.compose.foundation.lazy.LazyListState(1, 0), rampPx), 1e-6f)
    }

    @Test
    fun `盖片色标分布与端点alpha符合规范`() {
        val colors = listOf(Color(0xFF03221A), Color(0xFF03130E), Color(0xFF031812))
        val stops = scrimOccluderStops(colors, bandTopPx = 200f, pageHeightPx = 800f, bandPx = 44f)
        // 五个色标，位置与 Token 一致且单调不减。
        assertEquals(TyScrollScrim.StopPositions.size, stops.size)
        assertEquals(TyScrollScrim.StopPositions.toList(), stops.map { it.first })
        assertTrue(stops.zipWithNext().all { (a, b) -> a.first <= b.first })
        // band 顶边（页面 200/800 处）取到的是页面渐变的真实颜色（alpha=1，完全消隐）。
        assertEquals(1f, stops.first().second.alpha, 1e-6f)
        assertEquals(pageGradientColorAt(colors, 0.25f), stops.first().second.copy(alpha = 1f))
        // band 底边 alpha = 0：内容完全清晰，无裁切感。
        assertEquals(0f, stops.last().second.alpha, 1e-6f)
    }

    @Test
    fun `模糊段半径从顶部向下递减且为轻量值`() {
        val radii = TyScrollScrim.BlurSegmentRadiiDp
        assertEquals(TyScrollScrim.BlurSegments, radii.size)
        assertTrue(radii.zipWithNext().all { (top, bottom) -> top > bottom })
        assertTrue(radii.first() <= 12f)
        assertTrue(radii.last() >= 1f)
    }
}
