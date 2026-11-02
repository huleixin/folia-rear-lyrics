package io.github.huleixin.tingyu.chrome

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import org.json.JSONArray
import org.json.JSONObject

// Debug-only renderer fixture. It never connects to or starts either rear backend.
class RearSettingsPreviewActivity : ComponentActivity() {
    var width by mutableIntStateOf(393)
    var light by mutableStateOf(false)
    var fontScale by mutableFloatStateOf(1f)
    var backend by mutableStateOf("lsp")
    var advanced by mutableStateOf(false)
    var enabled by mutableStateOf(false)
    val calls = mutableListOf<String>()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val density = LocalDensity.current
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val cssDensity = with(density) { maxWidth.toPx() } / width
                CompositionLocalProvider(LocalDensity provides Density(cssDensity, fontScale), LocalInterfacePalette provides InterfacePalette(light)) {
                    NativePageView(fixture(), Modifier.fillMaxSize()) { action, _, _ -> calls.add(action) }
                }
            }
        }
    }
    private fun fixture(): NativePage {
        fun row(id: String, title: String, subtitle: String = "", action: String = "", selected: Boolean = false, disabled: Boolean = false) =
            JSONObject().put("id", id).put("title", title).put("subtitle", subtitle).put("action", action).put("selected", selected).put("disabled", disabled)
        fun section(id: String, title: String, layout: String, vararg rows: JSONObject) =
            JSONObject().put("id", id).put("title", title).put("layout", layout).put("items", JSONArray(rows.toList()))
        val sections = JSONArray()
        if (advanced) {
            sections.put(section("engine", "背屏控制引擎", "chips", row("plan-a", "Plan A", action="engine:plan-a", selected=true, disabled=enabled), row("legacy", "Legacy · 旧引擎（一键回滚）", action="engine:legacy", disabled=enabled)))
            if (backend == "shizuku") sections.put(section("route", "锁屏启动路线", "chips", *listOf("auto", "reuse", "migrate").map { row(it, it, action="route:$it", selected=it=="auto") }.toTypedArray()))
            sections.put(section("sleep", "背屏息屏", "rows", row("cover-sleep", "遮盖息屏", "遮盖或朝下时尝试息屏，抬起后恢复。", "rear:cover")))
        } else {
            sections.put(section("summary", "", "rows", row("toggle", "背屏歌词", "$backend · 未开启", "rear:toggle", enabled)))
            sections.put(section("backend", "背屏控制模式", "chips", *listOf("lsp", "shizuku").map { row(it, if(it=="lsp") "LSP" else "Shizuku", action="backend:$it", selected=it==backend, disabled=enabled) }.toTypedArray()))
            val facts = if(backend=="lsp") listOf(row("module", "LSPosed 模块", "已连接")) else listOf(row("service", "Shizuku 服务", "已启动"), row("permission", "听屿授权", "已授权"))
            sections.put(section("status", "连接与运行", "rows", *(facts + row("display", "背屏显示", "未开启") + row("refresh", "刷新状态", action="rear:refresh")).toTypedArray()))
        }
        sections.put(section("links", "", "rows", row("guide", "使用说明", action="rear:guide"), row("advanced", "高级设置", action="rear:advanced"), row("diagnostics", "诊断与日志", action="rear:diagnostics")))
        return NativePage.parse(JSONObject().put("id", "settings").put("session", "rear-preview").put("generation", 1).put("revision", 1).put("enabled", true)
            .put("viewportWidth", width).put("width", width).put("height", 852).put("safeTop", 24).put("safeBottom", 24)
            .put("model", JSONObject().put("key", "settings:rear:${if(advanced) "advanced" else "control"}").put("title", if(advanced) "高级设置" else "背屏歌词").put("leading", "rear:back").put("trailingLabel", "返回").put("sections", sections)))
    }
}
