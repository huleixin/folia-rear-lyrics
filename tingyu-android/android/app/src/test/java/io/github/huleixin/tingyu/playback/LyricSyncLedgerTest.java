package io.github.huleixin.tingyu.playback;

import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/LyricSyncLedgerTest.java
/**
 * 端到端归因的行为回归：给定三端各自的记录，**必须**给出唯一一种结论。
 *
 * <p>验收点就是需求里那句话：能判断「歌词没取到、没发布、时钟不对、系统未消费，
 * 还是背屏渲染停止」—— 五种情形五个不同的 {@link LyricSyncLedger.Verdict}，
 * 不许合并成一个布尔。
 */
public class LyricSyncLedgerTest {

    private static final String SONG = "song-a";
    private static final String EPOCH = "song-a#7";
    private static final String HASH = "abcdef0123456789";

    private LyricSyncLedger ledger;

    @Before
    public void setUp() {
        ledger = LyricSyncLedger.get();
        ledger.resetForTest();
    }

    private void fullySynced(long now) {
        ledger.track(SONG, EPOCH);
        ledger.unified(SONG, new LyricTimelineAuthority.Selection(
                LyricTimelineAuthority.State.READY, "{}", false, HASH, 4, "stage"));
        ledger.islandPublished(SONG, HASH, now);
        ledger.rearDelivered(SONG, EPOCH, HASH, 12, now);
        ledger.rearApplied(SONG, EPOCH, now);
        ledger.session(true, true, 30_000L, 240_000L, now);
    }

    @Test
    public void idleWithoutATrack() {
        assertEquals(LyricSyncLedger.Verdict.IDLE, ledger.verdict(1_000L));
    }

    @Test
    public void inactiveSessionIsReportedFirst() {
        ledger.track(SONG, EPOCH);
        ledger.session(false, true, 0L, 0L, 1_000L);
        assertEquals(LyricSyncLedger.Verdict.SESSION_INACTIVE, ledger.verdict(1_000L));
    }

    @Test
    public void lyricsNeverFetched() {
        long now = 1_000_000L;
        ledger.track(SONG, EPOCH);
        ledger.session(true, true, 1_000L, 200_000L, now);
        assertEquals(LyricSyncLedger.Verdict.NOT_FETCHED, ledger.verdict(now));
    }

    @Test
    public void confirmedNoLyricsIsNotAFault() {
        long now = 1_000_000L;
        ledger.track(SONG, EPOCH);
        ledger.unified(SONG, new LyricTimelineAuthority.Selection(
                LyricTimelineAuthority.State.NONE, null, false, "", 2, "stage"));
        ledger.session(true, true, 1_000L, 200_000L, now);
        assertEquals(LyricSyncLedger.Verdict.NONE_CONFIRMED, ledger.verdict(now));
    }

    @Test
    public void fetchedButNotPublishedToTheIsland() {
        long now = 1_000_000L;
        ledger.track(SONG, EPOCH);
        ledger.unified(SONG, new LyricTimelineAuthority.Selection(
                LyricTimelineAuthority.State.READY, "{}", false, HASH, 4, "stage"));
        ledger.rearDelivered(SONG, EPOCH, HASH, 12, now);
        ledger.rearApplied(SONG, EPOCH, now);
        ledger.session(true, true, 1_000L, 200_000L, now);
        // 背屏已经有了，但会话里还没有这一版 → 是「没发布」，不是「背屏没拿到」。
        assertEquals(LyricSyncLedger.Verdict.NOT_PUBLISHED, ledger.verdict(now));
    }

    @Test
    public void publishedButRearStillOnTheOldVersion() {
        long now = 1_000_000L;
        ledger.track(SONG, EPOCH);
        ledger.unified(SONG, new LyricTimelineAuthority.Selection(
                LyricTimelineAuthority.State.READY, "{}", false, HASH, 4, "stage"));
        ledger.islandPublished(SONG, HASH, now);
        ledger.rearDelivered(SONG, EPOCH, "oldhash000000000", 12, now);
        ledger.rearApplied(SONG, EPOCH, now);
        ledger.session(true, true, 1_000L, 200_000L, now);
        assertEquals(LyricSyncLedger.Verdict.NOT_DELIVERED, ledger.verdict(now));
    }

    @Test
    public void rearStoppedApplyingWhilePlaying() {
        long now = 1_000_000L;
        fullySynced(now);
        assertEquals(LyricSyncLedger.Verdict.IN_SYNC, ledger.verdict(now));
        long later = now + LyricSyncLedger.REAR_RENDER_STALL_MS + 1L;
        // 渲染端还活着（状态轮询持续到达），只是不再应用新版本 —— 这才是「渲染停滞」。
        ledger.rearHeartbeat(later);
        assertEquals(LyricSyncLedger.Verdict.REAR_RENDER_STALLED, ledger.verdict(later));
    }

    @Test
    public void selfReportedSleepIsSuspensionNotAFault() {
        long now = 1_000_000L;
        fullySynced(now);
        ledger.rearSleeping(true, now);
        long later = now + LyricSyncLedger.REAR_SUSPEND_MS + 1L;
        // 页面自己报告了休眠（息屏）：轮询消失是正常行为，归因「挂起」而非故障。
        assertEquals(LyricSyncLedger.Verdict.REAR_SUSPENDED, ledger.verdict(later));
        assertTrue(ledger.describe(later).contains("rearSleep=true"));
    }

