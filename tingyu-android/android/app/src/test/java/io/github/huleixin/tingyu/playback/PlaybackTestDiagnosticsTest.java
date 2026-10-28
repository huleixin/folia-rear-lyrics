package io.github.huleixin.tingyu.playback;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/PlaybackTestDiagnosticsTest.java
public final class PlaybackTestDiagnosticsTest {
    @Test public void exportedCausesDoNotDiscloseLinksCredentialsOrPrivateFiles(){
        String value=PlaybackTestDiagnostics.redact("GET https://music.example/track?token=private /storage/emulated/0/music.mp3\nAuthorization=Bearer private");
        assertFalse(value.contains("music.example"));assertFalse(value.contains("private"));assertFalse(value.contains("music.mp3"));
        assertTrue(value.contains("[uri]"));assertTrue(value.contains("[path]"));
    }
    @Test public void maliciouslyLongErrorsHaveABoundedSize(){
        assertEquals(360,PlaybackTestDiagnostics.redact("x".repeat(10000)).length());assertEquals("",PlaybackTestDiagnostics.redact(null));
    }
}
