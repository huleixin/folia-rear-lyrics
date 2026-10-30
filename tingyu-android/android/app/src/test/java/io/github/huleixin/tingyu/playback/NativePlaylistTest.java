package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.Before;
import org.junit.Test;

/** 逻辑歌单与"下一首是谁"的推进规则。全部是纯逻辑，不碰 Android。 */
public class NativePlaylistTest {

    private static NativePlaylist.Track track(String index) {
        return new NativePlaylist.Track("song-" + index, "qq", "mid-" + index,
            "T" + index, "A", "B", 100_000L, "", "");
    }

    private static List<NativePlaylist.Track> list(int count) {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        for (int i = 0; i < count; i++) tracks.add(track(String.valueOf(i)));
        return tracks;
    }

    @Before
    public void reset() {
        NativePlaylist.resetForTest();
    }

    @Test
    public void anEmptyLedgerCannotClaimThePlaylistEnded() {
        NativePlaylist.get().replace(list(0), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        assertFalse("an empty ledger must not be read as 'finished'",
            NativePlaylist.get().canDecide("song-0"));
        assertEquals(NativePlaylist.Outcome.END, NativePlaylist.get().advance("song-0").outcome);
    }

    @Test
    public void aSequenceWalksForwardAndOnlyEndsAtTheRealEnd() {
        NativePlaylist.get().replace(list(3), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        NativePlaylist.Step first = NativePlaylist.get().advance("song-0");
        assertEquals(NativePlaylist.Outcome.ADVANCE, first.outcome);
        assertEquals("song-1", first.track.songKey);
        NativePlaylist.Step second = NativePlaylist.get().advance("song-1");
        assertEquals("song-2", second.track.songKey);
        NativePlaylist.Step last = NativePlaylist.get().advance("song-2");
        assertEquals("only the real end may say END", NativePlaylist.Outcome.END, last.outcome);
    }

    @Test
    public void listLoopWrapsInsteadOfEnding() {
        NativePlaylist.get().replace(list(3), NativePlaylist.Mode.LOOP_ALL, true, 0L, "test");
        NativePlaylist.Step wrapped = NativePlaylist.get().advance("song-2");
        assertEquals(NativePlaylist.Outcome.ADVANCE, wrapped.outcome);
        assertEquals("song-0", wrapped.track.songKey);
    }

    @Test
    public void repeatOneNeverAdvances() {
        NativePlaylist.get().replace(list(3), NativePlaylist.Mode.REPEAT_ONE, false, 0L, "test");
        NativePlaylist.Step step = NativePlaylist.get().advance("song-1");
        assertEquals(NativePlaylist.Outcome.REPEAT_CURRENT, step.outcome);
        assertEquals("song-1", step.track.songKey);
    }

    @Test
    public void shuffleFollowsTheOrderJsHandedOverAndWrapsWhenLooping() {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        for (int i : new int[] { 4, 1, 9, 2, 7 }) tracks.add(track(String.valueOf(i)));
        NativePlaylist.get().replace(tracks, NativePlaylist.Mode.SHUFFLE, true, 0L, "test");
        assertEquals("song-1", NativePlaylist.get().advance("song-4").track.songKey);
        assertEquals("song-9", NativePlaylist.get().advance("song-1").track.songKey);
        assertEquals("wrapped shuffle goes back to the head",
            "song-4", NativePlaylist.get().advance("song-7").track.songKey);
    }

    @Test
    public void shuffleWithoutLoopEndsAtTheTail() {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        for (int i : new int[] { 4, 1, 9 }) tracks.add(track(String.valueOf(i)));
        NativePlaylist.get().replace(tracks, NativePlaylist.Mode.SHUFFLE, false, 0L, "test");
        assertEquals(NativePlaylist.Outcome.END, NativePlaylist.get().advance("song-9").outcome);
    }

    @Test
    public void thirtyBoundariesResolveWithoutAskingTheWebView() {
        NativePlaylist.get().replace(list(31), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        String current = "song-0";
        for (int i = 1; i <= 30; i++) {
            NativePlaylist.Step step = NativePlaylist.get().advance(current);
            assertEquals("boundary " + i, NativePlaylist.Outcome.ADVANCE, step.outcome);
            assertEquals("song-" + i, step.track.songKey);
            current = step.track.songKey;
        }
        assertEquals("the 31st boundary is the real end",
            NativePlaylist.Outcome.END, NativePlaylist.get().advance(current).outcome);
    }

    @Test
    public void aReplacedPlaylistInvalidatesAnswersFromThePreviousOne() {
        long first = NativePlaylist.get().replace(list(5), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        NativePlaylist.Step step = NativePlaylist.get().advance("song-0");
        long second = NativePlaylist.get().replace(list(5), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        assertTrue("a new sync must move the generation", second > first);
        assertTrue("an answer from the previous generation is stale", step.generation != second);
    }

    @Test
    public void changingTheModeAlsoInvalidatesInFlightResolutions() {
        long first = NativePlaylist.get().replace(list(5), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        long second = NativePlaylist.get().setMode(NativePlaylist.Mode.REPEAT_ONE, false);
        assertTrue(second > first);
    }

    @Test
    public void lookaheadSkipsAheadWithoutMovingTheCursor() {
        NativePlaylist.get().replace(list(10), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        assertEquals("song-3", NativePlaylist.get().lookahead("song-0", 3).songKey);
        assertEquals("lookahead must not consume the step",
            "song-1", NativePlaylist.get().advance("song-0").track.songKey);
        assertNull(NativePlaylist.get().lookahead("song-0", 99));
    }

    @Test
    public void anUnknownCurrentSongIsNotAPlaylistEnd() {
        NativePlaylist.get().replace(list(5), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        assertFalse("native cannot decide when it does not know what is playing",
            NativePlaylist.get().canDecide("some-other-song"));
        assertEquals(0, NativePlaylist.get().remainingAfter("some-other-song"));
        assertEquals(4, NativePlaylist.get().remainingAfter("song-0"));
    }

    @Test
    public void theSnapshotNeverCarriesUrlsOrTitles() {
        NativePlaylist.get().replace(list(2), NativePlaylist.Mode.LOOP_ALL, true, 0L, "test");
        String snapshot = NativePlaylist.get().snapshot().toString();
        assertFalse(snapshot.contains("http"));
        assertFalse(snapshot.contains("T0"));
        assertTrue(snapshot.contains("\"size\":2"));
        assertNotNull(NativePlaylist.get().at(1));
    }
}
