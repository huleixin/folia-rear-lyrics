package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ChromePlayerTransitionTest.kt
class ChromePlayerTransitionTest {
    private fun surface(phase:String):ChromeSurface = ChromeSurface.parse(JSONObject()
        .put("id","stage").put("session","player").put("viewportWidth",393)
        .put("data",JSONObject().put("playerTransition",phase)))
    @Test fun bridgeAcceptsBothSheetDirectionsAndIdle() {
        for(phase in listOf("to-stage","to-minimal","idle")) assertEquals(phase,surface(phase).playerTransition)
    }
    @Test fun unknownMotionCannotLeaveNativeControlsTranslated() {
        assertEquals("idle",surface("other").playerTransition)
        assertEquals("idle",surface("").playerTransition)
    }
}
