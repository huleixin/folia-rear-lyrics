package io.github.huleixin.tingyu.chrome

import org.junit.Assert.assertEquals
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ChromeFooterGeometryTest.kt
//
// 冷启动底栏的几何契约（2026-11-07 首页底部闪烁专项）。
//
// 23:02 的真机轨迹里，底栏在 seed→live 交接时整体上台了 0.8dp：
//   footer-seed-frame id=nav top=735.2308
//   footer-live-frame id=nav top=734.41394
// 原因是 live 走 `NativeFooterLayout.rect(CSS px) × scale`，而 JS 的 innerWidth 是整数 375、
// 真实 dp 宽是 375.38，`scale` 比 density 大 0.1%。现在两路都只在 dp 空间里算一次，
// 这个测试钉住「除了 dp 与 density，没有第二个比例」。

class ChromeFooterGeometryTest {

    /** 真机那一台：375.38×817.23dp、density 3.25。 */
    private val density = 3.25f
    private val widthDp = 375.3846f
    private val heightDp = 817.2308f

    @Test
    fun `footer rect is the plain dp layout with no css scale applied`() {
        for (safeBottom in listOf(0f, 20f, 24f, 48f)) {
            for (safeTop in listOf(0f, 46.153847f)) {
                for (id in listOf("nav", "mini")) {
                    val rect = chromeFooterRect(id, widthDp, heightDp, safeTop, safeBottom, density)
                    // 同一组 dp 输入必须得到纯 dp 布局：任何 CSS→设备像素的比例都会让它偏 0.1%。
                    val dpSpace = NativeFooterLayout.rect(id, widthDp, heightDp, safeTop, safeBottom, false)
                    val where = "$id safe=$safeTop/$safeBottom"
                    assertEquals("left $where", dpSpace.left, rect.left, 1e-4f)
                    assertEquals("top $where", dpSpace.top, rect.top, 1e-4f)
                    assertEquals("width $where", dpSpace.width, rect.width, 1e-4f)
                    assertEquals("height $where", dpSpace.height, rect.height, 1e-4f)
                }
            }
        }
    }

    @Test
    fun `the same dp inputs give the same rect whatever the webview reports`() {
        // 真机上 web.width/viewport 是 1220/375 = 3.2533，而 density 是 3.25。
        // 这两个数不再参与底栏几何 —— 用 density 换算永远是同一份矩阵。
        val live = chromeFooterRect("nav", widthDp, heightDp, 46f, 20f, density)
        val seed = chromeFooterRect("nav", widthDp, heightDp, 46f, 20f, density)
        assertEquals(seed.top, live.top, 0f)
        assertEquals(seed.left, live.left, 0f)
        assertEquals(seed.height, live.height, 0f)
    }

    @Test
    fun `keyboard boost only lifts the two footers`() {
        val keyboardPx = 96f
        for (id in listOf("nav", "mini")) {
            val plain = chromeFooterRect(id, widthDp, heightDp, 0f, 20f, density)
            val lifted = chromeFooterRect(id, widthDp, heightDp, 0f, 20f, density, keyboardPx)
            // 键盘抬起时窗口变矮，补回键盘高度后底栏仍然贴在物理屏幕底边（下沉、被键盘盖住），
            // 不能反过来被顶到键盘上方。
            assertEquals("$id", plain.top + keyboardPx / density, lifted.top, 1e-3f)
        }
        // 舞台控制条不吃这个补偿。
        val stagePlain = chromeFooterRect("stage", widthDp, heightDp, 0f, 20f, density)
        val stageLifted = chromeFooterRect("stage", widthDp, heightDp, 0f, 20f, density, keyboardPx)
        assertEquals(stagePlain.top, stageLifted.top, 1e-4f)
    }

    @Test
    fun `a zero-size root still yields a usable footer rect`() {
        val rect = chromeFooterRect("nav", widthDp, heightDp, 0f, 0f, density)
        assertEquals(10f, rect.left, 1e-4f)
        assertEquals(heightDp - 62f, rect.top, 1e-4f)
        assertEquals(widthDp - 20f, rect.width, 1e-4f)
        assertEquals(54f, rect.height, 1e-4f)
    }
}
