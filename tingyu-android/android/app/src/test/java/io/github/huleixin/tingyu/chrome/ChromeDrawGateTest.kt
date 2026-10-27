package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ChromeDrawGateTest.kt
class ChromeDrawGateTest {
    @Test fun acknowledgementWaitsForTheMatchingPaint() {
        val gate=ChromeDrawGate();val replies=mutableListOf<Boolean>()
        gate.await("mini","one",1){replies.add(it)}
        assertTrue(replies.isEmpty())
        gate.drawn("mini","old",1);gate.drawn("mini","one",0)
        assertTrue(replies.isEmpty())
        gate.drawn("mini","one",1)
        assertEquals(listOf(true),replies)
        gate.drawn("mini","one",1);assertEquals(1,replies.size)
    }
    @Test fun hideOrNewRevisionCannotBeUndoneByAnOldDraw() {
        val gate=ChromeDrawGate();val replies=mutableListOf<String>()
        gate.await("stage","one",1){replies.add("old:$it")}
        gate.await("stage","one",2){replies.add("new:$it")}
        gate.drawn("stage","one",1)
        assertEquals(listOf("old:false"),replies)
        gate.cancel("stage","one");gate.drawn("stage","one",2)
        assertEquals(listOf("old:false","new:false"),replies)
    }
    @Test fun lateSessionCleanupDoesNotCancelTheNewWindow() {
        val gate=ChromeDrawGate();var ready=false
        gate.await("nav","new",1){ready=it}
        gate.cancel("nav","old");gate.drawn("nav","new",1)
        assertTrue(ready)
    }
}
