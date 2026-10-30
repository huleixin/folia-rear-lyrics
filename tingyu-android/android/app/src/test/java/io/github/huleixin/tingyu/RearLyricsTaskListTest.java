package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

/** A cached started Activity must not hide a system launcher taking the rear display. */
public class RearLyricsTaskListTest {
    private static final String MAIN = "RootTask id=10 bounds=[0,0][1080,2400] displayId=0 userId=0\n"
        + "  taskId=10: io.github.huleixin.tingyu/.MainActivity bounds=[0,0][1080,2400]\n";
    private static final String REAR = "RootTask id=53 bounds=[0,0][904,572] displayId=1 userId=0\n"
        + "  taskId=53: io.github.huleixin.tingyu/.RearLyricsActivity bounds=[0,0][904,572]\n";
    private static final String SYSTEM = "RootTask id=54 bounds=[0,0][904,572] displayId=1 userId=0\n"
        + "  taskId=54: com.xiaomi.subscreencenter/.SubScreenLauncher bounds=[0,0][904,572]\n";
    @Test public void mainFoliaTaskDoesNotCountAsRearForeground() {
        assertEquals(53, RearLyricsTaskList.taskId(RearLyricsTaskList.front(MAIN + REAR, 1)));
    }
    @Test public void detectsSystemLauncherCoveringStillExistingRearActivity() {
        assertEquals(54, RearLyricsTaskList.taskId(RearLyricsTaskList.front(MAIN + SYSTEM + REAR, 1)));
    }
    @Test public void underlyingSystemLauncherDoesNotCountAsCoveringFolia() {
        assertEquals(53, RearLyricsTaskList.taskId(RearLyricsTaskList.front(MAIN + REAR + SYSTEM, 1)));
    }
    @Test public void missingDisplayAndFailedQueriesRemainUnknown() {
        assertEquals(-1, RearLyricsTaskList.taskId(RearLyricsTaskList.front(MAIN, 1)));
        assertEquals(-1, RearLyricsTaskList.taskId("Error: unsupported command"));
    }
    @Test public void cameraOnTheRearDisplayIsRecognisedAsOwnership() {
        String camera = "RootTask id=61 bounds=[0,0][904,572] displayId=1 userId=0\n"
            + "  taskId=61: com.android.camera/.RearPreviewActivity bounds=[0,0][904,572]\n";
        RearLyricsTaskList.Evidence evidence = RearLyricsTaskList.parse(camera, 1);
        assertTrue(evidence.readable);
        assertTrue(evidence.rearCameraTask());
        assertEquals(61, evidence.taskId);
        assertFalse(evidence.mainCameraTask());
    }
    @Test public void cameraInFrontOnTheMainDisplayIsAlsoEvidence() {
        String listing = "RootTask id=10 bounds=[0,0][1080,2400] displayId=0 userId=0\n"
            + "  taskId=10: com.android.camera/.Camera bounds=[0,0][1080,2400]\n"
            + "RootTask id=53 bounds=[0,0][904,572] displayId=1 userId=0\n"
            + "  taskId=53: io.github.huleixin.tingyu/.RearLyricsActivity bounds=[0,0][904,572]\n";
        RearLyricsTaskList.Evidence evidence = RearLyricsTaskList.parse(listing, 1);
        assertTrue(evidence.readable);
        assertFalse(evidence.rearCameraTask());
        assertTrue(evidence.mainCameraTask());
        assertEquals(53, evidence.taskId);
    }
    @Test public void ourOwnCameraNamedActivityIsNotACameraTask() {
        String listing = "RootTask id=53 bounds=[0,0][904,572] displayId=1 userId=0\n"
            + "  taskId=53: io.github.huleixin.tingyu/.RearLyricsActivity bounds=[0,0][904,572]\n";
        assertFalse(RearLyricsTaskList.parse(listing, 1).rearCameraTask());
        assertFalse(RearLyricsTaskList.parse(listing, 1).mainCameraTask());
    }
    @Test public void newerTaskBlockShapeIsUnderstood() {
        // Android 13+ prints "* Task{...#53 ...}" blocks with the resumed activity on its own line.
        String listing = "RootTask id=1 bounds=[0,0][1080,2400] displayId=0 userId=0\n"
            + "  * Task{7f2c #10 type=standard A=10123:io.github.huleixin.tingyu U=0 visible=true}\n"
            + "    mResumedActivity: ActivityRecord{11af u0 com.android.camera/.Camera t10}\n"
            + "RootTask id=53 bounds=[0,0][904,572] displayId=1 userId=0\n"
            + "  * Task{7f2d #53 type=standard A=10123:io.github.huleixin.tingyu U=0}\n"
            + "    mResumedActivity: ActivityRecord{11b0 u0 io.github.huleixin.tingyu/.RearLyricsActivity t53}\n";
        RearLyricsTaskList.Evidence evidence = RearLyricsTaskList.parse(listing, 1);
        assertTrue(evidence.readable);
        assertEquals(53, evidence.taskId);
        assertFalse(evidence.rearCameraTask());
        assertEquals(10, evidence.mainTaskId);
        assertTrue(evidence.mainCameraTask());
    }
    @Test public void emptyOrUnparseableDumpsAreNotProofThatThePanelIsFree() {
        assertFalse(RearLyricsTaskList.parse("", 1).readable);
        assertFalse(RearLyricsTaskList.parse("Error: unsupported command", 1).readable);
        assertFalse(RearLyricsTaskList.parse("-1 unavailable", 1).readable);
        // A readable dump that simply has no task on the rear display is different: the panel is
        // genuinely free there.
        RearLyricsTaskList.Evidence empty = RearLyricsTaskList.parse(MAIN, 1);
        assertTrue(empty.readable);
        assertEquals(-1, empty.taskId);
        assertFalse(empty.rearCameraTask());
    }
    @Test public void legacyCompactListingFromTheLspModuleStillParses() {
        RearLyricsTaskList.Evidence evidence = RearLyricsTaskList.parse("54 com.xiaomi.subscreencenter/.SubScreenLauncher", 1);
        assertTrue(evidence.readable);
        assertEquals(54, evidence.taskId);
        assertFalse(evidence.rearCameraTask());
    }
    @Test public void supportsCrLfAndMultiDigitRearIds() {
        assertEquals(53, RearLyricsTaskList.taskId(RearLyricsTaskList.front(REAR.replace("displayId=1", "displayId=11").replace("\n", "\r\n"), 11)));
    }
}
