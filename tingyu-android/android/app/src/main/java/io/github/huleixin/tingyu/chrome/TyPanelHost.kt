package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.zIndex
import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TyPanelHost.kt
//
// 宿主级二级面板状态机（原生化专项·第 21 轮）。
//
// 为什么放在宿主而不是页面里：
//   · 面板要能盖住底栏、迷你播放器、甚至极简播放页 —— 它是全屏浮层，不是页面的一部分；
//   · 一次只允许存在一张二级面板（与 WebView 侧 .ml-sheet 的单例语义一致），
//     这样"点了 ⋯ 再点另一首的 ⋯"不会叠出两层遮罩；
//   · 路由变化（进播放器/切页）时由宿主统一收起，面板不会挂在错误的页面上。
//
// 会话与修订号：面板每次打开都换 session，JS 侧据此丢弃迟到的动作；revision 单调递增，
// 旧的迟到包直接被丢掉。与页面模型包同一套防乱序机制。

/** 面板包（预解析，避免在主线程上做 JSON 解析）。 */
class PreparedTyPanel internal constructor(val panel: TyPanel) {
    companion object {
        @JvmStatic
        fun parse(value: JSONObject): PreparedTyPanel = PreparedTyPanel(TyPanel.parse(value))
    }
}

internal class TyPanelHost {
    /** 当前面板；null = 没有面板。 */
    var panel by mutableStateOf<TyPanel?>(null)
        private set

    /** 最后一次受理的 (session, revision)，用于拒收迟到的旧包。 */
    private var session: String = ""
    private var revision: Long = 0L

    /** 面板要关闭时通知 JS（用户点遮罩/返回键/关闭按钮，或宿主主动收起）。 */
    var onDismiss: ((id: String, session: String, key: String) -> Unit)? = null

    /** 动作回传：与页面动作总线同形，宿主直接转发到 JS。 */
    var onAction: ((id: String, session: String, key: String, action: String, text: String, value: Double) -> Unit)? = null

    /**
     * 受理一包面板。
     *
     * @return 是否受理。`enabled=false` 表示关闭同 id 的面板。
     */
    fun update(next: TyPanel): Boolean {
        if (next.revision < revision && next.session == session) return false
        if (!next.enabled) {
            if (next.session == session || session.isEmpty()) {
                session = next.session
                revision = next.revision
                panel = null
            }
            return true
        }
        // 换 session 视为新一代面板：revision 重新计数，不做跨代比较。
        if (next.session != session) {
            session = next.session
            revision = next.revision
            panel = next
            return true
        }
        if (next.revision < revision) return false
        revision = next.revision
        panel = next
        return true
    }

    /** 面板自身发起的关闭（遮罩/返回/关闭键）：先本地收起，再通知 JS 对齐状态。 */
    fun dismissFromUser() {
        val current = panel ?: return
        panel = null
        onDismiss?.invoke(current.id, current.session, current.id)
    }

    /** 宿主主动收起（路由变化、进入播放器、销毁）。通知 JS，否则 React 侧的开关状态会留在"打开"。 */
    fun dismissFromHost() {
        val current = panel ?: return
        panel = null
        onDismiss?.invoke(current.id, current.session, current.id)
    }

    fun remove(id: String, session: String) {
        val current = panel ?: return
        if (current.id != id) return
        if (session.isNotEmpty() && session != current.session) return
        panel = null
    }

    fun clear() {
        panel = null
        session = ""
        revision = 0L
    }

    fun dispatch(action: String, text: String, value: Double) {
        val current = panel ?: return
        onAction?.invoke(current.id, current.session, current.id, action, text, value)
    }
}

/**
 * 面板层：遮罩由宿主画、面板本体滑自己。
 *
 * 关闭时内容要留在组合里播 200ms 退场，所以用 [lastPanel] 记住最后一张面板。
 */
@Composable
internal fun TyPanelLayer(
    host: TyPanelHost,
    light: Boolean,
    modifier: Modifier = Modifier,
) {
    val current = host.panel
    // 关闭时内容要留在组合里播 200ms 退场，所以用 lastPanel 记住最后一张面板。
    // 在 LaunchedEffect 里写（而不是组合期直接写），避免"组合期改状态"引发的额外重组。
    var lastPanel by androidx.compose.runtime.remember { mutableStateOf<TyPanel?>(null) }
    androidx.compose.runtime.LaunchedEffect(current) { if (current != null) lastPanel = current }
    val visible = current != null
    TyPanelOverlay(visible, light, modifier, onClose = { host.dismissFromUser() }) {
        lastPanel?.let { panel ->
            TyPanelHostView(
                panel = panel,
                light = light,
                onAction = { action, text, value ->
                    // 关闭类动作先本地收起，避免"确认删除后面板还挂在那里等网络"。
                    host.dispatch(action, text, value)
                },
                onClose = { host.dismissFromUser() },
            )
        }
    }
}

/** Shared host layer for native sheets: owns the scrim, stacking, and enter/exit motion. */
@Composable
internal fun TyPanelOverlay(
    visible: Boolean,
    light: Boolean,
    modifier: Modifier = Modifier,
    onClose: () -> Unit,
    content: @Composable () -> Unit,
) {
    Box(modifier.fillMaxSize().zIndex(9f)) {
        TyPanelScrim(visible = visible, light = light, onClose = onClose)
        AnimatedVisibility(
            visible = visible,
            enter = TyPanelMotion.Enter,
            exit = TyPanelMotion.Exit,
            modifier = Modifier.fillMaxSize().zIndex(1f),
        ) {
            Box(Modifier.fillMaxSize()) { content() }
        }
    }
}
