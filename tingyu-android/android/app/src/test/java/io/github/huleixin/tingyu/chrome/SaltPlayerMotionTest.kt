package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.*
import androidx.compose.ui.geometry.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SaltPlayerMotionTest.kt
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk=[34])
class SaltPlayerMotionTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private val fixture get()=JSONObject(javaClass.classLoader!!.getResource("salt-player-motion.json")!!.readText())
    private val panel=Rect(13f,604f,292f,643f)
    private val cover=Rect(26f,605f,53f,632f)
    private val target=Rect(25f,135f,281f,391f)
    private val size=Size(305f,664f)
    private fun rect(expected: Rect,actual: Rect,tolerance: Float=1.5f) {
        assertEquals(expected.left,actual.left,tolerance);assertEquals(expected.top,actual.top,tolerance)
        assertEquals(expected.right,actual.right,tolerance);assertEquals(expected.bottom,actual.bottom,tolerance)
    }
    @Test fun recordedOpeningAndClosingFramesUseIndependentShellAndCoverPaths() {
        val evidence=JSONObject()
        for(close in listOf(false,true)) {
            val rows=fixture.getJSONArray(if(close)"closing"else"opening")
            val entry=mutableStateOf(if(close)1f else 0f);val leaving=mutableStateOf(0f);val exit=NativeStageExit()
            if(close)exit.begin(null,true){}
            val motion=MinimalPlayerMorph(panel,cover,entry,exit,leaving,false)
            for(i in 0 until rows.length()) {
                val row=rows.getJSONArray(i);val ms=row.getDouble(0).toFloat()
                if(close)leaving.value=ms/SaltPlayerTimeline.ExitMs else entry.value=ms/SaltPlayerTimeline.EnterMs
                rect(Rect(row.getDouble(1).toFloat(),row.getDouble(2).toFloat(),row.getDouble(3).toFloat(),row.getDouble(4).toFloat()),motion.panelBounds(size))
                val x=row.getDouble(5).toFloat();val y=row.getDouble(6).toFloat();val side=row.getDouble(7).toFloat()
                rect(Rect(x,y,x+side,y+side),motion.coverBounds(target))
            }
            val generated=org.json.JSONArray()
            for(ms in 0..if(close)SaltPlayerTimeline.ExitMs else SaltPlayerTimeline.EnterMs) {
                if(close)leaving.value=ms.toFloat()/SaltPlayerTimeline.ExitMs else entry.value=ms.toFloat()/SaltPlayerTimeline.EnterMs
                val body=motion.panelBounds(size);val art=motion.coverBounds(target)
                generated.put(JSONObject().put("ms",ms).put("panel",org.json.JSONArray(listOf(body.left,body.top,body.right,body.bottom)))
                    .put("cover",org.json.JSONArray(listOf(art.left,art.top,art.right,art.bottom))))
            }
            evidence.put(if(close)"closing"else"opening",generated)
        }
        val report=java.io.File("build/reports/salt-player-motion.json")
        report.parentFile.mkdirs();report.writeText(evidence.toString())
    }
    @Test fun shellStartsWideWhileCoverGrowsIndependentlyAndNeverStretchesText() {
        val motion=MinimalPlayerMorph(panel,cover,mutableStateOf(34f/980f),NativeStageExit(),mutableStateOf(0f),false)
        assertTrue(motion.panelBounds(size).width>size.width*.9f)
        assertTrue(motion.coverBounds(target).width<size.width*.4f)
        assertTrue(motion.sectionAlpha("controls")<.01f)
        assertEquals(1f,motion.coverAlpha(),0f)
    }
    @Test fun intermediateSamplesAreFiniteAndCannotOvershootForHighRefreshDisplays() {
        for(close in listOf(false,true)) for(hz in listOf(60,90,120,144)) {
            val duration=if(close)500f else 980f
            for(frame in 0..(duration*hz/1000f).toInt()+1) {
                val channels=SaltPlayerTimeline.sample(frame*1000f/hz,close)
                channels.forEach { assertTrue(it.isFinite() && it in 0f..1f) }
            }
        }
    }
    @Test fun reversingDuringEntryKeepsCoverShellAndAlphaAtTheInterruptFrame() {
        val entry=mutableStateOf(.11f);val leaving=mutableStateOf(0f);val exit=NativeStageExit()
        val motion=MinimalPlayerMorph(panel,cover,entry,exit,leaving,false)
        val body=motion.panelBounds(size);val picture=motion.coverBounds(target)
        val header=motion.sectionAlpha("header");val controls=motion.sectionAlpha("controls")
        val alpha=motion.shellAlpha();val mini=motion.miniAlpha()
        exit.begin(null,true){}
        rect(body,motion.panelBounds(size),.001f);rect(picture,motion.coverBounds(target),.001f)
        assertEquals(header,motion.sectionAlpha("header"),.001f);assertEquals(controls,motion.sectionAlpha("controls"),.001f)
        assertEquals(alpha,motion.shellAlpha(),.001f);assertEquals(mini,motion.miniAlpha(),.001f)
        leaving.value=1f
        rect(panel,motion.panelBounds(size));rect(cover,motion.coverBounds(target))
        assertEquals(1f,motion.miniAlpha(),0f);assertEquals(0f,motion.coverAlpha(),0f)
    }
    @Test fun missingJsPhaseStillAnimatesAndReversalDoesNotSnapTheStage() {
        val detour=mutableStateOf(false);lateinit var value:State<Float>
        compose.mainClock.autoAdvance=false
        compose.setContent { value=rememberPlayerDetourProgress(true,detour.value,false);Box{} }
        assertEquals(1f,value.value,0f)
        compose.runOnIdle{detour.value=true}
        compose.mainClock.advanceTimeBy(160);compose.waitForIdle()
        assertTrue(value.value in .01f.. .99f)
        val visible=value.value
        compose.runOnIdle{detour.value=false}
        compose.mainClock.advanceTimeByFrame();compose.waitForIdle()
        assertTrue(kotlin.math.abs(value.value-visible)<.1f)
        compose.mainClock.advanceTimeBy(500);compose.waitForIdle()
        assertEquals(1f,value.value,.001f)
    }
    @Test fun onlyTheCurrentReversalCanSendACompletionAcknowledgment() {
        val detour=mutableStateOf(false);val token=mutableStateOf(0L);val acknowledgments=mutableListOf<Pair<Boolean,Long>>()
        compose.mainClock.autoAdvance=false
        compose.setContent { rememberPlayerDetourProgress(true,detour.value,false,token.value) { shown,id -> acknowledgments.add(shown to id) };Box{} }
        compose.runOnIdle {detour.value=true;token.value=1L}
        compose.mainClock.advanceTimeBy(120);compose.waitForIdle()
        compose.runOnIdle {detour.value=false;token.value=2L}
        repeat(35) {compose.mainClock.advanceTimeByFrame();compose.waitForIdle()}
        assertEquals(listOf(false to 2L),acknowledgments.filter {it.second>0})
    }
    @Test fun reducedMotionAndBackgroundResumeHaveNoResidualStageOffset() {
        val reduced=mutableStateOf(false);val detour=mutableStateOf(false);lateinit var value:State<Float>
        compose.mainClock.autoAdvance=false
        compose.setContent {value=rememberPlayerDetourProgress(true,detour.value,reduced.value);Box{}}
        compose.runOnIdle{detour.value=true}
        compose.mainClock.advanceTimeBy(80)
        compose.runOnIdle{reduced.value=true}
        compose.mainClock.advanceTimeBy(32);compose.waitForIdle()
        assertEquals(0f,value.value,.001f)
        compose.runOnIdle{detour.value=false}
        repeat(12) { compose.mainClock.advanceTimeByFrame();compose.waitForIdle() }
        assertEquals(1f,value.value,.001f)
    }
}
