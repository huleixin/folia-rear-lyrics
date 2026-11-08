package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/TyPanelTest.kt
//
// 二级操作面板与语义化设置页的契约测试。
//
// 这两块都是"JS 出模型、Compose 出像素"：模型解析错一位，用户看到的就是空面板或错位的开关。
// 这里锁三件事：
//   1. 面板包解析的容错边界（未知块跳过、超量截断、锚点缺失退化）；
//   2. 设置页分组切分（group 开卡片、条目归组、组前条目自成一段）；
//   3. 动作命名的稳定性 —— 原生与 JS 两侧靠它对齐，改名等于断线。

class TyPanelTest {

    private fun panel(json: String) = TyPanel.parse(JSONObject(json))

    @Test fun parsesEveryBlockKindInOrder() {
        val parsed = panel(
            """
            {"id":"collection-menu","session":"s1","revision":7,"enabled":true,"kind":"sheet",
             "title":"歌单操作","subtitle":"12 首",
             "blocks":[
               {"kind":"actions","id":"primary","items":[{"id":"enqueue","label":"加入队列","icon":"plus","disabled":false,"selected":true}]},
               {"kind":"select","id":"sort","label":"排序","value":"name","placeholder":"默认顺序","options":[{"value":"name","label":"按名称"}]},
               {"kind":"toggle","id":"like","label":"收藏","value":true},
               {"kind":"input","id":"rename","label":"重命名","value":"旧名","confirmLabel":"确定"},
               {"kind":"confirm","id":"remove","message":"确定移出？","confirmLabel":"移出","tone":"danger"},
               {"kind":"note","id":"err","text":"网络异常","tone":"error"}
             ]}
            """.trimIndent()
        )
        assertEquals("collection-menu", parsed.id)
        assertEquals("s1", parsed.session)
        assertEquals(7L, parsed.revision)
        assertEquals("sheet", parsed.kind)
        assertEquals(6, parsed.blocks.size)
        val actions = parsed.blocks[0] as TyPanelBlock.Actions
        assertEquals("enqueue", actions.items[0].id)
        assertTrue(actions.items[0].selected)
        val select = parsed.blocks[1] as TyPanelBlock.Select
        assertEquals("默认顺序", select.placeholder)
        assertEquals("按名称", select.options[0].label)
        assertTrue((parsed.blocks[4] as TyPanelBlock.Confirm).danger)
    }

    /** 畸形块不能把整张面板带走：跳过它，其余照常显示。 */
    @Test fun skipsUnknownBlocksInsteadOfDroppingThePanel() {
        val parsed = panel(
            """
            {"id":"p","session":"s","revision":1,"enabled":true,
             "blocks":[{"kind":"hologram","id":"x"},{"kind":"note","id":"n","text":"仍在"}]}
            """.trimIndent()
        )
        assertEquals(1, parsed.blocks.size)
        assertEquals("n", parsed.blocks[0].id)
    }

    /** 声明成 menu 却拿不到锚点 → 退化成 sheet，绝不"点了 ⋯ 什么都没出现"。 */
    @Test fun menuWithoutAnchorFallsBackToSheet() {
        assertEquals("sheet", panel("""{"id":"p","session":"s","kind":"menu","blocks":[]}""").kind)
        assertEquals(
            "menu",
            panel("""{"id":"p","session":"s","kind":"menu","anchor":{"x":10,"y":20,"w":30,"h":40},"blocks":[]}""").kind
        )
    }

    /** 动作行缺 id 视为无效行；有效行保留禁用/危险/徽标等全部语义位。 */
    @Test fun actionRowsWithoutIdAreDropped() {
        val parsed = panel(
            """
            {"id":"p","session":"s","blocks":[{"kind":"actions","id":"a","items":[
                {"label":"没有 id"},
                {"id":"del","label":"删除","tone":"danger","badge":"3","hint":"不可恢复"}]}]}
            """.trimIndent()
        )
        val rows = (parsed.blocks[0] as TyPanelBlock.Actions).items
        assertEquals(1, rows.size)
        assertEquals("danger", rows[0].tone)
        assertEquals("3", rows[0].badge)
        assertEquals("不可恢复", rows[0].hint)
    }

