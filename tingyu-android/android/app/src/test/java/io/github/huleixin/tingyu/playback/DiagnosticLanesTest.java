package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * The reason the trail has two lanes.
 *
 * Earlier device reports could only prove "playback stopped", never why: the retry tick fired
 * every few seconds and a single shared ring buffer pushed the failure record out of the window
 * before anyone exported it. These tests pin the two properties that fix that - a routine event
 * cannot evict a critical one, and a cadence of identical routine events is one record, not N.
 */
public class DiagnosticLanesTest {
    @Test
    public void aRetriedWaitTickCannotEvictTheFailureRecord() throws Exception {
        DiagnosticLanes lanes = new DiagnosticLanes();
        lanes.record("player-error", new JSONObject().put("code", 2004));
        for (int i = 0; i < 400; i++) lanes.record("queue-wait", new JSONObject().put("budget", i));

        JSONArray critical = lanes.critical();
        assertEquals(1, critical.length());
        assertEquals("player-error", critical.optJSONObject(0).optString("type"));
    }

    @Test
    public void identicalAdjacentRoutineEventsAreFoldedIntoOneRecord() throws Exception {
        DiagnosticLanes lanes = new DiagnosticLanes();
        JSONObject data = new JSONObject().put("budget", 3).put("items", 5);
        for (int i = 0; i < 300; i++) lanes.record("queue-wait", data);

        JSONArray routine = lanes.routine();
        assertEquals(1, routine.length());
        assertEquals(300, routine.optJSONObject(0).optInt("repeat", 0));
        assertTrue(routine.optJSONObject(0).optLong("since", 0L) > 0L);
    }

    @Test
    public void aChangingRoutineEventIsRecordedAndBoundedSeparately() throws Exception {
        DiagnosticLanes lanes = new DiagnosticLanes();
        for (int i = 0; i < 500; i++) lanes.record("queue-wait", new JSONObject().put("budget", i));

        JSONArray routine = lanes.routine();
        assertEquals(DiagnosticLanes.MAX_ROUTINE, routine.length());
        // Newest survives: the oldest budget value is gone, the last one is present.
        assertEquals(499, routine.optJSONObject(routine.length() - 1).optJSONObject("data").optInt("budget"));
    }

    @Test
    public void theCriticalLaneIsBoundedByCriticalEventsOnly() throws Exception {
        DiagnosticLanes lanes = new DiagnosticLanes();
        for (int i = 0; i < 300; i++) lanes.record("queue-transition", new JSONObject().put("index", i));

        JSONArray critical = lanes.critical();
        assertEquals(DiagnosticLanes.MAX_CRITICAL, critical.length());
        assertEquals(299, critical.optJSONObject(critical.length() - 1).optJSONObject("data").optInt("index"));
    }

    @Test
    public void lifecycleErrorsAndLyricEventsAreNeverRoutine() throws Exception {
        assertFalse(DiagnosticLanes.isRoutine("player-error"));
        assertFalse(DiagnosticLanes.isRoutine("activity-destroy"));
        assertFalse(DiagnosticLanes.isRoutine("renderer-gone"));
        assertFalse(DiagnosticLanes.isRoutine("lyric-metadata"));
        assertFalse(DiagnosticLanes.isRoutine("lyric-session"));
        assertFalse(DiagnosticLanes.isRoutine("lyric-request"));
        assertFalse(DiagnosticLanes.isRoutine("queue-exhausted"));
        assertTrue(DiagnosticLanes.isRoutine("queue-wait"));
        assertTrue(DiagnosticLanes.isRoutine("queue-request"));
    }

    @Test
    public void aStopFollowedByMoreAskingStillKeepsBothLanesReadable() throws Exception {
        DiagnosticLanes lanes = new DiagnosticLanes();
        lanes.record("queue-exhausted", new JSONObject().put("remaining", 0));
        for (int i = 0; i < 200; i++) lanes.record("queue-request", new JSONObject().put("remaining", 0));
        lanes.record("ask-dropped", new JSONObject().put("type", "queue-request"));

        // The ask cadence collapsed, the two failure moments are both still there, in order.
        assertEquals(2, lanes.critical().length());
        assertEquals("queue-exhausted", lanes.critical().optJSONObject(0).optString("type"));
        assertEquals("ask-dropped", lanes.critical().optJSONObject(1).optString("type"));
        assertTrue(lanes.routine().length() <= DiagnosticLanes.MAX_ROUTINE);
    }
}
