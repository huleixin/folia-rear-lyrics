package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/TyPanelHostTest.kt
//
// 二级操作面板宿主的生命周期契约（原生化专项·第 22 轮回归）。
//
// 这一层是"点了 ⋯ 之后到底发生了什么"的唯一权威：它有 bug 的表现都是用户能直接感到的 ——
// 面板关不掉、关掉后又被旧包顶回来、上一首的菜单作用于下一首、连续点两首出现两层遮罩。
// 因此这里逐条锁住：
//   · 过期 revision 被丢弃；
//   · 换 session（连续开不同面板）立即生效，旧会话的迟到包不能复活；
//   · enabled=false 与 remove 只认自己的会话；
//   · 用户关闭与宿主关闭都**只通知一次**，且不再重复派发动作；
//   · 面板关闭后 dispatch 变成空操作（旧按钮不会打到新页面）。

class TyPanelHostTest {

    private fun panel(
        session: String,
        revision: Long,
        enabled: Boolean = true,
        id: String = "collection-menu",
        title: String = "歌单操作",
    ) = TyPanel.parse(
        JSONObject()
            .put("id", id)
            .put("session", session)
            .put("revision", revision)
            .put("enabled", enabled)
            .put("title", title)
            .put("blocks", org.json.JSONArray())
    )

    @Test fun acceptsTheFirstPacket() {
        val host = TyPanelHost()
        assertTrue(host.update(panel("s1", 1)))
        assertEquals("歌单操作", host.panel?.title)
    }

    @Test fun dropsAnOlderRevisionOfTheSameSession() {
        val host = TyPanelHost()
        host.update(panel("s1", 5, title = "新"))
        // 迟到的旧包（帧序错乱 / 桥重放）必须被明确拒收，且不能把标题改回旧值。
        assertFalse(host.update(panel("s1", 4, title = "旧")))
        assertEquals("新", host.panel?.title)
        // 同会话更大的 revision 仍然受理。
        assertTrue(host.update(panel("s1", 6, title = "更新")))
        assertEquals("更新", host.panel?.title)
    }

    @Test fun aNewSessionTakesOverImmediately() {
        val host = TyPanelHost()
        host.update(panel("s1", 9, id = "collection-menu", title = "第一首"))
        // 连续点两首：新会话即使 revision 更小也必须生效 —— 那是另一张面板。
        assertTrue(host.update(panel("s2", 1, id = "collection-menu", title = "第二首")))
        assertEquals("第二首", host.panel?.title)
    }

    @Test fun disablePacketOnlyClosesItsOwnSession() {
        val host = TyPanelHost()
        host.update(panel("s1", 1, title = "当前"))
        // 上一张面板的 enabled=false 迟到，不能把当前这张关掉。
        host.update(panel("s0", 1, enabled = false))
        assertEquals("当前", host.panel?.title)
        host.update(panel("s1", 2, enabled = false))
        assertNull(host.panel)
    }

    @Test fun removeWithAnotherSessionIsIgnored() {
        val host = TyPanelHost()
        host.update(panel("s1", 1))
        host.remove("collection-menu", "s0")
        assertEquals("歌单操作", host.panel?.title)
        host.remove("collection-menu", "s1")
        assertNull(host.panel)
    }

    @Test fun userDismissNotifiesExactlyOnceAndStopsDispatch() {
        val host = TyPanelHost()
        var dismissals = 0
        var actions = 0
        host.onDismiss = { _, _, _ -> dismissals += 1 }
        host.onAction = { _, _, _, _, _, _ -> actions += 1 }
        host.update(panel("s1", 1))
        host.dismissFromUser()
        host.dismissFromUser()
        assertNull(host.panel)
        assertEquals(1, dismissals)
        // 面板已关：旧按钮的后续点击必须变成空操作，不能打到新页面。
        host.dispatch("act:enqueue", "", 0.0)
        assertEquals(0, actions)
    }

    @Test fun hostDismissNotifiesSoReactCanAlignItsState() {
        val host = TyPanelHost()
        var dismissedKey = ""
        host.onDismiss = { _, _, key -> dismissedKey = key }
        host.update(panel("s1", 1))
        host.dismissFromHost()
        assertEquals("collection-menu", dismissedKey)
        assertNull(host.panel)
    }

    @Test fun clearForgetsTheSessionSoTheNextPacketIsAlwaysAccepted() {
        val host = TyPanelHost()
        host.update(panel("s1", 9))
        host.clear()
        assertNull(host.panel)
        assertTrue(host.update(panel("s1", 1, title = "重建后")))
        assertEquals("重建后", host.panel?.title)
    }

    @Test fun dispatchCarriesTheCurrentSessionAndKey() {
        val host = TyPanelHost()
        var seen = ""
        host.onAction = { _, session, key, action, _, _ -> seen = "$session|$key|$action" }
        host.update(panel("s7", 1))
        host.dispatch(TyPanelEvent.action("enqueue"), "", 0.0)
        assertEquals("s7|collection-menu|act:enqueue", seen)
    }

    /** menu 缺锚点时解析层就退化成 sheet：宁可变成另一形状，也不能"点了 ⋯ 什么都不出现"。 */
    @Test fun parsedPanelIsStableForTheSameInstance() {
        val host = TyPanelHost()
        val first = panel("s1", 1)
        host.update(first)
        assertSame(first, host.panel)
    }
}