    @Test fun settingsFlowParsesNodesAndKeepsLayoutOutOfThePacket() {
        val page = TySettingsPage.parse(
            JSONObject(
                """
                {"key":"appearance","title":"外观","subtitle":"深浅色与字体",
                 "nodes":[
                   {"kind":"group","id":"g1","title":"显示"},
                   {"kind":"switch","id":"dark","title":"深色模式","value":"1"},
                   {"kind":"slider","id":"scale","title":"字号","value":"1.15","min":0.8,"max":1.6,"step":0.05,"unit":"x"},
                   {"kind":"select","id":"theme","title":"主题","value":"mint","options":[{"value":"mint","label":"薄荷"}]},
                   {"kind":"input","id":"font","title":"字体","value":"","placeholder":"系统"},
                   {"kind":"action","id":"more","title":"更多","detail":"3 项"}
                 ]}
                """.trimIndent()
            )
        )
        assertEquals("appearance", page.key)
        assertEquals(6, page.nodes.size)
        // 语义化模型里没有 rect：排版由 Compose 决定，这是本轮"消除 DOM 测量"的落点。
        val slider = page.nodes[2]
        assertEquals(0.8f, slider.min, 0.0001f)
        assertEquals(1.6f, slider.max, 0.0001f)
        assertEquals(0.05f, slider.step, 0.0001f)
        // 动作名缺省 = id，页面不必重复写一遍。
        assertEquals("more", page.nodes[5].action)
    }

    @Test fun settingsFlowGroupsSplitAroundGroupHeaders() {
        val page = TySettingsPage.parse(
            JSONObject(
                """
                {"key":"k","title":"t","nodes":[
                   {"kind":"note","id":"n0","title":"顶部说明"},
                   {"kind":"group","id":"g1","title":"第一组"},
                   {"kind":"switch","id":"a","title":"A"},
                   {"kind":"switch","id":"b","title":"B"},
                   {"kind":"group","id":"g2","title":"第二组"},
                   {"kind":"action","id":"c","title":"C"}
                ]}
                """.trimIndent()
            )
        )
        val groups = groupSettingsNodes(page.nodes)
        assertEquals(3, groups.size)
        assertNull(groups[0].first)
        assertEquals(listOf("n0"), groups[0].second.map { it.id })
        assertEquals("g1", groups[1].first?.id)
        assertEquals(listOf("a", "b"), groups[1].second.map { it.id })
        assertEquals("g2", groups[2].first?.id)
        assertEquals(listOf("c"), groups[2].second.map { it.id })
    }

    /** 分组头连续出现（空分组）不能被吞掉，否则页面会少一个标题。 */
    @Test fun emptyGroupsSurviveTheSplit() {
        val page = TySettingsPage.parse(
            JSONObject(
                """
                {"key":"k","title":"t","nodes":[
                   {"kind":"group","id":"g1","title":"空组"},
                   {"kind":"group","id":"g2","title":"有组"},
                   {"kind":"switch","id":"a","title":"A"}
                ]}
                """.trimIndent()
            )
        )
        val groups = groupSettingsNodes(page.nodes)
        assertEquals(2, groups.size)
        assertEquals("g1", groups[0].first?.id)
        assertTrue(groups[0].second.isEmpty())
        assertEquals(listOf("a"), groups[1].second.map { it.id })
    }

    /** 动作名是两侧的接口：改名等于断线，改这里必然同步改 JS 的 decode。 */
    @Test fun actionNamesAreStable() {
        assertEquals("dismiss", TyPanelEvent.DISMISS)
        assertEquals("act:enqueue", TyPanelEvent.action("enqueue"))
        assertEquals("set:sort", TyPanelEvent.select("sort"))
        assertEquals("toggle:like", TyPanelEvent.toggle("like"))
        assertEquals("submit:rename", TyPanelEvent.submit("rename"))
        assertEquals("confirm:remove", TyPanelEvent.confirm("remove"))
        assertEquals("set:dark", TySettingEvent.set("dark"))
        assertEquals("slide:scale", TySettingEvent.slide("scale"))
        assertEquals("submit:font", TySettingEvent.submit("font"))
        assertEquals("act:more", TySettingEvent.action("more"))
    }
}
