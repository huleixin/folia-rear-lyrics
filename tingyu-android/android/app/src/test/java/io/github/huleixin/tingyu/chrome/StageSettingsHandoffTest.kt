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

    @Test fun temporaryStageVisitUsesTheSameHandoffWithoutChangingThePreference() {
        for(presentation in listOf("stage","minimal")) {
            val shell=JSONObject().put("playerPresentation",presentation).put("stageVisible",true)
            assertTrue(shellStageVisible(shell))
            assertTrue(needsStageSettingsHandoff("stage",shellStageVisible(shell),"settings",false))
            assertEquals(presentation,shell.getString("playerPresentation"))
        }
        assertFalse(shellStageVisible(JSONObject().put("playerPresentation","minimal")))
        assertFalse(needsStageSettingsHandoff("stage",false,"settings",false))
        assertTrue(needsStageSettingsHandoff("settings",false,"settings",true))
        assertFalse(needsStageSettingsHandoff("stage",true,"home",false))
    }

    @Test fun readyModelDoesNotAcknowledgeUntilTheMatchingPageHasDrawn() {
        var replies=0
        val posted=mutableListOf<()->Unit>()
        val handoff=StageSettingsHandoff(JSONObject().put("pageTarget","settings:document:options:appearance:").put("navigation","n2")){replies++}
        val current=page("appearance")
        assertTrue(handoff.accepts(current,"n2"))
        assertEquals(0,replies)
        handoff.pageDrawn(page("playback"),current,"n2",posted::add)
        handoff.pageDrawn(current,current,"n1",posted::add)
        handoff.pageDrawn(current.copy(session="old-session"),current,"n2",posted::add)
        handoff.pageDrawn(current.copy(revision=current.revision-1),current,"n2",posted::add)
        assertTrue(posted.isEmpty())
        handoff.pageDrawn(current,current,"n2",posted::add)
        handoff.pageDrawn(current,current,"n2",posted::add)
        assertEquals(0,replies)
        assertEquals(1,posted.size)
        posted.single().invoke()
        assertEquals(1,replies)
        handoff.complete()
        assertEquals(1,replies)
    }

    @Test fun cancelledDrawCannotAcknowledgeTwiceAndFallbackWaitsForItsDraw() {
        var replies=0
        val posted=mutableListOf<()->Unit>()
        val handoff=StageSettingsHandoff(JSONObject()){replies++}
        handoff.afterDraw(posted::add)
        assertEquals(0,replies)
        handoff.complete()
        posted.single().invoke()
        assertEquals(1,replies)
    }
}
