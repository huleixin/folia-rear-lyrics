package io.github.huleixin.tingyu.playback;

import io.github.huleixin.tingyu.resolver.ResolverCredentials;
import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class UrlRefreshPolicyTest {

    @Test
    public void refreshesLongAudioProxied502AfterConfirmingNotTransient() {
        long positionMs = 1_554_688L; // 25m54s (TY-9e79f4b9)
        assertFalse(UrlRefreshPolicy.shouldRefreshUrl(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 502, 0, true,
            positionMs, positionMs, 0, 0, false, false
        ));
        assertTrue(UrlRefreshPolicy.shouldRefreshUrl(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 502, 0, true,
            positionMs, positionMs, 1, 0, false, false
        ));
    }

    @Test
    public void refreshesImmediatelyOnAgedUpstream403Or410() {
        assertTrue(UrlRefreshPolicy.shouldRefreshUrl(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 502, 403, true,
            120_000L, 120_000L, 0, 0, false, false
        ));
        assertTrue(UrlRefreshPolicy.shouldRefreshUrl(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 410, 410, false,
            90_000L, 90_000L, 0, 0, false, false
        ));
    }

    @Test
    public void doesNotTreatFreshUrlUpstream5xxAsExpiredUrl() {
        assertFalse(UrlRefreshPolicy.shouldRefreshUrl(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 502, 503, true,
            15_000L, 15_000L, 1, 0, false, false
        ));
        assertFalse(UrlRefreshPolicy.shouldRefreshUrl(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 502, 0, true,
            30_000L, 30_000L, 2, 0, false, false
        ));
    }

    @Test
    public void enforcesFiniteRetryLimitDedupAndUserPauseCancellation() {
        long pos = 1_600_000L;
        assertFalse(UrlRefreshPolicy.shouldRefreshUrl(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 502, 403, true,
            pos, pos, 1, UrlRefreshPolicy.MAX_URL_REFRESH_PER_TRACK, false, false
        ));
        assertFalse(UrlRefreshPolicy.shouldRefreshUrl(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 502, 403, true,
            pos, pos, 1, 0, false, true
        ));
        assertFalse(UrlRefreshPolicy.shouldRefreshUrl(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 502, 403, true,
            pos, pos, 1, 0, true, false
        ));
    }

    @Test
    public void credentialsRevisionAdvancesOnlyOnActualAccountChange() {
        ResolverCredentials.clearAll();
        long rev0 = ResolverCredentials.revision();
        ResolverCredentials.configure("netease", Collections.singletonMap("cookie", "MUSIC_U=aaa"));
        long rev1 = ResolverCredentials.revision();
        assertTrue(rev1 > rev0);

        // Redundant sync with identical credentials must not invalidate in-flight recovery.
        ResolverCredentials.configure("netease", Collections.singletonMap("cookie", "MUSIC_U=aaa"));
        assertEquals(rev1, ResolverCredentials.revision());

        // Account switch increments revision so stale refresh is discarded.
        ResolverCredentials.configure("netease", Collections.singletonMap("cookie", "MUSIC_U=bbb"));
        long rev2 = ResolverCredentials.revision();
        assertTrue(rev2 > rev1);

        ResolverCredentials.clear("netease");
        assertTrue(ResolverCredentials.revision() > rev2);
    }
}
