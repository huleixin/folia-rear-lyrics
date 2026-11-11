package io.github.huleixin.tingyu.chrome

import org.json.JSONArray
import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TyPanelModel.kt
//
// 声明式二级操作面板模型（原生化专项·第 21 轮）。
//
// 设计原则：**原生只画，不判断**。面板里出现哪些动作、顺序、是否禁用、当前选中值，
// 全部由 React 侧的既有业务逻辑算出后随包下发；用户点了哪一项，原样回传动作 id。
// 于是：
//   · 加歌单 / 建歌单 / 收藏 / 移出 / 重命名 / 删除 / 排序 / 重扫 / 导出 / 换音源
//     这些**业务规则一行都没有搬到 Kotlin**，音源请求与文件管理仍走原来的 React 服务；
//   · 原生侧只负责绘制、命中、动画、返回、键盘与深浅色；
//   · 将来新增一个动作，改 React 一个地方即可，不需要改 Kotlin。
//
// 这与「页面模型包」（NativePage / NativePageSection）是同一套架构：React 出模型，
// Compose 出像素。区别在于页面模型描述"一整页内容"，本模型描述"一张二级面板"。

/** 一个可点的动作行。 */
data class TyPanelAction(
    val id: String,
    val label: String,
    val hint: String,
    /** native_page_icons.json 中的图标名；空串=不画图标（纯文字行）。 */
    val icon: String,
    /** default | danger */
    val tone: String,
    val disabled: Boolean,
    val selected: Boolean,
    /** 行尾补充信息（如曲目数、日期、错误摘要）。 */
    val badge: String,
)

data class TyPanelOption(val value: String, val label: String)

/** 面板内容块。块是"一段同质的控件"，一个面板 = 若干块顺排。 */
sealed interface TyPanelBlock {
    val id: String

    /** 一组普通动作行。 */
    data class Actions(
        override val id: String,
        val label: String,
        val items: List<TyPanelAction>,
    ) : TyPanelBlock

    /** 排序 / 音源 / 日期这类下拉选择。原生画行 + 弹层菜单，不依赖 DOM 排版。 */
    data class Select(
        override val id: String,
        val label: String,
        val value: String,
        val options: List<TyPanelOption>,
        val disabled: Boolean,
        /** 未选中任何选项时右侧显示的占位文案（"选择歌单"这类）。 */
        val placeholder: String = "",
    ) : TyPanelBlock

    /** 开关（收藏/订阅这类）。 */
    data class Toggle(
        override val id: String,
        val label: String,
        val hint: String,
        val value: Boolean,
        val disabled: Boolean,
    ) : TyPanelBlock

    /** 文本输入（新建歌单、重命名）。确认时回传文本。 */
    data class Input(
        override val id: String,
        val label: String,
        val value: String,
        val placeholder: String,
        val confirmLabel: String,
        val multiline: Boolean,
        val danger: Boolean,
    ) : TyPanelBlock

    /** 二次确认（删除歌单、移出歌曲）。 */
    data class Confirm(
        override val id: String,
        val label: String,
        val message: String,
        val confirmLabel: String,
        val cancelLabel: String,
        val danger: Boolean,
    ) : TyPanelBlock

    /** 只读说明（错误、提示、当前状态）。 */
    data class Note(
        override val id: String,
        val text: String,
        /** muted | error | accent */
        val tone: String,
    ) : TyPanelBlock
}

/**
 * 一张面板。
 *
 * kind：
 *  · `sheet`  —— 底部上滑面板（默认，绝大多数二级操作）；
 *  · `dialog` —— 居中卡片（确认框、短输入）；
 *  · `menu`   —— 贴着触发元素展开的浮层菜单（需要 [anchor]；缺 anchor 时退化为 sheet）。
 */
internal fun resolvePanelKind(panel: TyPanel, nativeAnchor: Boolean): String =
    if(panel.kind == "menu" && !panel.anchor.valid && !nativeAnchor) "sheet" else panel.kind

