package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearPlaybackHandoffTest.java
public class RearPlaybackHandoffTest {
    @Test public void returnsOnlyAfterThePauseGracePeriod() {
        RearPlaybackHandoff state = new RearPlaybackHandoff();
        state.start(true, 0); assertFalse(state.due(100000));
        state.playback(false, 1000);
        assertFalse(state.due(30999)); assertTrue(state.due(31000));
        assertTrue(state.wanted(true, false, true, true));
        state.returnToSystem(); assertFalse(state.wanted(true, false, true, true));
    }
    @Test public void repeatedPausedReportsDoNotResetTheDeadline() {
        RearPlaybackHandoff state = new RearPlaybackHandoff();
        state.start(false, 1000); state.playback(false, 20000);
        assertEquals(1000, state.remaining(30000)); assertTrue(state.due(31000));
    }
    @Test public void quickResumeCancelsAnOldTimeout() {
        RearPlaybackHandoff state = new RearPlaybackHandoff();
        state.start(true, 0); state.playback(false, 1000); state.playback(true, 25000);
        assertFalse(state.due(31000)); assertTrue(state.wanted(true, true, false, true));
        state.playback(false, 40000);
        assertFalse(state.due(69999)); assertTrue(state.due(70000));
    }
    @Test public void musicReclaimsTheRearScreenAfterItWasReturned() {
        RearPlaybackHandoff state = new RearPlaybackHandoff();
        state.start(false, 0); state.returnToSystem();
        assertTrue(state.returned()); assertFalse(state.wanted(true, false, false, true));
        state.playback(true, 90000);
        assertFalse(state.returned()); assertTrue(state.wanted(true, true, false, true));
        assertFalse(state.wanted(false, true, true, true));
    }
    @Test public void shizukuKeepsItsExistingManualPauseBehavior() {
        RearPlaybackHandoff state = new RearPlaybackHandoff();
        state.returnToSystem(); assertTrue(state.wanted(true, false, true, false));
    }
}
