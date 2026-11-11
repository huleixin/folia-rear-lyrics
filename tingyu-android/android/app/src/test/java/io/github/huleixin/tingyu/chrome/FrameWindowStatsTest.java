package io.github.huleixin.tingyu.chrome;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.json.JSONObject;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/FrameWindowStatsTest.java
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class FrameWindowStatsTest {
    @Test public void distributionIncludesFastFramesAndUsesEachFramesBudget() throws Exception {
        FrameWindowStats stats = new FrameWindowStats();
        for (int i=1;i<=100;i++) stats.add(i * 1000000L, 16666667L, 0, 1000000L, 2000000L);
        JSONObject result = stats.snapshot();
        assertEquals(100, result.getInt("retainedFrames"));
        assertEquals(50, result.getDouble("p50Ms"), 0);
        assertEquals(95, result.getDouble("p95Ms"), 0);
        assertEquals(99, result.getDouble("p99Ms"), 0);
        assertEquals(84, result.getInt("budgetOverruns"));
        assertEquals(1, result.getDouble("layoutMeasureMeanMs"), 0);
        assertTrue(result.getBoolean("completeWindow"));
        FrameWindowStats highRefresh = new FrameWindowStats();
        highRefresh.add(10000000, 8333333, 2, 0, 0);
        assertEquals(1, highRefresh.snapshot().getInt("budgetOverruns"));
        assertEquals(2, highRefresh.snapshot().getInt("callbackReportsLost"));
        assertFalse(highRefresh.snapshot().getBoolean("completeWindow"));
    }
    @Test public void recentWindowIsBoundedAndResetIsExplicit() throws Exception {
        FrameWindowStats stats = new FrameWindowStats();
        for (int i=0;i<5000;i++) stats.add(i * 1000000L, 16666667L, 0, 0, 0);
        JSONObject result = stats.snapshot();
        assertEquals(5000, result.getLong("observedFrames"));
        assertEquals(4096, result.getInt("retainedFrames"));
        assertEquals(4999, result.getDouble("maxMs"), 0);
        assertFalse(result.getBoolean("completeWindow"));
        JSONObject empty = new FrameWindowStats().snapshot();
        assertEquals(0, empty.getInt("retainedFrames"));
        assertEquals(0, empty.getDouble("p99Ms"), 0);
        stats.add(-1, 16666667, 3, 0, 0);
        assertEquals(5000, stats.snapshot().getLong("observedFrames"));
        assertEquals(3, stats.snapshot().getLong("callbackReportsLost"));
    }
}
