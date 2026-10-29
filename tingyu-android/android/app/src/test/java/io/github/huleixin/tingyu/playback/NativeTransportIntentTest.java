package io.github.huleixin.tingyu.playback;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/NativeTransportIntentTest.java
public class NativeTransportIntentTest {
    @Test public void anOldNotificationButtonCanResumeAfterPauseWithoutWaitingForANewIcon() {
        assertEquals("pause", NativeTransportIntent.resolve("toggle", false, true));
        assertEquals("play", NativeTransportIntent.resolve("toggle", true, false));
    }
    @Test public void aSecondTapDuringFadeOutCancelsThePauseInsteadOfRepeatingIt() {
        assertEquals("play", NativeTransportIntent.resolve("toggle", true, true));
    }
    @Test public void aPlayerStoppedByAudioFocusCanBeResumed() {
        assertEquals("play", NativeTransportIntent.resolve("toggle", false, false));
    }
    @Test public void explicitSystemCommandsRemainIdempotent() {
        assertEquals("pause", NativeTransportIntent.resolve("pause", true, false));
        assertEquals("play", NativeTransportIntent.resolve("play", false, true));
        assertEquals("stop", NativeTransportIntent.resolve("stop", false, true));
    }
}
