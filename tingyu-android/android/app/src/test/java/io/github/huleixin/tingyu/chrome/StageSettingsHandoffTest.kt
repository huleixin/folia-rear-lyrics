package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/StageSettingsHandoffTest.kt
class StageSettingsHandoffTest {
    private fun page(section:String)=NativePage.parse(JSONObject("""{
        "id":"settings","session":"settings-live","enabled":true,"viewportWidth":393,"width":393,"height":852,
        "model":{"key":"settings:document:options:$section:true:false","sections":[],"document":{"paints":[],"controls":[]}}
    }"""))

    @Test fun onlyTheRequestedReadyDocumentCanReplaceTheStage() {
        for(section in listOf("playback","appearance")) {
            val shell=JSONObject().put("pageTarget","settings:document:options:$section:").put("navigation","nav:2")
            val handoff=StageSettingsHandoff(shell,null)
            val ready=page(section)
            assertTrue(handoff.accepts(ready,"nav:2"))
            assertFalse(handoff.accepts(ready,"nav:1"))
            assertFalse(handoff.accepts(ready.copy(enabled=false),"nav:2"))
            assertFalse(handoff.accepts(ready.copy(document=null),"nav:2"))
            assertFalse(handoff.accepts(ready.copy(key="settings:loading:$section"),"nav:2"))
            assertFalse(handoff.accepts(page("other"),"nav:2"))
        }
    }

    @Test fun aReturnOrNewNavigationInvalidatesTheOldTimeout() {
        val fence=NativeRouteFence()
        val opening=fence.request(7,1)!!
        val returning=fence.request(7,2)!!
        assertFalse(fence.current(opening))
        assertTrue(fence.current(returning))
        assertNull(fence.request(7,1))
        fence.close()
        assertFalse(fence.current(returning))
    }
}
