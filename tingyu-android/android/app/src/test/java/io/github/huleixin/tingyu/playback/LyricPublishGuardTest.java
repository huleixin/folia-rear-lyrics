package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 灵动岛歌词「会话侧自检」状态机测试。
 *
 * <p>被覆盖的真实错误路径：换歌瞬间歌词还是 pending，v1.3.59 的自检在判断之前就把
 * 「本首已完成」写死；等歌词 ready 时第一行就 return，整首歌再也不会重建 metadata。
 * 另外它只比较长度，会话里装着上一首的时间轴、或本首的 noLyric 占位桩，长度都 ≥ 0，
 * 于是「有词但岛上看不到」永远不会被纠正。
 */
public class LyricPublishGuardTest {

    private static final String SONG = "netease:12345";
    private static final long GEN = 7L;

    private static LyricPublishGuard.Observation observation(String songKey) {
        return LyricPublishGuard.Observation.of(songKey, GEN);
    }

    /** 桥上 ready、会话里装着本首正确的时间轴、版本一致。 */
    private static LyricPublishGuard.Observation synced() {
        LyricPublishGuard.Observation obs = observation(SONG);
        obs.bridgeState = "ready";
        obs.bridgeRevision = 3;
        obs.sessionSongKey = SONG;
        obs.sessionPayloadLen = 4_096;
        obs.sessionPayloadIsStub = false;
        return obs;
    }

    @Test
    public void pendingNeverConsumesTheOneShotAndTheTrackIsPublishedWhenReady() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack(SONG, GEN);

        LyricPublishGuard.Observation pending = observation(SONG);
        pending.bridgeState = "pending";
        pending.sessionSongKey = SONG;
        pending.sessionPayloadLen = LyricPublishGuard.SESSION_ABSENT;

        LyricPublishGuard.Verdict waiting = guard.evaluate(pending);
        assertEquals(LyricPublishGuard.Action.NONE, waiting.action);
        assertEquals(LyricPublishGuard.Layer.FETCH, waiting.layer);
        assertEquals(0, guard.attempts());

        // 歌词到齐：必须还能重建一次（v1.3.59 在这里被一次性标记挡住了）。
        LyricPublishGuard.Observation ready = observation(SONG);
        ready.bridgeState = "ready";
        ready.bridgeRevision = 1;
        ready.sessionSongKey = SONG;
        ready.sessionPayloadLen = LyricPublishGuard.SESSION_ABSENT;

        LyricPublishGuard.Verdict publish = guard.evaluate(ready);
        assertEquals(LyricPublishGuard.Action.PUBLISH, publish.action);
        assertEquals(LyricPublishGuard.Layer.SESSION, publish.layer);
        assertEquals(1, guard.attempts());

