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
    @Test public void supportsCrLfAndMultiDigitRearIds() {
        assertEquals(53, RearLyricsTaskList.taskId(RearLyricsTaskList.front(REAR.replace("displayId=1", "displayId=11").replace("\n", "\r\n"), 11)));
    }
}
