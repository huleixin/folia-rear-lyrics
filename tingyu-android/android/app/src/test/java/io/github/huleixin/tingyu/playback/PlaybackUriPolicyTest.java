package io.github.huleixin.tingyu.playback;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/PlaybackUriPolicyTest.java
public class PlaybackUriPolicyTest {
    @Test public void acceptsNetworkProxyOfflineFileAndContentUris() {
        for (String uri : new String[]{
                "https://cdn.example/song.flac", "http://127.0.0.1:1234/remote-audio/fixture",
                "file:///data/user/0/app/files/audio-offline-v1/fixture.audio",
                "content://media/external/audio/media/1"}) {
            assertTrue(uri, PlaybackUriPolicy.supports(uri));
        }
    }

    @Test public void rejectsMissingAndUnsupportedSchemes() {
        for (String uri : new String[]{null, "", "/data/song.flac", "file:",
                "ftp://cdn.example/song.flac", "data:audio/mpeg;base64,AA=="}) {
            assertFalse(String.valueOf(uri), PlaybackUriPolicy.supports(uri));
        }
    }
}
