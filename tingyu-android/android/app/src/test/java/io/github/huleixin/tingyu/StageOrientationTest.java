package io.github.huleixin.tingyu;

import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/StageOrientationTest.java
public class StageOrientationTest {
    @Test public void tabletDoesNotForcePortraitWhenLeavingStage() {
        FakeHost host = new FakeHost() { public boolean adaptiveWindow() { return true; } };
        StageOrientation stage = new StageOrientation(host);
        stage.setSurfaceVisible(false);
        assertEquals(-1,host.requested);
        stage.applyPhoneFitOverride();assertEquals(-1,host.requested);
    }
    private static class FakeHost implements StageOrientation.Host {
        int requested = 7, preferred = 7; // Android sensor portrait; landscape is 6.
        boolean actualLandscape, rejectLandscape, rejectRestore;
        Runnable scheduled;
        final List<Integer> requests = new ArrayList<>();
        final List<StageOrientation.State> events = new ArrayList<>();
        public int requestedOrientation() { return requested; }
        public int preferredOrientation() { return preferred; }
        public int poseOrientation() { return actualLandscape ? 6 : 7; }
        public boolean isLandscape() { return actualLandscape; }
        public void requestOrientation(int value) {
            if (rejectRestore) throw new IllegalStateException("destroyed");
            requested = value; requests.add(value);
        }
        public void requestLandscape() {
            if (rejectLandscape) throw new IllegalStateException("unsupported");
            requestOrientation(6);
        }
        public void schedule(Runnable task, long delay) { scheduled = task; }
        public void cancel(Runnable task) { if (scheduled == task) scheduled = null; }
        public void changed(StageOrientation.State state) { events.add(state); }
    }

    @Test public void backConsumesOnlyTheOverrideAndEmitsAuthoritativeState() {
        FakeHost host = new FakeHost(); StageOrientation stage = new StageOrientation(host);
        stage.activate("one"); stage.setLandscape("one", true);
        assertTrue(stage.state().landscape); assertTrue(stage.state().pending);
        assertTrue(stage.handleBack()); assertFalse(stage.handleBack());
        assertEquals(7, host.requested); assertEquals(7, host.preferred);
        assertTrue(stage.state().active); assertFalse(stage.state().landscape);
        assertEquals("back", stage.state().reason); assertNull(host.scheduled);
    }

    @Test public void configurationSettlesWithoutEndingTheStageOrChangingPolicy() {
        FakeHost host = new FakeHost(); StageOrientation stage = new StageOrientation(host);
        stage.activate("one"); stage.setLandscape("one", true);
        host.actualLandscape = true; stage.configurationChanged();
        assertTrue(stage.state().active); assertTrue(stage.overridesPhoneFit());
        assertFalse(stage.state().pending); assertNull(host.scheduled);
        int count = host.events.size(); stage.configurationChanged();
        assertEquals(count, host.events.size()); assertEquals(6, host.requested);
    }

    @Test public void buttonRestoresPortraitPoseThenCleanupRestoresUnspecifiedEntryPolicy() {
        FakeHost host = new FakeHost(); host.requested = -1; host.preferred = -1;
        StageOrientation stage = new StageOrientation(host); stage.activate("one");
        stage.setLandscape("one", true); stage.setLandscape("one", false);
        assertEquals(7, host.requested); assertTrue(stage.applyPhoneFitOverride());
        stage.setLandscape("one", true); stage.deactivate("one");
        assertEquals(-1, host.requested); assertFalse(stage.state().active);
        assertEquals(-1, host.preferred);
        stage.activate("two"); stage.setLandscape("two", true); stage.handleBack();
        stage.stop(); assertEquals(-1, host.requested); assertFalse(stage.applyPhoneFitOverride());
    }

    @Test public void changedGlobalPreferenceWinsOnRestoreWithoutBeingOverwritten() {
        FakeHost host = new FakeHost(); StageOrientation stage = new StageOrientation(host);
        stage.activate("one"); stage.setLandscape("one", true); host.preferred = -1;
        stage.handleBack(); assertEquals(-1, host.requested); assertEquals(-1, host.preferred);
    }

    @Test public void oldUnmountCannotReleaseTheNewSessionAndRevisionsAlwaysIncrease() {
        FakeHost host = new FakeHost(); StageOrientation stage = new StageOrientation(host);
        stage.activate("old"); stage.setLandscape("old", true); stage.activate("new");
        stage.setLandscape("new", true); stage.deactivate("old");
        assertTrue(stage.state().landscape); assertEquals(6, host.requested);
        long revision = -1;
        for (StageOrientation.State event : host.events) { assertTrue(event.revision > revision); revision = event.revision; }
    }

