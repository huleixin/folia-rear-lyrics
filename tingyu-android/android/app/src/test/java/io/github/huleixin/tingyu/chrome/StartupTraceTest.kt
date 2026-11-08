package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/StartupTraceTest.kt
//
// 首帧取证的代价约束：只在进程启动后 3 秒内记录、最多 64 条、关闭后调用点全部短路。
// 这几条是「诊断本身不能变成新的启动负担」的可执行版本。

class StartupTraceTest {

    @Test
    fun `records phases in order with detail`() {
        StartupTrace.resetForTest()
        StartupTrace.mark("activity-create")
        StartupTrace.detail("chrome-packet") { put("id", "nav"); put("enabled", true) }
        val entries = StartupTrace.snapshot().getJSONArray("entries")
        assertEquals(2, entries.length())
        assertEquals("activity-create", entries.getJSONObject(0).getString("phase"))
        assertEquals("chrome-packet", entries.getJSONObject(1).getString("phase"))
        assertEquals("nav", entries.getJSONObject(1).getJSONObject("detail").getString("id"))
        assertTrue(entries.getJSONObject(1).getLong("at") >= entries.getJSONObject(0).getLong("at"))
    }

    @Test
    fun `stops at the cap instead of growing without bound`() {
        StartupTrace.resetForTest()
        repeat(200) { StartupTrace.mark("frame-$it") }
        val cap = StartupTrace.snapshot().getInt("cap")
        assertEquals(cap, StartupTrace.snapshot().getJSONArray("entries").length())
        // 写满即关闭：后续调用一条都不再进入。
        StartupTrace.mark("after-cap")
        assertEquals(cap, StartupTrace.snapshot().getJSONArray("entries").length())
        assertFalse(StartupTrace.enabled())
    }

    @Test
    fun `snapshot states the sampling window so nobody reads it as a full trace`() {
        StartupTrace.resetForTest()
        val snapshot: JSONObject = StartupTrace.snapshot()
        assertEquals(3_000, snapshot.getInt("windowMs"))
        assertTrue(snapshot.getString("note").contains("3 秒"))
    }
}
