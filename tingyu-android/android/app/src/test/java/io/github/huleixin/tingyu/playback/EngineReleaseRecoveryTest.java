package io.github.huleixin.tingyu.playback;

import io.github.huleixin.tingyu.lx.LxRuntimeHost;
import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class EngineReleaseRecoveryTest {

    @Test
    public void doesNotAutoRestorePreparedTrackAfterEngineRelease() {
        // After sleep-timer or service destroy releases the engine, reopening the app
        // must not auto-restore or auto-play the pre-sleep prepared track.
        assertFalse(TingyuPlaybackPlugin.shouldRestorePreparedAfterEngineSwap(true, true));
        assertFalse(TingyuPlaybackPlugin.shouldRestorePreparedAfterEngineSwap(false, false));
        // Only an unexpected non-released swap may restore the prepared state.
        assertTrue(TingyuPlaybackPlugin.shouldRestorePreparedAfterEngineSwap(true, false));
    }

    @Test
    public void emptyLxScriptClearsHostCleanlyWithoutBlockingOfficialSources() {
        boolean installed = LxRuntimeHost.INSTANCE.install("empty", "", "", "", "", "", "", "{}");
        assertFalse(installed);
        assertFalse(LxRuntimeHost.INSTANCE.hasScript());
        LxRuntimeHost.INSTANCE.release();
        assertFalse(LxRuntimeHost.INSTANCE.hasScript());
    }
}
