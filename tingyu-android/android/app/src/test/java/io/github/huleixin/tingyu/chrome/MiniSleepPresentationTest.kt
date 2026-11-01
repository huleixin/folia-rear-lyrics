package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/MiniSleepPresentationTest.kt
class MiniSleepPresentationTest {
    @Test fun compactControlsPreserveSongQualityTransportQueueAndOriginalFooterBounds(){
        for(width in listOf(320f,360f,393f)){
            val rect=NativeFooterLayout.rect("mini",width,852f,24f,24f,false)
            assertEquals(width-20,rect.width,0f);assertEquals(46f,rect.height,0f)
            val spacing=miniPlayerSpacing(rect.width)
            assertTrue(spacing.textWidth(rect.width)>=98f)
            assertTrue(spacing.moon>=40);assertEquals(42f,spacing.play,0f);assertTrue(spacing.queue>=38)
        }
    }
    @Test fun menusStayInsideInsetsAndShareTheSameBottomAnchorAtAllWidthsAndScales(){
        for(scale in listOf(1f,2f,3f))for(w in listOf(320,360,393))for(h in listOf(568,780,852)){
            val width=(w*scale).toInt();val height=(h*scale).toInt();val top=(24*scale).toInt()
            val footer=NativeFooterLayout.rect("mini",w.toFloat(),h.toFloat(),24f,24f,false)
            val x=((w-100)*scale).toInt();val anchor=(footer.top*scale).toInt()
            val quick=sleepMenuPlacement(width,height,top,x,anchor,false,scale=scale)
            val advanced=sleepMenuPlacement(width,height,top,x,anchor,true,scale=scale)
            assertEquals(quick.arrowTop,advanced.arrowTop)
            for(menu in listOf(quick,advanced)){
                val placed=sleepMenuPlacement(width,height,top,x,anchor,menu==advanced,minOf(menu.maxHeight,(432*scale).toInt()),scale)
                assertTrue(placed.left>=0);assertTrue(placed.left+placed.width<=width)
                assertTrue(placed.top>=top);assertTrue(placed.maxHeight>0)
                assertTrue(placed.arrowLeft>=placed.left);assertTrue(placed.arrowLeft+16*scale<=placed.left+placed.width)
                assertTrue(placed.arrowTop+10*scale<anchor)
            }
        }
    }
    @Test fun currentTrackNeverShowsAFabricatedRemainingTime(){
        val state=MiniSleepSnapshot(active=true,mode="track",waiting=true,remaining=900000,sampledAt=10)
        assertEquals("",state.minutesAt(100));assertEquals(0,state.remainingAt(100))
        assertEquals("",state.copy(mode="deadline_track").minutesAt(100))
    }
    @Test fun presentationUsesMonotonicElapsedTimeWithoutExpiringOrMutatingTheTask(){
        val state=MiniSleepSnapshot(generation=21,active=true,remaining=1800000,sampledAt=100000)
        assertEquals("30:00",state.clockAt(100000));assertEquals("29:42",state.clockAt(118000))
        assertEquals("29′",state.minutesAt(118000));assertEquals("1:30:00",state.copy(remaining=5400000).clockAt(100000))
        assertEquals(0,state.remainingAt(9999999));assertTrue(state.active);assertEquals(21,state.generation)
        assertEquals(1800000,state.remainingAt(0))
    }
    @Test fun reopeningTakesTheNativeRemainingPositionInsteadOfRestartingTheConfiguredDuration(){
        val value=JSONObject().put("generation",8).put("active",true).put("mode","deadline").put("durationMs",1800000).put("remainingMs",818000)
        val state=MiniSleepSnapshot.from(value,100)
        assertEquals("13:38",state.clockAt(100));assertEquals(818000,state.remainingAt(100));assertEquals(8,state.generation)
    }
}
