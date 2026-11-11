package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/StageSubtitleLayoutTest.kt
class StageSubtitleLayoutTest {
    @Test fun usesActualControlTopAndSystemInsetForBothVisibilityStates() {
        for(width in listOf(740f,852f,960f))for(safe in listOf(0f,12f,24f)) {
            val height=393f
            val rect=NativeFooterLayout.rect("stage",width,height,0f,safe,false)
            for(shown in listOf(true,false)) {
                val layout=stageSubtitleLayout(width,height,safe,rect,shown,false)
                assertEquals(rect.top-8f,height-layout.getDouble("shownBottom").toFloat(),.01f)
                assertEquals(safe+8f,layout.getDouble("hiddenBottom").toFloat(),.01f)
                assertEquals(shown,layout.getBoolean("shown"))
                assertEquals(240,layout.getInt("durationMs"))
            }
            assertEquals(0,stageSubtitleLayout(width,height,safe,rect,true,true).getInt("durationMs"))
        }
    }
}