        // 重建之后回读：版本一致 → 不再刷新。
        guard.onPublished(SONG, 1, GEN);
        assertEquals(LyricPublishGuard.Action.NONE, guard.evaluate(syncedFor(1)).action);
    }

    private static LyricPublishGuard.Observation syncedFor(int revision) {
        LyricPublishGuard.Observation obs = observation(SONG);
        obs.bridgeState = "ready";
        obs.bridgeRevision = revision;
        obs.sessionSongKey = SONG;
        obs.sessionPayloadLen = 2_048;
        return obs;
    }

    @Test
    public void anInSyncSessionIsLeftAlone() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack(SONG, GEN);
        guard.onPublished(SONG, 3, GEN);   // 之前某条路径已经重建过 metadata
        LyricPublishGuard.Verdict verdict = guard.evaluate(synced());
        assertEquals(LyricPublishGuard.Action.NONE, verdict.action);
        assertEquals(LyricPublishGuard.Layer.CONSUMER, verdict.layer);
        assertEquals(0, guard.attempts());
    }

    @Test
    public void aPlaceholderStubIsReplacedByTheRealTimeline() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack(SONG, GEN);
        LyricPublishGuard.Observation obs = synced();
        obs.sessionPayloadIsStub = true;
        obs.sessionPayloadLen = 48;

        LyricPublishGuard.Verdict verdict = guard.evaluate(obs);
        assertEquals(LyricPublishGuard.Action.PUBLISH, verdict.action);
        assertEquals("session-stub#1", verdict.reason);
    }

    @Test
    public void aSessionShowingAnotherSongIsRepublished() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack(SONG, GEN);
        LyricPublishGuard.Observation obs = synced();
        obs.sessionSongKey = "netease:99999";
        obs.sessionPayloadLen = 3_000;

        LyricPublishGuard.Verdict verdict = guard.evaluate(obs);
        assertEquals(LyricPublishGuard.Action.PUBLISH, verdict.action);
        assertEquals("session-other-song#1", verdict.reason);
    }

    @Test
    public void aStaleRevisionIsRepublishedExactlyOnce() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack(SONG, GEN);
        guard.onPublished(SONG, 3, GEN);
        LyricPublishGuard.Observation obs = synced();
        obs.bridgeRevision = 4;

        assertEquals("stale-revision#1", guard.evaluate(obs).reason);
        guard.onPublished(SONG, 4, GEN);
        assertEquals(LyricPublishGuard.Action.NONE, guard.evaluate(obs).action);
    }

    @Test
    public void republishingIsBoundedPerRevision() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack(SONG, GEN);
        LyricPublishGuard.Observation obs = observation(SONG);
        obs.bridgeState = "ready";
        obs.bridgeRevision = 5;
        obs.sessionSongKey = SONG;
        obs.sessionPayloadLen = LyricPublishGuard.SESSION_ABSENT;

        for (int i = 0; i < LyricPublishGuard.MAX_ATTEMPTS_PER_KEY; i++) {
            assertEquals(LyricPublishGuard.Action.PUBLISH, guard.evaluate(obs).action);
        }
        LyricPublishGuard.Verdict spent = guard.evaluate(obs);
        assertEquals(LyricPublishGuard.Action.NONE, spent.action);
        assertEquals(LyricPublishGuard.Layer.EXHAUSTED, spent.layer);
        assertTrue(guard.exhausted());

        // 歌词内容更新（新版本）应重新获得额度：这不是无限重试，而是跟着内容走。
        obs.bridgeRevision = 6;
        assertEquals(LyricPublishGuard.Action.PUBLISH, guard.evaluate(obs).action);
        assertEquals(1, guard.attempts());
    }

    @Test
    public void aStaleGenerationIsDropped() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack(SONG, GEN);
        LyricPublishGuard.Observation obs = synced();
        obs.generation = GEN - 1;

        LyricPublishGuard.Verdict verdict = guard.evaluate(obs);
        assertEquals(LyricPublishGuard.Action.NONE, verdict.action);
        assertEquals(LyricPublishGuard.Layer.STALE, verdict.layer);
        assertEquals(0, guard.attempts());
    }

    @Test
    public void aLateCallbackForThePreviousSongCannotTouchTheNewOne() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack("song-A", 1);
        // 换歌：代次前进。
        guard.onTrack("song-B", 2);

        LyricPublishGuard.Observation late = LyricPublishGuard.Observation.of("song-A", 1);
        late.bridgeState = "ready";
        late.bridgeRevision = 2;
        late.sessionSongKey = "song-A";
        late.sessionPayloadLen = LyricPublishGuard.SESSION_ABSENT;

        LyricPublishGuard.Verdict verdict = guard.evaluate(late);
        assertEquals(LyricPublishGuard.Action.NONE, verdict.action);
        assertEquals(LyricPublishGuard.Layer.STALE, verdict.layer);
        // onPublished 也必须拒绝旧歌的记账，否则新歌会被误判为「已发布」。
        guard.onPublished("song-A", 2, 1);
        assertEquals(-1, guard.publishedRevision());
    }

    @Test
    public void aConfirmedNoLyricTrackGetsItsStubOnce() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack(SONG, GEN);
        LyricPublishGuard.Observation obs = observation(SONG);
        obs.bridgeState = "none";
        obs.sessionSongKey = SONG;
        obs.sessionPayloadLen = LyricPublishGuard.SESSION_ABSENT;

        assertEquals("none-stub-missing#1", guard.evaluate(obs).reason);
        guard.onPublished(SONG, 0, GEN);
        obs.sessionPayloadLen = 48;
        obs.sessionPayloadIsStub = true;
        assertEquals(LyricPublishGuard.Action.NONE, guard.evaluate(obs).action);
    }

    @Test
    public void anUnreadableSessionGetsABoundedRetry() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack(SONG, GEN);
        LyricPublishGuard.Observation obs = observation(SONG);
        obs.bridgeState = "ready";
        obs.bridgeRevision = 1;
        obs.sessionSongKey = null;
        obs.sessionPayloadLen = LyricPublishGuard.SESSION_UNREADABLE;

        assertEquals("session-unreadable#1", guard.evaluate(obs).reason);
        for (int i = 1; i < LyricPublishGuard.MAX_ATTEMPTS_PER_KEY; i++) guard.evaluate(obs);
        assertEquals(LyricPublishGuard.Layer.EXHAUSTED, guard.evaluate(obs).layer);
    }

    @Test
    public void noSongMeansNothingToDo() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack("", 0);
        assertEquals(LyricPublishGuard.Action.NONE, guard.evaluate(observation("")).action);
        assertEquals(LyricPublishGuard.Action.NONE, guard.evaluate(null).action);
    }

    @Test
    public void theDiagnosticSnapshotNamesTheState() {
        LyricPublishGuard guard = new LyricPublishGuard();
        guard.onTrack(SONG, GEN);
        assertFalse(guard.describe().isEmpty());
        assertTrue(guard.describe(), guard.describe().contains("attempts=0/3"));
    }
}
