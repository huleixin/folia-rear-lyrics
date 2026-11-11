package io.github.huleixin.tingyu.minimal

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/minimal/MinimalBridgeFrameTest.kt
// 桥帧解析：只接受已知模式、把越界值夹回可用范围、记住到达时刻。
class MinimalBridgeFrameTest {

    @Test fun parsesTheFieldsComposeNeeds() {
        val frame = MinimalBridgeFrame.parse(JSONObject("""
            {"session":"s1","trackKey":"tx:9","title":"标题","artist":"歌手","cover":"https://x/y.jpg",
             "playing":true,"position":12.5,"duration":201.25,"canPrevious":true,"canNext":false,
             "disabled":false,"preparing":true,"mode":"one"}
        """.trimIndent()), 7_000L)
        assertEquals("s1", frame.session)
        assertEquals("tx:9", frame.trackKey)
        assertEquals("标题", frame.title)
        assertEquals(12.5, frame.positionSec, 0.0001)
        assertEquals(201.25, frame.durationSec, 0.0001)
        assertTrue(frame.playing)
        assertTrue(frame.canPrevious)
        assertFalse(frame.canNext)
        assertTrue(frame.preparing)
        assertEquals("one", frame.mode)
        assertEquals(7_000L, frame.receivedAtElapsed)
    }

    @Test fun overlaysDoNotMasqueradeAsStageVisitsAndKeepTheMotionToken() {
        val frame=MinimalBridgeFrame.parse(JSONObject("""{"session":"s","detour":true,"stageMotionDetour":false,"stageMotionToken":17}"""),0L)
        assertTrue(frame.detour);assertFalse(frame.stageMotionDetour);assertEquals(17L,frame.stageMotionToken)
    }
    @Test fun olderFramesStillUseDetourAndMissingTokensAreSafe() {
        val frame=MinimalBridgeFrame.parse(JSONObject("""{"session":"s","detour":true}"""),0L)
        assertTrue(frame.stageMotionDetour);assertEquals(0L,frame.stageMotionToken)
    }

    @Test fun unknownModeFallsBackToOff() {
        assertEquals("off", MinimalBridgeFrame.parse(JSONObject("""{"session":"s","mode":"sideways"}"""), 0L).mode)
        assertEquals("off", MinimalBridgeFrame.parse(JSONObject("""{"session":"s"}"""), 0L).mode)
    }

    @Test fun nonFiniteAndNegativeTimesAreClamped() {
        val frame = MinimalBridgeFrame.parse(JSONObject("""{"session":"s","position":-4,"duration":1e12}"""), 0L)
        assertEquals(0.0, frame.positionSec, 0.0)
        assertEquals(604800.0, frame.durationSec, 0.0)
    }

    @Test fun missingSessionMeansNoBridge() {
        assertEquals("", MinimalBridgeFrame.parse(JSONObject("""{"trackKey":"tx:1"}"""), 0L).session)
    }

    @Test fun textFieldsAreBounded() {
        val frame = MinimalBridgeFrame.parse(JSONObject().put("session", "s").put("title", "x".repeat(1000)), 0L)
        assertEquals(300, frame.title.length)
    }
}
