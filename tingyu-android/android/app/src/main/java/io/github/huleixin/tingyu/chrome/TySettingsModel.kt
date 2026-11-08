package io.github.huleixin.tingyu.chrome

import org.json.JSONArray
import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TySettingsModel.kt
//
// 语义化设置页面模型（原生化专项·第 21 轮）。
//
// 背景：设置二级页现在走 NativeSettingsDocumentView —— 在 WebView 里逐元素测量 DOM，
// 拍成"画框（paints）+ 控件（controls）+ 滚动区（areas）"的显示列表，Compose 照单绘制。
//
// 这套机制的问题不是视觉（它确实做到了 1:1），而是**排版真值源留在 WebView**：
//   · 每一处 CSS 改动都要重新测量，控件位置由 getBoundingClientRect 决定；
//   · 大字体/小屏/折叠屏下，原生控件是按旧矩形的绝对定位，视觉与命中区可能不同源；
//   · 任何一次测量抖动都表现为"控件跳一下"，而且是整页级的；
//   · 无法用 Compose 自己的无障碍语义描述"这是一个开关"。
//
// 本模型是"普通设置项"的替代真值源：React 只声明**有什么**（分组、条目、控件、当前值），
// 排版由 Compose 决定。于是：
//   · 行高、内边距、分组间距、触摸目标全部由 SettingsItem 统一保证（≥48dp）；
//   · 深浅色、字体缩放、RTL 由 Compose 原生处理；
//   · 无障碍语义是原生的（Role.Switch / Role.DropdownList / 进度语义）。
//
// 不迁移的部分（有意保留 DOM 测量）：实时可视化预览岛（VisPlayground / ThemePark /
// GlobalLyricOffsetPreview）—— 它们需要真实的浏览器像素，本身就是 WebView 的强项。

data class TySettingOption(val value: String, val label: String)

/**
 * 一个设置条目。`kind` 决定渲染成哪种控件，控件之间共享同一套行结构与触摸目标。
 */
data class TySettingNode(
    val id: String,
    /** group | action | switch | select | slider | input | note */
    val kind: String,
    val title: String,
    val hint: String,
    val value: String,
    val icon: String,
    val disabled: Boolean,
    /** action 行右侧的补充值（当前档位、当前数量…）。 */
    val detail: String,
    /** slider */
    val min: Float,
    val max: Float,
    val step: Float,
    val unit: String,
    /** input */
    val placeholder: String,
    val confirmLabel: String,
    val multiline: Boolean,
    val options: List<TySettingOption>,
    /** 点击回传的动作名；空串表示与 id 相同。 */
    val action: String,
)

/** 一张语义化设置页。 */
data class TySettingsPage(
    val key: String,
    val title: String,
    val subtitle: String,
    val nodes: List<TySettingNode>,
) {
    companion object {
        private val KINDS = setOf("group", "action", "switch", "select", "slider", "input", "note")
        private const val MAX_NODES = 400
        private const val MAX_PACKET = 400_000

        fun parse(value: JSONObject): TySettingsPage {
            require(value.toString().length <= MAX_PACKET) { "Settings flow packet too large" }
            val raw = value.optJSONArray("nodes")
            val count = minOf(raw?.length() ?: 0, MAX_NODES)
            val nodes = (0 until count).mapNotNull { index ->
                val node = raw!!.optJSONObject(index) ?: return@mapNotNull null
                val kind = node.optString("kind")
                if (kind !in KINDS) return@mapNotNull null
                val id = node.optString("id").take(120).ifEmpty { "node$index" }
                TySettingNode(
                    id = id,
                    kind = kind,
                    title = node.optString("title").take(300),
                    hint = node.optString("hint").take(600),
                    value = node.optString("value").take(2000),
                    icon = node.optString("icon").take(60),
                    disabled = node.optBoolean("disabled"),
                    detail = node.optString("detail").take(120),
                    min = f(node, "min", 0f),
                    max = f(node, "max", 1f),
                    step = f(node, "step", 0f),
                    unit = node.optString("unit").take(20),
                    placeholder = node.optString("placeholder").take(200),
                    confirmLabel = node.optString("confirmLabel").take(40).ifEmpty { "确定" },
                    multiline = node.optBoolean("multiline"),
                    options = node.optJSONArray("options").options(),
                    action = node.optString("action").take(120).ifEmpty { id },
                )
            }
            return TySettingsPage(
                key = value.optString("key").take(200),
                title = value.optString("title").take(200),
                subtitle = value.optString("subtitle").take(400),
                nodes = nodes,
            )
        }

        private fun f(o: JSONObject, key: String, fallback: Float): Float =
            o.optDouble(key, fallback.toDouble()).let { if (it.isFinite()) it.toFloat() else fallback }

        private fun JSONArray?.options(): List<TySettingOption> =
            (0 until minOf(this?.length() ?: 0, 300)).mapNotNull { i ->
                val o = this?.optJSONObject(i) ?: return@mapNotNull null
                val v = o.optString("value").take(200)
                TySettingOption(v, o.optString("label").take(200).ifEmpty { v })
            }
    }
}

/** 设置页控件回传命名空间。与 TyPanelEvent 一样，"原生只回传 id，不解释语义"。 */
object TySettingEvent {
    /** 点击/切换/选择控件：`set:<nodeId>`；新值统一走 text（开关是 "1"/"0"）。 */
    fun set(nodeId: String) = "set:$nodeId"
    /** 滑块松手：`slide:<nodeId>`，值走 value（浮点）。 */
    fun slide(nodeId: String) = "slide:$nodeId"
    /** 输入确认：`submit:<nodeId>`，文本走 text。 */
    fun submit(nodeId: String) = "submit:$nodeId"
    /** 普通动作行：`act:<nodeId>`。 */
    fun action(nodeId: String) = "act:$nodeId"
}
