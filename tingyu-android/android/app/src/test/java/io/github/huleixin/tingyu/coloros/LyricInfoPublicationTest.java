package io.github.huleixin.tingyu.coloros;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/coloros/LyricInfoPublicationTest.java
public class LyricInfoPublicationTest {
    @Test public void clearingSameTrackPublishesAnExplicitEmptyTimeline() {
        ColorOsLyricBridge.setPending("{\"lyric\":\"first\"}", false, "song-one");
        assertEquals("{\"lyric\":\"first\"}", ColorOsLyricBridge.metadataLyricInfoFor("song-one"));
        assertTrue(ColorOsLyricBridge.clear());
        assertFalse(ColorOsLyricBridge.clear());
        assertEquals("{\"lyricType\":0,\"lyric\":\"\",\"noLyric\":true}", ColorOsLyricBridge.metadataLyricInfoFor("song-one"));
        assertNull(ColorOsLyricBridge.metadataLyricInfoFor(null));
        assertNull(ColorOsLyricBridge.metadataLyricInfoFor(""));
    }
    @Test public void neverCarriesPreviousTrackLyricsToAnotherMediaId() {
        ColorOsLyricBridge.clear();
        assertTrue(ColorOsLyricBridge.setPending("{\"lyric\":\"first\"}", true, "song-one"));
        assertNotNull(ColorOsLyricBridge.lyricInfoFor("song-one"));
        assertNull(ColorOsLyricBridge.lyricInfoFor("song-two"));
        assertFalse(ColorOsLyricBridge.hasTranslationFor("song-two"));
        ColorOsLyricBridge.clear();
        assertNull(ColorOsLyricBridge.lyricInfoFor("song-one"));
    }
    @Test public void duplicatePayloadDoesNotScheduleMetadataRefresh() {
        ColorOsLyricBridge.clear();
        assertTrue(ColorOsLyricBridge.setPending("{}", false, "song"));
        assertFalse(ColorOsLyricBridge.setPending("{}", false, "song"));
        assertTrue(ColorOsLyricBridge.setPending("{}", true, "song"));
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsOversizedNativeBridgeInput() {
        ColorOsLyricBridge.setPending("x".repeat(200001), false, "song");
    }

    /**
     * The island used to go blank for the rest of a background session: the WebView cleared on
     * every track change, so the timeline primed for the next track was dropped too. A timeline
     * for another song must survive, and a song we simply have not heard about must read as
     * "pending" - not as "no lyrics", which is what made the consumer give up.
     */
    @Test public void anUnheardTrackIsPendingRatherThanConfirmedEmpty() {
        ColorOsLyricBridge.clear();
        ColorOsLyricBridge.setPending("{\"lyric\":\"current\"}", false, "song-one");
        assertEquals("pending", ColorOsLyricBridge.stateOf("song-two"));
        // Nothing is written for it: omitting the field is honest, an explicit empty is a claim.
        assertNull(ColorOsLyricBridge.metadataLyricInfoFor("song-two"));
        assertEquals("ready", ColorOsLyricBridge.stateOf("song-one"));
    }

    @Test public void aPrimedNextTrackTakesOverWithoutWaitingForJs() {
        ColorOsLyricBridge.clear();
        ColorOsLyricBridge.setPending("{\"lyric\":\"current\"}", false, "song-one");
        ColorOsLyricBridge.setPending("{\"lyric\":\"next\"}", false, "song-two");
        // Media3 auto-advances: the service asks for song-two's timeline, which is already here.
        assertEquals("{\"lyric\":\"next\"}", ColorOsLyricBridge.metadataLyricInfoFor("song-two"));
        assertEquals("{\"lyric\":\"current\"}", ColorOsLyricBridge.metadataLyricInfoFor("song-one"));
    }

    @Test public void clearingOneTrackKeepsThePrimedNeighbour() {
        ColorOsLyricBridge.clear();
        ColorOsLyricBridge.setPending("{\"lyric\":\"current\"}", false, "song-one");
        ColorOsLyricBridge.setPending("{\"lyric\":\"next\"}", false, "song-two");
        assertTrue(ColorOsLyricBridge.clearSong("song-one"));
        // This song is now definitively empty...
        assertEquals("{\"lyricType\":0,\"lyric\":\"\",\"noLyric\":true}", ColorOsLyricBridge.metadataLyricInfoFor("song-one"));
        // ...and the track already prepared for the next boundary still plays with lyrics.
        assertEquals("{\"lyric\":\"next\"}", ColorOsLyricBridge.metadataLyricInfoFor("song-two"));
    }

    @Test public void theCacheStaysBounded() {
        ColorOsLyricBridge.clear();
        for (int i = 0; i < 12; i++) ColorOsLyricBridge.setPending("{\"lyric\":\"" + i + "\"}", false, "song-" + i);
        // A whole playlist of timelines is not retained; only the recent window is.
        assertEquals("pending", ColorOsLyricBridge.stateOf("song-0"));
        assertEquals("ready", ColorOsLyricBridge.stateOf("song-11"));
        ColorOsLyricBridge.clear();
    }
}