    @Test public void timeoutRollsBackIgnoredRotationAndCancelledTimeoutCannotReenter() {
        FakeHost host = new FakeHost(); StageOrientation stage = new StageOrientation(host);
        stage.activate("one"); stage.setLandscape("one", true); Runnable timeout = host.scheduled;
        timeout.run(); assertFalse(stage.state().landscape); assertFalse(stage.state().pending);
        assertNotNull(stage.state().error); assertEquals(7, host.requested);
        stage.setLandscape("one", true); timeout = host.scheduled; stage.handleBack(); timeout.run();
        assertFalse(stage.state().landscape); assertEquals(7, host.requested);
        stage.setLandscape("one", true); timeout.run();
        assertTrue(stage.state().landscape); assertNotNull(host.scheduled);
    }

    @Test public void stopRestoresAndRejectsLateRotationUntilResume() {
        FakeHost host = new FakeHost(); StageOrientation stage = new StageOrientation(host);
        stage.activate("one"); stage.setLandscape("one", true); stage.stop();
        assertEquals(7, host.requested); assertFalse(stage.state().landscape);
        try { stage.setLandscape("one", true); fail("background rotation must be rejected"); }
        catch (IllegalStateException expected) { assertEquals(7, host.requested); }
        stage.resume(); stage.setLandscape("one", true); assertEquals(6, host.requested);
        stage.reset("reset", true); assertEquals(7, host.requested); assertFalse(stage.state().active);
    }

    @Test public void failuresNeverLeaveAFakeLandscapeOrPendingState() {
        FakeHost host = new FakeHost(); StageOrientation stage = new StageOrientation(host); stage.activate("one");
        host.rejectLandscape = true; stage.setLandscape("one", true);
        assertFalse(stage.state().landscape); assertFalse(stage.state().pending); assertNotNull(stage.state().error);
        host.rejectLandscape = false; stage.setLandscape("one", true); host.rejectRestore = true;
        stage.reset("destroy", true); assertFalse(stage.state().active); assertNull(host.scheduled);
        assertNotNull(stage.state().error);
        host.rejectRestore = false; stage.stop(); assertEquals(7, host.requested);
    }

    @Test public void aCommandSubmittedBeforeBackCannotReenterLandscapeAfterBack() {
        FakeHost host = new FakeHost(); StageOrientation stage = new StageOrientation(host);
        stage.activate("one"); stage.setLandscape("one", true);
        long submittedRevision = stage.state().revision; stage.handleBack();
        stage.setLandscape("one", true, submittedRevision);
        assertFalse(stage.state().landscape); assertEquals(7, host.requested);
        stage.setLandscape("one", true, stage.state().revision); assertTrue(stage.state().landscape);
    }

    @Test public void globalPreferenceChangeAfterButtonRestoreReleasesTheTemporaryPortraitPose() {
        FakeHost host = new FakeHost(); host.requested = -1; host.preferred = -1;
        StageOrientation stage = new StageOrientation(host); stage.activate("one");
        stage.setLandscape("one", true); stage.setLandscape("one", false); assertEquals(7, host.requested);
        host.preferred = 6; assertFalse(stage.applyPhoneFitOverride());
        // The normal preference setter is now free to apply the user's landscape preference.
        host.requestOrientation(host.preferred); stage.deactivate("one");
        assertEquals(6, host.requested); assertEquals(6, host.preferred);
    }

    @Test public void leavingStageForcesPortraitAndRejectsDelayedRotation() {
        FakeHost host = new FakeHost(); host.preferred = 6;
        StageOrientation stage = new StageOrientation(host);
        stage.activate("one"); stage.setLandscape("one", true);
        long revision = stage.state().revision;
        stage.setSurfaceVisible(false);
        assertEquals(7, host.requested); assertFalse(stage.state().landscape);
        assertNull(host.scheduled);
        stage.setLandscape("one", true, revision);
        stage.setLandscape("one", true);
        assertEquals(7, host.requested);
        stage.deactivate("one");
        assertTrue(stage.applyPhoneFitOverride()); assertEquals(7, host.requested);
        stage.setSurfaceVisible(true); stage.activate("two"); stage.setLandscape("two", true);
        assertEquals(6, host.requested);
    }
}
