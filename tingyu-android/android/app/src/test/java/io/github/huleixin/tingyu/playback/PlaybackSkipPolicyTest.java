package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 不可播放歌曲的处理规则。
 *
 * <p>这里钉死的是那些"看起来像优化、其实会伤到用户"的边界：用户主动暂停不能当成故障，
 * 429 不能逐首判坏，单曲循环不能替用户跳走，缓冲中的抖动不该跳过任何一首。
 *
 * <p><b>真机 1.3.52 的回归测试：</b>旧版把 Media3 的 2004(BAD_HTTP_STATUS) 当成 HTTP 401
 * 归为 GLOBAL，一个 404 的过期 FLAC 链接就把整场播放挂起 —— 明明 hasNext=true 也不切歌。
 * 下面的 {@code theRealDevice2004CaseNeverSuspends} 系列按当时的诊断时序逐条复现。
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

    private static PlaybackSkipPolicy.Decision decideHttp(int code, int httpStatus) {
        PlaybackSkipPolicy.Facts f = facts(code, 0, 0, NativePlaylist.Mode.SEQUENCE, true, true, true);
        f.httpStatus = httpStatus;
        return PlaybackSkipPolicy.decide(f);
    }

    // ---- 真机 1.3.52 主回归：2004 不能再全局暂停 ----

    @Test
    public void theRealDevice2004CaseNeverSuspends() {
        // 日志原文：player-error code=2004 → skip-decision action=suspend reason=global-throttle，
        // hasNext=true 却停了。旧 classify 把 2004 当 HTTP 401 —— 这是 bug，必须判死。
        PlaybackSkipPolicy.Facts facts = facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, 0,
            NativePlaylist.Mode.SEQUENCE, true, true, true);
        facts.httpStatus = 404; // 从 cause chain 里提取到的真实状态码
        PlaybackSkipPolicy.Decision decision = PlaybackSkipPolicy.decide(facts);
        assertEquals("404 的 2004 必须切到下一首，绝不能 suspend",
            PlaybackSkipPolicy.Action.SKIP_NEXT, decision.action);
    }

    @Test
    public void a2004WithUnknownStatusIsBoundedRetryThenSkipNeverGlobal() {
        // 拿不到状态码的 2004 说不清是什么：可能 404 可能 401。
        // 旧版直接当 401 挂起整场 —— 新规则：有界重试，绝不 GLOBAL。
        assertEquals(PlaybackSkipPolicy.Kind.UNKNOWN,
            PlaybackSkipPolicy.classify(PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS));
        assertEquals(PlaybackSkipPolicy.Action.RETRY_SAME,
            decide(PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS).action);
        PlaybackSkipPolicy.Facts exhausted = facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, PlaybackSkipPolicy.MAX_RETRY_PER_TRACK, 0,
            NativePlaylist.Mode.SEQUENCE, true, true, true);
        assertEquals("重试预算用完就按单曲失败跳，仍然不许 suspend",
            PlaybackSkipPolicy.Action.SKIP_NEXT, PlaybackSkipPolicy.decide(exhausted).action);
    }

    @Test
    public void httpStatusDrivesClassificationWhenPresent() {
        assertEquals(PlaybackSkipPolicy.Kind.PERMANENT, PlaybackSkipPolicy.classify(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 404));
        assertEquals(PlaybackSkipPolicy.Kind.PERMANENT, PlaybackSkipPolicy.classify(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 410));
        assertEquals(PlaybackSkipPolicy.Kind.GLOBAL_THROTTLE, PlaybackSkipPolicy.classify(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 429));
        assertEquals(PlaybackSkipPolicy.Kind.GLOBAL_AUTH, PlaybackSkipPolicy.classify(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 403));
        assertEquals(PlaybackSkipPolicy.Kind.TRANSIENT, PlaybackSkipPolicy.classify(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 503));
        assertEquals(PlaybackSkipPolicy.Kind.PERMANENT, PlaybackSkipPolicy.classify(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 416));
    }

    @Test
    public void a410IsSkippedLikeA404() {
        assertEquals(PlaybackSkipPolicy.Action.SKIP_NEXT, decideHttp(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 410).action);
    }

    @Test
    public void aReal429SuspendsWithBoundedRetryAfter() {
        PlaybackSkipPolicy.Facts facts = facts(PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, 0,
            NativePlaylist.Mode.SEQUENCE, true, true, true);
        facts.httpStatus = 429;
        facts.retryAfterMs = 30_000L;
        PlaybackSkipPolicy.Decision decision = PlaybackSkipPolicy.decide(facts);
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, decision.action);
        assertTrue("原因里要带退避时长", decision.reason.contains("30000ms"));
        // Retry-After 超长时有界，不照单全收。
        facts.retryAfterMs = 999_999L;
        assertTrue(PlaybackSkipPolicy.decide(facts).reason.contains("120000ms"));
        facts.retryAfterMs = 0;
        assertFalse(PlaybackSkipPolicy.decide(facts).reason.isEmpty());
    }

    @Test
    public void aReal403SuspendsBut404DoesNot() {
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, decideHttp(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 403).action);
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, decideHttp(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 401).action);
        assertEquals("账号权限失败全局暂停；歌曲失效仍然只是跳过",
            PlaybackSkipPolicy.Action.SKIP_NEXT, decideHttp(
                PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 404).action);
    }

    @Test
    public void a5xxIsRetriedBeforeSkipping() {
        assertEquals(PlaybackSkipPolicy.Action.RETRY_SAME, decideHttp(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 502).action);
        PlaybackSkipPolicy.Facts exhausted = facts(PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS,
            PlaybackSkipPolicy.MAX_RETRY_PER_TRACK, 0, NativePlaylist.Mode.SEQUENCE, true, true, true);
        exhausted.httpStatus = 502;
        assertEquals(PlaybackSkipPolicy.Action.SKIP_NEXT, PlaybackSkipPolicy.decide(exhausted).action);
    }

    // ---- 音质降级：同一首 FLAC 失败先试 MP3，再不行才跳 ----

    @Test
    public void aFailedHiResTrackDowngradesBeforeSkipping() {
        PlaybackSkipPolicy.Facts facts = facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, 0,
            NativePlaylist.Mode.SEQUENCE, true, true, true);
        facts.httpStatus = 404;
        facts.canDowngrade = true;
        assertEquals("RS01 FLAC 404：先降 M800 重取地址，不直接跳",
            PlaybackSkipPolicy.Action.DOWNGRADE_RETRY, PlaybackSkipPolicy.decide(facts).action);
        // 降级也只试一轮。
        facts.downgradeTried = true;
        assertEquals(PlaybackSkipPolicy.Action.SKIP_NEXT, PlaybackSkipPolicy.decide(facts).action);
        // 没有更低档可降时不降。
        PlaybackSkipPolicy.Facts floor = facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, 0,
            NativePlaylist.Mode.SEQUENCE, true, true, true);
        floor.httpStatus = 404;
        assertEquals(PlaybackSkipPolicy.Action.SKIP_NEXT, PlaybackSkipPolicy.decide(floor).action);
    }

    // ---- 原有边界继续成立 ----

    @Test
    public void aMissingTrackIsSkippedAtOnce() {
        PlaybackSkipPolicy.Decision decision = decideHttp(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 404);
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
        assertEquals(PlaybackSkipPolicy.Action.RETRY_SAME,
            decide(PlaybackSkipPolicy.CODE_TIMEOUT).action);
    }

    @Test
    public void userPauseIsNeverTreatedAsAFailure() {
        PlaybackSkipPolicy.Facts paused = new PlaybackSkipPolicy.Facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, 0, NativePlaylist.Mode.SEQUENCE, true, false, true, true, true);
        paused.httpStatus = 404;
        PlaybackSkipPolicy.Decision decision = PlaybackSkipPolicy.decide(paused);
        assertEquals(PlaybackSkipPolicy.Action.STOP, decision.action);
        assertEquals("user-stop", decision.reason);

        PlaybackSkipPolicy.Facts stopped = new PlaybackSkipPolicy.Facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, 0, NativePlaylist.Mode.SEQUENCE, false, true, true, true, true);
        stopped.httpStatus = 404;
        assertEquals(PlaybackSkipPolicy.Action.STOP, PlaybackSkipPolicy.decide(stopped).action);
    }

    @Test
    public void rateLimitingAndAuthFailuresSuspendTheWholeSource() {
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, decideHttp(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 429).action);
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, decideHttp(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 401).action);
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, decideHttp(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 403).action);
        // 全局故障期间不许把一首判成坏歌、也不许继续在外面发请求。
        PlaybackSkipPolicy.Facts throttled = facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, PlaybackSkipPolicy.MAX_RETRY_PER_TRACK, 0,
            NativePlaylist.Mode.LOOP_ALL, true, true, true);
        throttled.httpStatus = 429;
        assertEquals(PlaybackSkipPolicy.Action.SUSPEND, PlaybackSkipPolicy.decide(throttled).action);
    }

    @Test
    public void consecutiveBadTracksStopAfterABoundedRun() {
        for (int skipped = 0; skipped < PlaybackSkipPolicy.MAX_CONSECUTIVE_SKIPS; skipped++) {
            PlaybackSkipPolicy.Facts f = facts(
                PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, skipped,
                NativePlaylist.Mode.SEQUENCE, true, true, true);
            f.httpStatus = 404;
            assertEquals("第 " + (skipped + 1) + " 首坏歌仍应跳过",
                PlaybackSkipPolicy.Action.SKIP_NEXT, PlaybackSkipPolicy.decide(f).action);
        }
        PlaybackSkipPolicy.Facts stopped = facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, PlaybackSkipPolicy.MAX_CONSECUTIVE_SKIPS,
            NativePlaylist.Mode.SEQUENCE, true, true, true);
        stopped.httpStatus = 404;
        PlaybackSkipPolicy.Decision stoppedDecision = PlaybackSkipPolicy.decide(stopped);
        assertEquals(PlaybackSkipPolicy.Action.STOP, stoppedDecision.action);
        assertEquals("too-many-consecutive-skips", stoppedDecision.reason);
    }

    @Test
    public void repeatOneNeverAdvancesForTheUser() {
        PlaybackSkipPolicy.Facts f = facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, 0, NativePlaylist.Mode.REPEAT_ONE, true, true, true);
        f.httpStatus = 404;
        PlaybackSkipPolicy.Decision decision = PlaybackSkipPolicy.decide(f);
        assertEquals(PlaybackSkipPolicy.Action.STOP, decision.action);
        assertEquals("repeat-one-unplayable", decision.reason);
    }

    @Test
    public void anEmptyQueueIsResolvedNativelyBeforeSkipping() {
        PlaybackSkipPolicy.Facts f = facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, 0, NativePlaylist.Mode.SEQUENCE, false, true, true);
        f.httpStatus = 404;
        PlaybackSkipPolicy.Decision decision = PlaybackSkipPolicy.decide(f);
        assertEquals("队列里没有下一首时必须先按当前音源解析一首",
            PlaybackSkipPolicy.Action.MATERIALIZE_THEN_SKIP, decision.action);
    }

    @Test
    public void withNothingResolvableLeftTheSessionStops() {
        PlaybackSkipPolicy.Facts f = facts(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, 0, NativePlaylist.Mode.SEQUENCE, false, false, false);
        f.httpStatus = 404;
        PlaybackSkipPolicy.Decision decision = PlaybackSkipPolicy.decide(f);
        assertEquals(PlaybackSkipPolicy.Action.STOP, decision.action);
        assertEquals("no-playable-successor", decision.reason);
    }

    @Test
    public void shuffleAndLoopAllFollowTheSameSkipRule() {
        for (NativePlaylist.Mode mode : new NativePlaylist.Mode[] {
                NativePlaylist.Mode.SEQUENCE, NativePlaylist.Mode.LOOP_ALL, NativePlaylist.Mode.SHUFFLE }) {
            PlaybackSkipPolicy.Facts f = facts(
                PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0, 0, mode, true, true, true);
            f.httpStatus = 404;
            assertEquals(mode.name() + " 应当与顺序播放同规则",
                PlaybackSkipPolicy.Action.SKIP_NEXT, PlaybackSkipPolicy.decide(f).action);
        }
    }

    @Test
    public void failureClassificationMatchesMedia3Codes() {
        assertEquals(PlaybackSkipPolicy.Kind.PERMANENT, PlaybackSkipPolicy.classify(PlaybackSkipPolicy.CODE_IO_FILE_NOT_FOUND));
        assertEquals(PlaybackSkipPolicy.Kind.TRANSIENT, PlaybackSkipPolicy.classify(PlaybackSkipPolicy.CODE_TIMEOUT));
        assertEquals(PlaybackSkipPolicy.Kind.GLOBAL_AUTH, PlaybackSkipPolicy.classify(PlaybackSkipPolicy.CODE_IO_NO_PERMISSION));
        assertTrue(PlaybackSkipPolicy.describeFailure(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 404).contains("permanent"));
        assertTrue(PlaybackSkipPolicy.describeFailure(
            PlaybackSkipPolicy.CODE_IO_BAD_HTTP_STATUS, 0).contains("http=?"));
    }
}
