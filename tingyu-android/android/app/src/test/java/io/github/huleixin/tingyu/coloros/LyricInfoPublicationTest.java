package io.github.huleixin.tingyu.coloros;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/coloros/LyricInfoPublicationTest.java
public class LyricInfoPublicationTest {
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
}