data class TyPanel(
    val id: String,
    val session: String,
    val revision: Long,
    val enabled: Boolean,
    val kind: String,
    val title: String,
    val subtitle: String,
    val busy: Boolean,
    val error: String,
    val heightFraction: Float,
    /** 触发元素的视口矩形（CSS px），仅 menu 使用；宽高为 0 表示未提供。 */
    val anchor: TyPanelAnchor,
    val blocks: List<TyPanelBlock>,
) {
    companion object {
        private val BLOCK_KINDS = setOf("actions", "select", "toggle", "input", "confirm", "note")
        private val PANEL_KINDS = setOf("sheet", "dialog", "menu")

        /** 单包上限：面板是短列表，超过这个量级说明发错了东西。 */
        private const val MAX_PACKET = 200_000
        private const val MAX_BLOCKS = 24
        private const val MAX_ACTION_ROWS = 60
        private const val MAX_OPTIONS = 200

        fun parse(value: JSONObject): TyPanel {
            require(value.toString().length <= MAX_PACKET) { "Panel packet too large" }
            val id = value.optString("id").take(80)
            require(id.isNotEmpty()) { "Panel id required" }
            val session = value.optString("session")
            require(session.length in 1..160) { "Panel session invalid" }
            val rawBlocks = value.optJSONArray("blocks")
            val count = minOf(rawBlocks?.length() ?: 0, MAX_BLOCKS)
            // 容错降级与页面模型包一致：未知块跳过、超量截断，绝不因为一个畸形块
            // 让整张面板消失（那会让用户点了 ⋯ 什么也没发生）。
            val blocks = (0 until count).mapNotNull { index ->
                val block = rawBlocks!!.optJSONObject(index) ?: return@mapNotNull null
                val kind = block.optString("kind")
                if (kind !in BLOCK_KINDS) return@mapNotNull null
                val blockId = block.optString("id").take(80).ifEmpty { "block$index" }
                when (kind) {
                    "actions" -> TyPanelBlock.Actions(
                        blockId, block.optString("label").take(160),
                        block.optJSONArray("items").actions(),
                    )
                    "select" -> TyPanelBlock.Select(
                        blockId, block.optString("label").take(160), block.optString("value").take(400),
                        block.optJSONArray("options").options(), block.optBoolean("disabled"),
                        block.optString("placeholder").take(160),
                    )
                    "toggle" -> TyPanelBlock.Toggle(
                        blockId, block.optString("label").take(160), block.optString("hint").take(400),
                        block.optBoolean("value"), block.optBoolean("disabled"),
                    )
                    "input" -> TyPanelBlock.Input(
                        blockId, block.optString("label").take(160), block.optString("value").take(2000),
                        block.optString("placeholder").take(200),
                        block.optString("confirmLabel").take(40).ifEmpty { "确定" },
                        block.optBoolean("multiline"), block.optString("tone") == "danger",
                    )
                    "confirm" -> TyPanelBlock.Confirm(
                        blockId, block.optString("label").take(160), block.optString("message").take(1000),
                        block.optString("confirmLabel").take(40).ifEmpty { "确定" },
                        block.optString("cancelLabel").take(40).ifEmpty { "取消" },
                        block.optString("tone") != "default",
                    )
                    else -> TyPanelBlock.Note(
                        blockId, block.optString("text").take(2000),
                        block.optString("tone").ifEmpty { "muted" },
                    )
                }
            }
            val kind = value.optString("kind").let { if (it in PANEL_KINDS) it else "sheet" }
            val anchor = value.optJSONObject("anchor")?.let { box ->
                TyPanelAnchor(f(box, "x"), f(box, "y"), f(box, "w"), f(box, "h"))
            } ?: TyPanelAnchor.Zero
            return TyPanel(
                id = id,
                session = session,
                revision = value.optLong("revision"),
                enabled = value.optBoolean("enabled", true),
                // 需要锚点却拿不到 -> 退化成 sheet，绝不让菜单"消失"。
                kind = kind,
                title = value.optString("title").take(300),
                subtitle = value.optString("subtitle").take(600),
                busy = value.optBoolean("busy"),
                error = value.optString("error").take(1000),
                heightFraction = value.optDouble("heightFraction", TyPanelDims.DefaultHeightFraction.toDouble())
                    .let { if (it.isFinite()) it.toFloat().coerceIn(0.25f, 0.96f) else TyPanelDims.DefaultHeightFraction },
                anchor = anchor,
                blocks = blocks,
            )
        }

        private fun f(o: JSONObject, key: String): Float =
            o.optDouble(key, 0.0).let { if (it.isFinite()) it.toFloat() else 0f }

        private fun JSONArray?.options(): List<TyPanelOption> =
            (0 until minOf(this?.length() ?: 0, MAX_OPTIONS)).mapNotNull { i ->
                val o = this?.optJSONObject(i) ?: return@mapNotNull null
                val v = o.optString("value").take(400)
                TyPanelOption(v, o.optString("label").take(300).ifEmpty { v })
            }

        private fun JSONArray?.actions(): List<TyPanelAction> =
            (0 until minOf(this?.length() ?: 0, MAX_ACTION_ROWS)).mapNotNull { i ->
                val o = this?.optJSONObject(i) ?: return@mapNotNull null
                val rowId = o.optString("id").take(120)
                if (rowId.isEmpty()) return@mapNotNull null
                TyPanelAction(
                    id = rowId,
                    label = o.optString("label").take(300),
                    hint = o.optString("hint").take(400),
                    icon = o.optString("icon").take(60),
                    tone = if (o.optString("tone") == "danger") "danger" else "default",
                    disabled = o.optBoolean("disabled"),
                    selected = o.optBoolean("selected"),
                    badge = o.optString("badge").take(80),
                )
            }
    }
}

/** 触发元素在视口中的位置（CSS px），menu 用它决定弹出方向。 */
data class TyPanelAnchor(val x: Float, val y: Float, val w: Float, val h: Float) {
    val valid get() = w > 0f && h > 0f
    companion object { val Zero = TyPanelAnchor(0f, 0f, 0f, 0f) }
}

/**
 * 面板动作回传通道。
 *
 * 用 `fun interface` 而不是 `(…) -> Unit`：插件是 Java 写的，Java lambda 对 Kotlin
 * 函数类型（返回 Unit）需要显式 `return Unit.INSTANCE`，对 SAM 接口则是普通 void 方法。
 * 与 NativePageActionListener 保持同一种形状，插件侧两处写法也就一致。
 */
fun interface NativePanelActionListener {
    fun onAction(id: String, session: String, key: String, action: String, text: String, value: Double)
}

/** 面板动作回传。字符串命名空间集中在这里，JS 侧一一对应。 */
object TyPanelEvent {
    const val DISMISS = "dismiss"
    /** 普通动作行：`act:<rowId>` */
    fun action(rowId: String) = "act:$rowId"
    /** 下拉选择值变更：`set:<blockId>`，值走 text。 */
    fun select(blockId: String) = "set:$blockId"
    /** 开关切换：`toggle:<blockId>`，值 "1"/"0" 走 text。 */
    fun toggle(blockId: String) = "toggle:$blockId"
    /** 输入确认：`submit:<blockId>`，文本走 text。 */
    fun submit(blockId: String) = "submit:$blockId"
    /** 二次确认通过：`confirm:<blockId>` */
    fun confirm(blockId: String) = "confirm:$blockId"
}
