package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ChromeSamplingPolicyTest.kt
class ChromeSamplingPolicyTest {
    @Test fun webSamplingRequiresAVisibleForegroundGlassReader(){
        assertTrue(ChromeSamplingPolicy.webReader("stage",false,false,true,true,1))
        assertTrue(ChromeSamplingPolicy.webReader("home",true,false,true,true,1))
        assertFalse(ChromeSamplingPolicy.webReader("stage",false,false,true,true,0))
        assertFalse(ChromeSamplingPolicy.webReader("home",false,false,true,true,2))
        assertFalse(ChromeSamplingPolicy.webReader("stage",false,true,true,true,1))
        assertFalse(ChromeSamplingPolicy.webReader("stage",false,false,false,true,1))
        assertFalse(ChromeSamplingPolicy.webReader("stage",false,false,true,false,1))
    }
    @Test fun autoHideDrainsTheRecordingAndRapidRevealCannotReleaseTheActiveLayer(){
        val frames=ArrayDeque<()->Unit>();var hardware=false;var allocations=0;var releases=0
        val lease=WebSamplingLease({hardware=true;allocations++},{hardware=false;releases++},{frames.add(it)})
        lease.update(true);lease.update(true);assertTrue(hardware);assertEquals(1,allocations)
        lease.update(false);frames.removeFirst()();assertTrue(hardware)
        lease.update(true);frames.removeFirst()();assertTrue(hardware);assertEquals(0,releases)
        lease.update(false);frames.removeFirst()();frames.removeFirst()();assertFalse(hardware)
        lease.update(true);lease.update(false);lease.close()
        while(frames.isNotEmpty())frames.removeFirst()()
        assertFalse(hardware);assertEquals(2,releases)
        lease.update(true);assertFalse(hardware)
    }
}
