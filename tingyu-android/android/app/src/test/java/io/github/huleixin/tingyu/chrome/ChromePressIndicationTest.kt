package io.github.huleixin.tingyu.chrome

import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ChromePressIndicationTest.kt
//
// 灰矩形专项的回归护栏（1.3.188）。
//
// 事故形状：`Modifier.clickable { }` 用的是 Material 默认 indication（bounded Ripple），
// 它的绘制范围是**节点矩形**，与控件圆角无关。听屿的底栏格子、歌单行、设置行都是
// 「无裁剪的整格/全宽矩形」，于是一长按就出现一块方角灰底。
//
// 这里不渲染 Compose（本机 Robolectric 原生图形栈不可用），而是扫源码：
//   1. chrome 包内每个 .clickable( 要么自己关掉 ripple（indication = null），
//      要么在同一个 modifier 链上有 .clip(...) 把水波裁进圆角；
//   2. 底栏入口、歌单行、设置行这三处必须走 chromeClickable / chromePressed；
//   3. 不允许用 `LocalIndication` 之类全局替换来掩盖（会导致全应用统一失灵）。
class ChromePressIndicationTest {

    private fun chromeDir(): File {
        var dir = File(System.getProperty("user.dir") ?: ".")
        repeat(4) {
            val candidate = File(dir, "src/main/java/io/github/huleixin/tingyu/chrome")
            if (candidate.isDirectory) return candidate
            val nested = File(dir, "app/src/main/java/io/github/huleixin/tingyu/chrome")
            if (nested.isDirectory) return nested
            dir = dir.parentFile ?: dir
        }
        fail("找不到 chrome 源码目录，测试工作目录=${System.getProperty("user.dir")}")
        error("unreachable")
    }

    /** 已知被 `.clip(...)` 裁剪、因此保留系统 ripple 的调用点（按文件白名单）。 */
    private val clippedAllowlist = setOf(
        "NativeDirectoryPage.kt",   // 音源切换胶囊：chain 上有 .clip(RoundedCornerShape(999.dp))
        "NativePageWidgets.kt",     // PagePill：chain 开头就是 .clip(shape)
        "SupportSheets.kt",         // 二维码按钮：.clip(RoundedCornerShape(12.dp))
    )

    @Test fun noUnclippedDefaultRippleInChrome() {
        val offendersByFile = mutableMapOf<String, MutableList<Int>>()
        for (file in chromeDir().listFiles { f -> f.extension == "kt" }.orEmpty().sortedBy { it.name }) {
            val source = file.readText()
            var index = source.indexOf(".clickable(")
            while (index >= 0) {
                // 向后看 260 字符，判断这次调用自己有没有关掉 ripple
                val call = source.substring(index, minOf(source.length, index + 260))
                if (!call.contains("indication")) {
                    // 向前看 1200 字符，判断同一个 modifier 链上有没有圆角裁剪
                    val context = source.substring(maxOf(0, index - 1200), index)
                    if (!context.contains(".clip(")) {
                        val line = source.substring(0, index).count { it == '\n' } + 1
                        offendersByFile.getOrPut(file.name) { mutableListOf() }.add(line)
                    }
                }
                index = source.indexOf(".clickable(", index + 1)
            }
        }
        // 白名单按「文件最多允许 1 处（已确认被 .clip 裁剪）」放行，避免白名单无限膨胀。
        val offenders = offendersByFile.filter { (name, lines) ->
            if (name in clippedAllowlist) lines.size > 1 else lines.isNotEmpty()
        }.map { (name, lines) -> "$name:${lines.joinToString(",")}" }
        assertTrue("以下点击仍使用系统 ripple 且没有圆角裁剪，长按会出灰矩形：$offenders", offenders.isEmpty())
    }

    @Test fun bottomBarAndSongRowsUseTheSharedPressFeedback() {
        val dir = chromeDir()
        val nav = File(dir, "ChromeNavigation.kt").readText()
        // Liquid navigation now owns its gesture/press scale; preserve it rather than layering another scale.
        assertTrue("底栏入口必须保留液态按压反馈", nav.contains(".liquidNavGestures(") && nav.contains("motion.pressProgress"))
        assertTrue("底栏入口必须关掉系统 ripple", nav.replace(" ", "").contains("indication=null,enabled=!s.disabled,role=Role.Tab"))

        val widgets = File(dir, "NativePageWidgets.kt").readText()
        assertTrue("歌单行必须走圆角 tint 反馈", widgets.contains(".chromeRowPressed(pressSource)"))
        assertTrue("歌单行必须关掉系统 ripple", widgets.contains("indication=null,enabled=!item.disabled&&item.action.isNotBlank()"))

        val settings = File(dir, "NativeSettingsPage.kt").readText()
        assertTrue("设置行必须走 chromeClickable", settings.contains(".chromeClickable(enabled=item.action.isNotBlank()&&!item.disabled,corner=12.dp)"))
    }

    @Test fun pressFeedbackDoesNotDisableGlobalIndication() {
        // 全局替换 LocalIndication 会连按钮、菜单、滑杆的反馈一起改掉，属于掩盖式修复。
        val offenders = chromeDir().listFiles { f -> f.extension == "kt" }.orEmpty()
            .filter { it.name != "ChromePress.kt" }
            .filter { file ->
                val s = file.readText()
                s.contains("LocalIndication provides") || s.contains("LocalIndication providesCompositionLocal")
            }
            .map { it.name }
        assertTrue("禁止全局替换 Indication：$offenders", offenders.isEmpty())
    }
}
