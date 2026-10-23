package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

/** Regression cases for am start reporting zero exit status even when a launch is rejected. */
public class RearLyricsCommandResultTest {
    @Test public void startingHeaderDoesNotHideAnErrorWithZeroExitStatus() {
        String output = "Starting: Intent { cmp=io.github.huleixin.tingyu/.RearLyricsActivity }\nError: Activity not started, unable to resolve Intent";
        assertTrue(new RearLyricsCommandResult(0, output).failed());
    }
    @Test public void securityExceptionIsRejectedEvenWithZeroExitStatus() {
        assertTrue(new RearLyricsCommandResult(0, "Exception occurred while executing 'start':\njava.lang.SecurityException: Permission Denial").failed());
    }
    @Test public void unsupportedShellOptionFromHyperOsReportIsRejected() {
        String output = "Exception occurred while executing 'start':\n"
            + "java.lang.IllegalArgumentException: Unknown option: --activity-new-task\n"
            + "at android.content.Intent.parseCommandArgs(Intent.java:9250)";
        assertTrue(new RearLyricsCommandResult(0, output).failed());
    }
    @Test public void errorTypeThreeIsRejected() {
        assertTrue(new RearLyricsCommandResult(0, "Starting: Intent { ... }\nError type 3\nError: Activity class does not exist.").failed());
    }
    @Test public void nonzeroExitWithoutOutputIsRejected() {
        assertTrue(new RearLyricsCommandResult(1, "").failed());
    }
    @Test public void blankMoveAndWakeResultsAreNotFailures() {
        assertFalse(new RearLyricsCommandResult(0, "").failed());
        assertFalse(new RearLyricsCommandResult(0, null).failed());
    }
    @Test public void existingActivityWarningCanBeVerifiedByTheWindowHandshake() {
        assertFalse(new RearLyricsCommandResult(0, "Starting: Intent { ... }\nWarning: Activity not started, intent has been delivered to currently running top-most instance.").failed());
    }
}
