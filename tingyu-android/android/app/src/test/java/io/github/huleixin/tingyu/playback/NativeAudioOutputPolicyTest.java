package io.github.huleixin.tingyu.playback;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/NativeAudioOutputPolicyTest.java
public class NativeAudioOutputPolicyTest {
    @Test public void stageEntryExitAndRearVisibilityDoNotReconfigureForegroundOutput(){
        NativeAudioOutputPolicy policy=new NativeAudioOutputPolicy();
        policy.request(true,false);assertEquals(0,policy.change(true));
        for(int i=0;i<12;i++){
            policy.request(true,true);assertEquals(-1,policy.change(false));
            policy.request(true,false);assertEquals(-1,policy.change(false));
        }
        policy.request(false,true);assertEquals(-1,policy.change(false));
    }
    @Test public void backgroundOffloadWaitsForPauseOrANaturalTrackBoundary(){
        NativeAudioOutputPolicy policy=new NativeAudioOutputPolicy();
        policy.request(true,true);assertEquals(0,policy.change(true));
        policy.request(false,false);assertEquals(-1,policy.change(false));assertEquals(0,policy.applied());
        assertEquals(1,policy.change(true));assertEquals(-1,policy.change(true));
        // Returning from DSP playback needs PCM once, not on every subsequent stage route.
        policy.request(true,false);assertEquals(0,policy.change(false));
        policy.request(true,true);assertEquals(-1,policy.change(false));
    }
}
