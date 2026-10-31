package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayDeque;
import java.util.Deque;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/LyricRetryCoordinatorCapTest.java
/**
 * 补问账本的**有界性回归**（2026-10-31 元数据链路统一审计 R1）：
 * 长期后台播放 + 大面积网络失败时，pending/attempts 不许无界增长。
 * 淘汰用 LRU —— 旧歌被挤出后不保留计数，重新进入窗口时从零开始。
 */
public class LyricRetryCoordinatorCapTest {

    private static final class FakeRunner implements LyricRetryCoordinator.Runner {
        final Deque<Runnable> tasks = new ArrayDeque<>();
        @Override public void post(Runnable task, long delayMs) { tasks.addLast(task); }
    }

    private static final class AllowAll implements LyricRetryCoordinator.Gate {
        @Override public boolean allow(String songKey) { return true; }
    }

    @Test
    public void ledgerStaysBoundedAcrossManyFailedSongs() {
        FakeRunner runner = new FakeRunner();
        LyricRetryCoordinator coordinator = new LyricRetryCoordinator(
            new long[]{20_000L, 60_000L}, runner, new AllowAll());

        for (int i = 0; i < 200; i++) {
            coordinator.onFailure("song-" + i, () -> { });
        }
        // 账本上限 64：200 首失败后，最早的歌已被 LRU 淘汰，不再保留挂起重试或计数。
        assertFalse(coordinator.hasPending("song-0"));
        assertEquals(0, coordinator.attemptsOf("song-0"));
        // 最新的歌仍在册。
        assertTrue(coordinator.hasPending("song-199"));
        assertEquals(1, coordinator.attemptsOf("song-199"));
    }

    @Test
    public void evictedSongStartsFromZeroWhenItFailsAgain() {
        FakeRunner runner = new FakeRunner();
        LyricRetryCoordinator coordinator = new LyricRetryCoordinator(
            new long[]{20_000L, 60_000L}, runner, new AllowAll());

        for (int i = 0; i < 200; i++) coordinator.onFailure("song-" + i, () -> { });
        // song-0 被淘汰后再次失败：按第 1 次失败处理（重新入册），而不是带着旧账直接封顶。
        coordinator.onFailure("song-0", () -> { });
        assertTrue(coordinator.hasPending("song-0"));
        assertEquals(1, coordinator.attemptsOf("song-0"));
    }

    @Test
    public void cancelStillClearsBothLedgers() {
        FakeRunner runner = new FakeRunner();
        LyricRetryCoordinator coordinator = new LyricRetryCoordinator(
            new long[]{20_000L}, runner, new AllowAll());
        coordinator.onFailure("song-x", () -> { });
        coordinator.cancel("song-x");
        assertFalse(coordinator.hasPending("song-x"));
        assertEquals(0, coordinator.attemptsOf("song-x"));
    }
}
