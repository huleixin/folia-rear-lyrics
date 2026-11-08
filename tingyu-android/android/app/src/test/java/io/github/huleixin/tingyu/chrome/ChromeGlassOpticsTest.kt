package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.unit.dp
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.sqrt

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ChromeGlassOpticsTest.kt
//
// 折射可辨识性护栏（1.3.188 二次专项）。
//
// 这不是"审美测试"，它复刻 Shaders.kt 里 RoundedRectRefractionShaderString 的位移公式：
//
//     d(depth) = amount * circleMap(1 - depth / refractionHeight)
//     circleMap(x) = 1 - sqrt(1 - x²)
//
// 并锁住一条结论：**只有当「位移 ≥ 一倍模糊半径」的环宽大于模糊半径时，肉眼才看得见折射。**
// 上一版之所以看起来还是高斯模糊面板，就是因为这个比值只有 0.5 左右：
//   · 首版 band 12dp / amount 16.2dp / blur 4dp → rimToBlur 1.03（但环只有 4.1dp）
//   · 二次 band 20dp / amount 20dp / blur 8dp   → rimToBlur 0.76（模糊翻倍，环没变宽）
class ChromeGlassOpticsTest {

    /** 与 shader 同构的位移曲线，用于交叉验证 ChromeGlassSpec.displacementAt。 */
    private fun reference(depth: Float, band: Float, amount: Float): Float {
        if (band <= 0f || amount <= 0f) return 0f
        if (depth <= 0f) return amount
        if (depth >= band) return 0f
        val u = 1f - depth / band
        return amount * (1f - sqrt(1f - u * u))
    }

    private fun spec(blur: Float, band: Float, amount: Float) =
        ChromeGlassPresets.Default.copy(blur = blur.dp, lensHeight = band.dp, lensAmount = amount.dp)

    @Test fun displacementMatchesTheShaderProfile() {
        val s = ChromeGlassPresets.Default
        val band = s.lensHeight.value
        val amount = s.lensAmount.value
        // 边缘取满位移；半深取 circleMap(0.5)=0.13397；超出 band 归零。
        assertEquals(amount, s.displacementAt(0f), 0.001f)
        assertEquals(amount * (1f - sqrt(1f - 0.25f)), s.displacementAt(band / 2f), 0.001f)
        assertEquals(0f, s.displacementAt(band), 0.001f)
        assertEquals(0f, s.displacementAt(band + 5f), 0.001f)
        for (d in listOf(0f, 1f, 3.5f, 12f, band - 0.5f, band)) {
            assertEquals("depth=$d", reference(d, band, amount), s.displacementAt(d), 0.001f)
        }
    }

    /** 默认预设必须让折射环明显宽于模糊半径，否则"折射"只是心理作用。 */
    @Test fun defaultPresetKeepsRefractionWiderThanBlur() {
        val s = ChromeGlassPresets.Default
        assertTrue("visibleRim 至少要 8dp 才看得出弯折，实际 ${s.visibleRim}", s.visibleRim >= 8f)
        assertTrue("rimToBlur 必须 >= 1.5，实际 ${s.rimToBlur}", s.rimToBlur >= 1.5f)
    }

    /** 两次历史参数必须被这个标准判为不可见 —— 固定住这次诊断的结论。 */
    @Test fun previousGenerationsFailedTheSameCriterion() {
        val first = spec(blur = 4f, band = 12f, amount = 16.2f)
        val second = spec(blur = 8f, band = 20f, amount = 20f)
        val official = ChromeGlassPresets.Official
        assertTrue("首版 rimToBlur=${first.rimToBlur}", first.rimToBlur < 1.5f)
        assertTrue("二次 rimToBlur=${second.rimToBlur}", second.rimToBlur < 1.0f)
        assertTrue("官方 64dp 基线 rimToBlur=${official.rimToBlur}", official.rimToBlur < 1.0f)
        // 二次专项把可见环宽度从 4.1dp 提到了 9.3dp 以上。
        assertTrue(ChromeGlassPresets.Default.visibleRim > second.visibleRim * 2f)
    }

    /**
     * 从边缘到中心必须单调、且内部段连续 —— 不允许"先平后跳"的台阶（那才是假折射）。
     *
     * 注意：真实镜片在最外缘 1dp 内的位移梯度本就趋于无穷（circleMap 在 x→1 处导数发散），
     * 所以这里只对 depth ≥ 2dp 的内部段约束跳变，边缘那 2dp 单独允许。
     */
    @Test fun opticalTransitionIsSmoothAndMonotonic() {
        val s = ChromeGlassPresets.Default
        var prev = s.displacementAt(0f)
        var depth = 0f
        val step = 0.5f
        var maxJump = 0f
        while (depth < s.lensHeight.value) {
            depth += step
            val v = s.displacementAt(depth)
            assertTrue("位移必须随深度单调不增（depth=$depth）", v <= prev + 0.0001f)
            if (depth >= 2f) maxJump = maxOf(maxJump, prev - v)
            prev = v
        }
        assertTrue("内部段相邻 0.5dp 的位移跳变过大：$maxJump", maxJump <= s.lensAmount.value * 0.12f)
        // 反过来说：边缘 2dp 内确实有可观的压缩（否则就"没有镜片感"）。
        assertTrue("边缘压缩量太小，镜片不存在", s.displacementAt(0f) - s.displacementAt(2f) > s.lensAmount.value * 0.25f)
    }

    /** 中心必须留出一段不参与折射的通透区；54dp 底栏（半高 27dp）下这段至少 2dp/侧。 */
    @Test fun centreOfTheBarStaysUnrefracted() {
        val s = ChromeGlassPresets.Default
        val halfHeight = 27f
        assertTrue("band 必须小于半高，否则中心也在折射", s.lensHeight.value < halfHeight - 1f)
        assertEquals(0f, s.displacementAt(s.lensHeight.value), 0.001f)
        assertEquals(0f, s.displacementAt(halfHeight), 0.001f)
        assertTrue("中央通透区应 ≥2dp/侧", halfHeight - s.lensHeight.value >= 2f)
    }

    /** 迷你播放器更矮（46dp，半高 23dp）：band 覆盖整块玻璃，整片都是透镜，没有"透镜环感"。 */
    @Test fun miniPlayerIsFullyInsideTheLensBand() {
        val s = ChromeGlassPresets.Default
        val halfHeight = 23f
        assertTrue(s.lensHeight.value >= halfHeight)
        assertTrue("迷你条中心位移不应该到 3dp 以上", s.displacementAt(halfHeight) < 3f)
    }

    /** depthEffect 在圆角矩形上收益极小，且 band ≥ 半高时 grad 归一化会碰到除零 —— 默认必须关。 */
    @Test fun depthEffectStaysOffByDefault() {
        for (p in ChromeGlassPresets.all) assertFalse("${p.key} 不应默认开 depthEffect", p.depthEffect)
    }
}
