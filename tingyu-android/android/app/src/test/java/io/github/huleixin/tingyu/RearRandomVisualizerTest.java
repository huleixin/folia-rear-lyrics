package io.github.huleixin.tingyu;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearRandomVisualizerTest.java
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class RearRandomVisualizerTest {
    private JSONObject policy(String seed) throws Exception {
        return new JSONObject().put("enabled", true).put("seed", seed).put("initialSongKey", "A")
            .put("modes", new JSONArray().put("classic").put("hanabi").put("monet"));
    }
    @Test public void twoScreensAndLateSnapshotsShareOneChoiceWithoutConsecutiveRepeats() throws Exception {
        JSONObject policy = policy("shared-no-repeat");
        String previous = RearRandomVisualizer.select(policy, "A", "classic");
        for (int i = 0; i < 80; i++) {
            String song = "song-" + i;
            String selected = RearRandomVisualizer.select(policy, song, "classic");
            assertNotEquals(previous, selected);
            // Foreground JS waking later and both rear documents get exactly the same receipt.
            for (int j = 0; j < 4; j++) assertEquals(selected, RearRandomVisualizer.select(policy, song, "classic"));
            previous = selected;
        }
        String again = RearRandomVisualizer.select(policy, "A", "classic");
        assertNotEquals(previous, again);
    }
    @Test public void manualOverrideIsStableUntilTheNextSongAndIndependentRulesCannotChangeFront() throws Exception {
        JSONObject front = policy("manual-front"), rear = policy("manual-rear");
        RearRandomVisualizer.select(front, "A", "classic");
        String chosen = RearRandomVisualizer.select(front, "B", "classic");
        front.put("initialSongKey", "B");
        assertEquals("monet", RearRandomVisualizer.select(front, "B", "monet"));
        RearRandomVisualizer.select(rear, "B", "hanabi");
        assertEquals("monet", RearRandomVisualizer.select(front, "B", "monet"));
        assertNotEquals("monet", RearRandomVisualizer.select(front, "C", "monet"));
        assertNotNull(chosen);
    }
    @Test public void disabledAndOneCandidateRulesNeverInventAnUnavailableMode() throws Exception {
        JSONObject policy = policy("one-choice");
        policy.put("enabled", false); assertEquals("still", RearRandomVisualizer.select(policy, "B", "still"));
        policy.put("enabled", true).put("modes", new JSONArray().put("hanabi"));
        assertEquals("hanabi", RearRandomVisualizer.select(policy, "B", "classic"));
        assertEquals("hanabi", RearRandomVisualizer.select(policy, "C", "hanabi"));
    }
    @Test public void nativeTrackChangesPublishOneStyleReceiptWithoutTheForegroundJavascript() throws Exception {
        JSONObject config = new JSONObject().put("activePlaybackContext", "main").put("playbackSongKey", "A")
            .put("visualizerMode", "classic").put("hasTrack", true).put("randomVisualizer", policy("native-state"));
        RearNativeTrack.bindNative("selection-test", "A", new com.getcapacitor.JSObject());
        RearLyricsState.update(new JSONObject().put("config", config));
        JSONObject initial = new JSONObject(RearLyricsState.snapshot(-1));
        int revision = initial.getInt("revision");
        assertFalse(new JSONObject(RearLyricsState.snapshot(revision)).has("config"));
        RearNativeTrack.onTrack("B", new com.getcapacitor.JSObject());
        JSONObject next = new JSONObject(RearLyricsState.snapshot(revision));
        JSONObject visual = next.getJSONObject("config");
        assertEquals("B", visual.getString("randomVisualizerSongKey"));
        String selected = visual.getString("randomVisualizerSelectedMode");
        assertNotEquals("classic", selected);
        assertEquals(selected, RearRandomVisualizer.select(policy("native-state"), "B", "classic"));
        assertFalse(new JSONObject(RearLyricsState.snapshot(next.getInt("revision"))).has("config"));
        RearNativeTrack.clear();
    }
}