    @Test
    public void silentDisappearanceIsUnresponsiveNotSuspension() {
        long now = 1_000_000L;
        fullySynced(now);
        // 最后已知是醒着（从未报告休眠），轮询却突然消失：被系统桌面覆盖 /
        // WebView 冻结 / 渲染进程卡死 —— 进程内不可区分，如实报「失联」。
        long later = now + LyricSyncLedger.REAR_SUSPEND_MS + 1L;
        assertEquals(LyricSyncLedger.Verdict.REAR_UNRESPONSIVE, ledger.verdict(later));
        assertTrue(ledger.describe(later).contains("rearSleep=unknown"));
    }

    @Test
    public void wakeSignalReturnsTheVerdictToSync() {
        long now = 1_000_000L;
        fullySynced(now);
        ledger.rearSleeping(true, now);
        // 睡眠中的背屏不推进是正常的：即便 applied 停了 20s 也不判渲染停滞；
        // 会话时钟照常心跳（睡眠不影响播放）—— 状态仍是 in_sync。
        long asleep = now + 20_000L;
        ledger.rearHeartbeat(asleep);
        ledger.session(true, true, 50_000L, 240_000L, asleep);
        assertEquals(LyricSyncLedger.Verdict.IN_SYNC, ledger.verdict(asleep));
        // 唤醒：轮询与推进都回来了 —— 仍是 in_sync，而不是停在挂起态。
        ledger.rearSleeping(false, asleep + 1_000L);
        ledger.rearAppliedAt(SONG, EPOCH, 42_000L, asleep + 1_000L);
        ledger.session(true, true, 51_000L, 240_000L, asleep + 1_000L);
        assertEquals(LyricSyncLedger.Verdict.IN_SYNC, ledger.verdict(asleep + 1_000L));
    }

    @Test
    public void appliedHeartbeatKeepsTheRearVerdictAlive() {
        long now = 1_000_000L;
        fullySynced(now);
        // 渲染端 10s 一次的推进心跳 + 状态轮询都活着，播放中只有会话时钟停了
        // → 归因到时钟，绝不落到渲染停滞。
        long later = now + LyricSyncLedger.CLOCK_STALE_MS + 1L;
        ledger.rearHeartbeat(later);
        ledger.rearAppliedAt(SONG, EPOCH, 42_000L, later);
        assertEquals(LyricSyncLedger.Verdict.CLOCK_STALE, ledger.verdict(later));
        assertTrue(ledger.describe(later).contains("appliedPos=42000"));
    }

    @Test
    public void playbackStateStoppedRefreshing() {
        long now = 1_000_000L;
        fullySynced(now);
        long later = now + LyricSyncLedger.CLOCK_STALE_MS + 1L;
        // 背屏还在上报（所以它没停），只有会话时钟停了 → 归因到时钟，而不是渲染。
        ledger.rearApplied(SONG, EPOCH, later);
        assertEquals(LyricSyncLedger.Verdict.CLOCK_STALE, ledger.verdict(later));
    }

    @Test
    public void everythingHoldsSoOnlyTheConsumerCanBeAtFault() {
        long now = 1_000_000L;
        fullySynced(now);
        assertEquals(LyricSyncLedger.Verdict.IN_SYNC, ledger.verdict(now));
        assertTrue(ledger.threeEndsAligned());
        assertTrue(ledger.describe(now).contains("verdict=in_sync"));
    }

    @Test
    public void pausedPlaybackDoesNotBlameTheClock() {
        long now = 1_000_000L;
        ledger.track(SONG, EPOCH);
        ledger.unified(SONG, new LyricTimelineAuthority.Selection(
                LyricTimelineAuthority.State.READY, "{}", false, HASH, 4, "stage"));
        ledger.islandPublished(SONG, HASH, now);
        ledger.rearDelivered(SONG, EPOCH, HASH, 12, now);
        ledger.rearApplied(SONG, EPOCH, now);
        ledger.session(true, false, 5_000L, 200_000L, now);
        long later = now + LyricSyncLedger.CLOCK_STALE_MS * 10;
        // 暂停时位置不该自己走，时钟不刷新是正确的；背屏的状态轮询与播放无关，
        // 页面可见时照常到达 —— 活着的证据要补上，才能走到时钟判定。
        ledger.rearHeartbeat(later);
        assertEquals(LyricSyncLedger.Verdict.IN_SYNC, ledger.verdict(later));
    }

    @Test
    public void trackChangeResetsThePerSongEvidence() {
        long now = 1_000_000L;
        fullySynced(now);
        assertTrue(ledger.threeEndsAligned());
        ledger.track("song-b", "song-b#8");
        // 换了歌但新歌的词还没到：必须说是「没取到」，不能沿用上一首的结论。
        assertEquals(LyricSyncLedger.Verdict.NOT_FETCHED, ledger.verdict(now));
        assertFalse(ledger.threeEndsAligned());
    }

    @Test
    public void appliedOffsetShowsUpInTheDiagnostics() {
        long now = 1_000_000L;
        fullySynced(now);
        ledger.offset(-320L);
        String line = ledger.describe(now);
        // 诊断必须能区分「时钟偏差」与「偏移偏差」：偏移值本身就是观测点之一。
        assertTrue(line.contains("offset=-320ms"));
        ledger.offset(500L);
        assertTrue(ledger.describe(now).contains("offset=+500ms"));
    }
}
