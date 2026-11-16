package io.github.huleixin.tingyu.minimal.immersive

import androidx.activity.ComponentActivity
import android.graphics.Bitmap
import android.graphics.Canvas
import java.io.File
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.onGloballyPositioned
import io.github.huleixin.tingyu.chrome.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import io.github.huleixin.tingyu.chrome.LocalLiquidReduced
import io.github.huleixin.tingyu.minimal.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// Actual Compose surface smoke test; fixture data tests routing, not upstream visual fidelity.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w407dp-h885dp-480dpi")
class ImmersivePlayerSurfaceTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun visible(matcher: SemanticsMatcher): SemanticsNodeInteraction {
        val nodes = compose.onAllNodes(matcher)
        return nodes.fetchSemanticsNodes().indices.map { nodes[it] }.first { it.isDisplayed() }
    }
    private fun capture(name: String) {
        compose.runOnIdle {
            val view = compose.activity.window.decorView
            val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
            view.draw(Canvas(bitmap))
            val file = File("build/reports/immersive-surface/$name.png")
            file.parentFile!!.mkdirs()
            file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
    }
    private fun assertArtworkBelowActions() {
        val artwork = compose.onNodeWithTag("immersive-artwork").fetchSemanticsNode().boundsInRoot
        val collapse = visible(hasContentDescription("收起播放器")).fetchSemanticsNode().boundsInRoot
        assertTrue("Artwork overlaps collapse action: $artwork / $collapse", artwork.top >= collapse.bottom - 1f)
    }

    @Test fun coverLyricsQueueAndStageUseTheExistingCommandBridge() = exerciseSurface("portrait")

    @Test
    @Config(sdk = [34], qualifiers = "w885dp-h407dp-480dpi")
    fun landscapeCoverLyricsQueueKeepActionsClear() = exerciseSurface("landscape")

    @Test fun actualHostDragHoldsReversesAndReturnsWithoutPlaybackCommands(){
        lateinit var panel: ImmersivePanelState
        val actions=mutableListOf<String>()
        val commands=BridgeMinimalCommands(MinimalCommandSender{action,_->actions+=action;true}){true}
        val state=MinimalPlayerState(playback=MinimalPlayback(track=MinimalTrack(key="drag",title="Drag",durationMs=180000),source=MinimalClockSource.BRIDGE,epoch="drag"))
        compose.mainClock.autoAdvance=false
        compose.setContent{
            val scope=rememberCoroutineScope()
            panel=remember{ImmersivePanelState(scope).apply{adopt(1f)}}
            val motion=remember{ImmersivePlayerMotion(Rect(10f,2400f,1200f,2600f),Rect(30f,2420f,110f,2500f),mutableStateOf(1f),NativeStageExit(),mutableStateOf(0f),false,panel)}
            CompositionLocalProvider(LocalLiquidReduced provides true,LocalImmersiveMorph provides motion){
                ImmersivePlayerHost(state,MinimalArtwork(),commands,MinimalQueue(),true,0,{},{},{},{},Modifier.fillMaxSize())
            }
        }
        compose.mainClock.advanceTimeBy(1600)
        val art=compose.onNodeWithTag("immersive-artwork")
        art.performTouchInput{down(center);moveBy(Offset(0f,80f))}
        val caught=compose.runOnIdle{assertTrue(panel.dragging);panel.progress}
        compose.mainClock.advanceTimeBy(400)
        compose.runOnIdle{assertEquals(caught,panel.progress,0f)}
        art.performTouchInput{advanceEventTime(300);moveBy(Offset(0f,120f))}
        val lower=compose.runOnIdle{panel.progress}
        assertTrue(lower<caught)
        art.performTouchInput{advanceEventTime(300);moveBy(Offset(0f,-120f));advanceEventTime(300);up()}
        compose.mainClock.advanceTimeBy(1600)
        compose.runOnIdle{assertEquals(1f,panel.progress,0f);assertFalse(panel.collapsePending)}
        assertTrue(actions.isEmpty())
    }

    @Test fun movingCoverSurvivesExitInteractionShutdown() {
        val entry = mutableStateOf(1f)
        val leaving = mutableStateOf(0f)
        val interaction = mutableStateOf(true)
        val exit = NativeStageExit()
        val motion = ImmersivePlayerMotion(Rect(10f,1700f,930f,1820f), Rect(30f,1720f,110f,1800f), entry,exit,leaving,false)
        val anchor = PlayerArtworkAnchor()
        val bitmap = Bitmap.createBitmap(64,64,Bitmap.Config.ARGB_8888).apply { eraseColor(android.graphics.Color.MAGENTA) }
        val state = MinimalPlayerState(playback = MinimalPlayback(track=MinimalTrack(key="motion",title="Motion",durationMs=180000),playing=true,source=MinimalClockSource.BRIDGE,epoch="motion"))
        val commands = BridgeMinimalCommands(MinimalCommandSender { _, _ -> true }) { true }
        compose.mainClock.autoAdvance = false
        compose.setContent {
            val enabled by interaction
            CompositionLocalProvider(LocalLiquidReduced provides true, LocalImmersiveMorph provides motion, LocalPlayerArtworkAnchor provides anchor) {
                Box(Modifier.fillMaxSize().onGloballyPositioned { anchor.canvas(it) }) {
                    ImmersivePlayerHost(state,MinimalArtwork(songKey="motion",bitmap=bitmap),commands,MinimalQueue(),enabled,0,{},{},{},{},Modifier.fillMaxSize())
                }
            }
        }
        compose.mainClock.advanceTimeBy(1600)
        val target = compose.runOnIdle { anchor.bounds!! }
        fun assertFrame(name:String) {
            compose.mainClock.advanceTimeBy(32)
            compose.runOnIdle {
                val view=compose.activity.window.decorView
                val frame=Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888)
                view.draw(Canvas(frame))
                var left=frame.width; var top=frame.height;var right=0;var bottom=0
                val pixels=IntArray(frame.width*frame.height);frame.getPixels(pixels,0,frame.width,0,0,frame.width,frame.height)
                pixels.forEachIndexed { i,c -> if(android.graphics.Color.red(c)>248 && android.graphics.Color.blue(c)>248 && android.graphics.Color.green(c)<8) {
                    val x=i%frame.width;val y=i/frame.width;left=minOf(left,x);right=maxOf(right,x);top=minOf(top,y);bottom=maxOf(bottom,y)
                } }
                val file=File("build/reports/immersive-surface/$name.png");file.parentFile!!.mkdirs();file.outputStream().use { frame.compress(Bitmap.CompressFormat.PNG,100,it) };frame.recycle()
                val expected=motion.coverBounds(target)
                assertTrue("Cover disappeared in $name",right>left && bottom>top)
                assertEquals("Cover center X in $name",expected.center.x,(left+right)/2f,12f)
                assertEquals("Cover center Y in $name",expected.center.y,(top+bottom)/2f,12f)
                assertEquals("Cover width in $name",expected.width,(right-left).toFloat(),16f)
            }
        }
        compose.runOnIdle { entry.value=.01f }; assertFrame("entry-near-mini")
        compose.runOnIdle { entry.value=.2f }; assertFrame("entry-mid")
        compose.runOnIdle { entry.value=1f }; assertFrame("entry-finished")
        compose.runOnIdle { motion.drag=.3f }; assertFrame("drag-mid")
        compose.runOnIdle { motion.drag=0f }; assertFrame("drag-canceled")
        compose.runOnIdle { exit.begin(null,true) {}; interaction.value=false; leaving.value=.3f }; assertFrame("exit-inactive-mid")
        compose.runOnIdle { leaving.value=.65f }; assertFrame("exit-inactive-tail")
    }

    // Exercise real resident layers and command routing at both aspect ratios.
    private fun exerciseSurface(orientation: String) {
        val actions = mutableListOf<String>()
        val commands = BridgeMinimalCommands(MinimalCommandSender { action, _ -> actions.add(action); true }) { true }
        val state = MinimalPlayerState(
            playback = MinimalPlayback(track = MinimalTrack(key="song", title="Surface song", artist="Surface artist", durationMs=180000),
                source=MinimalClockSource.BRIDGE, epoch="epoch"),
            lyrics = MinimalLyrics(songKey="song", epoch="epoch", status=MinimalLyricsStatus.READY,
                lines=listOf(MinimalLyricLine(0.0, 10.0, "Surface lyrics"))))
        val queue = MinimalQueue(version=1, currentIndex=0, currentKey="song", total=1,
            items=listOf(MinimalQueueItem("song#0", "song", "Queue fixture", "Surface artist")))
        compose.mainClock.autoAdvance = false
        compose.setContent {
            CompositionLocalProvider(LocalLiquidReduced provides true) {
                ImmersivePlayerHost(state, MinimalArtwork(), commands, queue, true, 0, {}, {}, {}, {},
                    modifier=Modifier.fillMaxSize())
            }
        }
        compose.mainClock.advanceTimeBy(1500)
        visible(hasText("Surface song")).assertIsDisplayed()
        assertArtworkBelowActions()
        capture("${orientation}-cover")
        visible(hasContentDescription("歌词舞台")).performClick()
        assertEquals(listOf(MinimalActions.OPEN_STAGE), actions)
        visible(hasContentDescription("歌词")).performClick()
        compose.mainClock.advanceTimeBy(1500)
        visible(hasContentDescription("歌词")).assertIsSelected()
        compose.onNodeWithText("Surface lyrics", useUnmergedTree = true).assertExists()
        assertArtworkBelowActions()
        capture("${orientation}-lyrics")
        visible(hasContentDescription("播放队列")).performClick()
        compose.mainClock.advanceTimeBy(1500)
        compose.onNodeWithText("播放队列 · 1").assertIsDisplayed()
        visible(hasText("Queue fixture")).assertExists()
        assertArtworkBelowActions()
        capture("${orientation}-queue")
        assertFalse(actions.any { it in listOf(MinimalActions.PLAY, MinimalActions.SEEK, MinimalActions.NEXT) })
    }
}
