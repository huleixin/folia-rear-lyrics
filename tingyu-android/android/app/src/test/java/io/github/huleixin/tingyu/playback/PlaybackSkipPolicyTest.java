package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 不可播放歌曲的处理规则。
 *
 * <p>这里钉死的是那些"看起来像优化、其实会伤到用户"的边界：用户主动暂停不能举手 assume 成
 * 故障，429 不能逐首判坏，单曲循环不能替用户跳走，缓冲中的抖动不该跳过任何一首。
 */
public class PlaybackSkipPolicyTest {

    private static PlaybackSkipPolicy.Facts facts(int code, int retries, int consecutive,
                                                  NativePlaylist.Mode mode, boolean hasNext,
                                                  boolean materializable, boolean candidates) {
        return new PlaybackSkipPolicy.Facts(code, retries, consecutive, mode, false, false,
            hasNext, materializable, candidates);
    }

    private static PlaybackSkipPolicy.Decision decide(int code) {
        return PlaybackSkipPolicy.decide(facts(code, 0, 0, NativePlaylist.Mode.SEQUENCE, true, true, true));
    }

    @Test
    public void aMissingTrackIsSkippedAtOnce() {
        PlaybackSkipPolicy.Decision decision = decide(PlaybackSkipPolicy.CODE_IO_HTTP_404);
        assertEquals("HTTP 404 重试没有意义，直接跳",
            PlaybackSkipPolicy.Action.SKIP_NEXT, decision.action);
        assertEquals("skip-unplayable", decision.reason);
    }

    @Test
    public void aUndecodableTrackIsSkippedAtOnce() {
        assertEquals(PlaybackSkipPolicy.Action.SKIP_NEXT, decide(PlaybackSkipPolicy.CODE_DECODING_FAILED).action);
        PlaybackSkipPolicy.Decision excluded = decide(PlaybackSkipPolicy.CODE_DECODING_FORMAT_EXCLUDED);
        assertEquals(PlaybackSkipPolicy.Action.SKIP_NEXT, excluded.action);
    }

    @Test
    public void aDroppedConnectionIsRetriedBeforeSkipping() {
        // 网络抖动：同一首有限重试，预算用完才跳。
        assertEquals(PlaybackSkipPolicy.Action.RETRY_SAME,
            decide(PlaybackSkipPolicy.CODE_IO_NETWORK_CONNECTION_FAILED).action);
        assertEquals(PlaybackSkipPolicy.Action.SKIP_NEXT, PlaybackSkipPolicy.decide(
            facts(PlaybackSkipPolicy.CODE_IO_NETWORK_CONNECTION_FAILED,
                PlaybackSkipPolicy.MAX_RETRY_PER_TRACK, 0, NativePlaylist.Mode.SEQUENCE, true, true, true)).action);
    }

    @Test
    public void aPrepareTimeoutIsRetriedThenSkipped() {
        assertEquals(PlaybackSkipPolicy.Action.RETRY_SAME, decide(PlaybackSkipPolicy.CODE_PREPARE_TIMEOUT).action);
    }

    @Test
    public void userPauseIsNeverTreatedAsAFailure() {
        PlaybackSkipPolicy.Facts paused = new PlaybackSkipPolicy.Facts(
            PlaybackSkipPolicy.CODE_IO_HTTP_404, 0, 0, NativePlaylist.Mode.SEQUENCE, true, false, true, true, true);
        PlaybackSkipPolicy.Decision decision = PlaybackSkipPolicy.decide(paused);
        assertEquals(PlaybackSkipPolicy.Action.STOP, decision.action);
        assertEquals("user-stop", decision.reason);

        PlaybackSkipPolicy.Facts stopped = new PlaybackSkipPolicy.Facts(
            PlaybackSkipPolicy.CODE_IO_HTTP_404, 0, 0, NativePlaylist.Mode.SEQUENCE, false, true, true, true, true);
        assertEquals(PlaybackSkipPolicy.Action.STOP, PlaybackSkipPolicy.decide(stopped).action);
    }

    @Test
    public void rateLimitingAndAuthFailuresSuspendTheWholeSource() {
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, decide(PlaybackSkipPolicy.CODE_IO_HTTP_429).action);
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, decide(PlaybackSkipPolicy.CODE_IO_HTTP_401).action);
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, decide(PlaybackSkipPolicy.CODE_IO_HTTP_403).action);
        // 全局故障期间不许把一首判成坏歌、也不许继续在外面发请求。
        PlaybackSkipPolicy.Decision skipping = PlaybackSkipPolicy.decide(facts(
            PlaybackSkipPolicy.CODE_IO_HTTP_429, PlaybackSkipPolicy.MAX_RETRY_PER_TRACK, 0, NativePlaylist.Mode.LOOP_ALL, true, true, true));
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, skipping.action);
    }

    @Test
    public void consecutiveBadTracksStopAfterABoundedRun() {
        for (int skipped = 0; skipped < PlaybackSkipPolicy.MAX_CONSECUTIVE_SKIPS; skipped++) {
            assertEquals("第 " + (skipped + 1) + " 首坏歌仍应跳过",
                PlaybackSkipPolicy.Action.SKIP_NEXT, PlaybackSkipPolicy.decide(facts(
                    PlaybackSkipPolicy.CODE_IO_HTTP_404, 0, skipped, NativePlaylist.Mode.SEQUENCE, true, true, true)).action);
        }
        PlaybackSkipPolicy.Decision stopped = PlaybackSkipPolicy.decide(facts(
            PlaybackSkipPolicy.CODE_IO_HTTP_404, 0, PlaybackSkipPolicy.MAX_CONSECUTIVE_SKIPS,
            NativePlaylist.Mode.SEQUENCE, true, true, true));
        assertEquals(PlaybackSkipPolicy.Action.STOP, stopped.action);
        assertEquals("too-many-consecutive-skips", stopped.reason);
    }

    @Test
    public void repeatOneNeverAdvancesForTheUser() {
        PlaybackSkipPolicy.Decision decision = PlaybackSkipPolicy.decide(facts(
            PlaybackSkipPolicy.CODE_IO_HTTP_404, 0, 0, NativePlaylist.Mode.REPEAT_ONE, true, true, true));
        assertEquals(PlaybackSkipPolicy.Action.STOP, decision.action);
        assertEquals("repeat-one-unplayable", decision.reason);
    }

    @Test
    public void anEmptyQueueIsResolvedNativelyBeforeSkipping() {
        PlaybackSkipPolicy.Decision decision = PlaybackSkipPolicy.decide(facts(
            PlaybackSkipPolicy.CODE_IO_HTTP_404, 0, 0, NativePlaylist.Mode.SEQUENCE, false, true, true));
        assertEquals("队列里没有下一首时必须先按当前音源解析一首",
            PlaybackSkipPolicy.Action.MATERIALIZE_THEN_SKIP, decision.action);
    }

    @Test
    public void withNothingResolvableLeftTheSessionStops() {
        PlaybackSkipPolicy.Decision decision = PlaybackSkipPolicy.decide(facts(
            PlaybackSkipPolicy.CODE_IO_HTTP_404, 0, 0, NativePlaylist.Mode.SEQUENCE, false, false, false));
        assertEquals(PlaybackSkipPolicy.Action.STOP, decision.action);
        assertEquals("no-playable-successor", decision.reason);
    }

    @Test
    public void shuffleAndLoopAllFollowTheSameSkipRule() {
        for (NativePlaylist.Mode mode : new NativePlaylist.Mode[] {
                NativePlaylist.Mode.SEQUENCE, NativePlaylist.Mode.LOOP_ALL, NativePlaylist.Mode.SHUFFLE }) {
            assertEquals(mode.name() + " 应当与顺序播放同规则",
                PlaybackSkipPolicy.Action.SKIP_NEXT, PlaybackSkipPolicy.decide(facts(
                    PlaybackSkipPolicy.CODE_IO_HTTP_404, 0, 0, mode, true, true, true)).action);
        }
    }

    @Test
    public void failureClassificationMatchesMedia3Codes() {
        assertEquals(PlaybackSkipPolicy.Kind.PERMANENT, PlaybackSkipPolicy.classify(PlaybackSkipPolicy.CODE_IO_HTTP_404));
        assertEquals(PlaybackSkipPolicy.Kind.TRANSIENT, PlaybackSkipPolicy.classify(PlaybackSkipPolicy.CODE_TIMEOUT));
        assertEquals(PlaybackSkipPolicy.Kind.GLOBAL, PlaybackSkipPolicy.classify(PlaybackSkipPolicy.CODE_IO_HTTP_429));
        assertTrue(PlaybackSkipPolicy.describeFailure(PlaybackSkipPolicy.CODE_IO_HTTP_404).contains("permanent"));
    }
}
