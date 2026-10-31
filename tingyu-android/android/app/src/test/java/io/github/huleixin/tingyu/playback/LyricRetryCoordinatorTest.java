package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * 灵动岛歌词补问链的**行为回归**（验收第 3 条）：
 * 模拟 HTTP 503 → 重试 → 歌词成功取得 → 当前曲 metadata 刷新成功；
 * 再验证切歌取消、用户停止、代次过期、重复合并。
 *
 * 全部走 {@link LyricRetryCoordinator} 的真实调度路径（假时钟注入），
 * 不再用「类不存在导致编译失败」冒充复现。
 */
public class LyricRetryCoordinatorTest {

    /** 假时钟：记录 (delay, task)，由测试手动推进。 */
    private static final class FakeRunner implements LyricRetryCoordinator.Runner {
        final Deque<long[]> delays = new ArrayDeque<>();
        final Deque<Runnable> tasks = new ArrayDeque<>();
        @Override public void post(Runnable task, long delayMs) {
            delays.addLast(new long[]{delayMs});
            tasks.addLast(task);
        }
        /** 推进一次：执行最早挂起的任务。 */
        void tick() {
            Runnable task = tasks.removeFirst();
            delays.removeFirst();
            task.run();
        }
        long nextDelay() { return delays.isEmpty() ? -1 : delays.peekFirst()[0]; }
    }

    /** 模拟 SongInfoLoader 的门：仍是当前曲、状态仍 pending 才放行。 */
    private static final class FakeGate implements LyricRetryCoordinator.Gate {
        String currentKey = "k1";
        String state = "pending";
        final List<String> allowed = new ArrayList<>();
        final List<String> blocked = new ArrayList<>();
        @Override public boolean allow(String songKey) {
            boolean ok = songKey.equals(currentKey) && "pending".equals(state);
            (ok ? allowed : blocked).add(songKey);
            return ok;
        }
    }

    // ---- 场景 1：503 → 重试 → 成功 ----

    @Test public void a503LeadsToOneScheduledRetryAndASecond503ToTheLastOne() {
        FakeRunner runner = new FakeRunner();
        FakeGate gate = new FakeGate();
        LyricRetryCoordinator coordinator =
            new LyricRetryCoordinator(LyricFetchRetryPolicy.RETRY_DELAYS_MS, runner, gate);
        int[] submissions = {0};
        coordinator.onFailure("k1", () -> submissions[0]++);
        assertEquals(20_000L, runner.nextDelay());
        runner.tick();
        assertEquals(1, submissions[0]);                 // 第一枪补问发出
        coordinator.onFailure("k1", () -> submissions[0]++); // 又一次 503
        assertEquals(60_000L, runner.nextDelay());
        runner.tick();
        assertEquals(2, submissions[0]);                 // 第二枪（封顶内）
        coordinator.onFailure("k1", () -> submissions[0]++); // 第三次失败：已到封顶
        assertTrue("封顶后不再挂起新任务", runner.tasks.isEmpty());
        assertEquals(2, submissions[0]);
    }

    @Test public void retryThatFetchesLyricsStopsTheChainAndRefreshesTheSession() {
        FakeRunner runner = new FakeRunner();
        FakeGate gate = new FakeGate();
        LyricRetryCoordinator coordinator =
            new LyricRetryCoordinator(LyricFetchRetryPolicy.RETRY_DELAYS_MS, runner, gate);
        int[] fetches = {0};
        boolean[] sessionRefreshed = {false};
        coordinator.onFailure("k1", () -> {
            fetches[0]++;
            boolean gotLyrics = fetches[0] >= 2;         // 第二次取到词
            if (gotLyrics) {
                sessionRefreshed[0] = true;              // SongInfoPublishPolicy.current → refreshSession
                coordinator.cancel("k1");                // 成功即清账
            } else {
                coordinator.onFailure("k1", () -> { fetches[0]++; sessionRefreshed[0] = true; coordinator.cancel("k1"); });
            }
        });
        runner.tick();                                   // 第一次：503
        assertEquals(1, fetches[0]);
        assertFalse(sessionRefreshed[0]);
        runner.tick();                                   // 重试：拿到词
        assertEquals(2, fetches[0]);
        assertTrue(sessionRefreshed[0]);                 // 当前曲歌词到 → metadata 刷新
        assertEquals(0, coordinator.attemptsOf("k1"));   // cancel 清账
    }

    // ---- 场景 2：切歌取消 ----

    @Test public void aTrackChangeCancelsThePendingRetryOfTheOldSong() {
        FakeRunner runner = new FakeRunner();
        FakeGate gate = new FakeGate();
        LyricRetryCoordinator coordinator =
            new LyricRetryCoordinator(LyricFetchRetryPolicy.RETRY_DELAYS_MS, runner, gate);
        int[] oldSongFetches = {0};
        coordinator.onFailure("old", () -> oldSongFetches[0]++);
        assertTrue(coordinator.hasPending("old"));
        gate.currentKey = "new";                         // 换歌
        coordinator.cancel("old");                       // runTrackChanged 的清账动作
        runner.tick();
        assertEquals(0, oldSongFetches[0]);              // 任务已作废，不再打 LRCLIB
        assertFalse(coordinator.hasPending("old"));
    }

    // ---- 场景 3：用户停止 / 服务停止 ----

    @Test public void stoppingPlaybackCancelsEverythingAndNothingFiresAfterwards() {
        FakeRunner runner = new FakeRunner();
        FakeGate gate = new FakeGate();
        LyricRetryCoordinator coordinator =
            new LyricRetryCoordinator(LyricFetchRetryPolicy.RETRY_DELAYS_MS, runner, gate);
        int[] fetches = {0};
        coordinator.onFailure("k1", () -> fetches[0]++);
        coordinator.cancel("k1");                        // 停止播放时的清理
        runner.tick();
        assertEquals(0, fetches[0]);
    }

    // ---- 场景 4：异步结果过期 ----

    @Test public void aRetryThatArrivesAfterTheSongChangedIsSilentlyDropped() {
        FakeRunner runner = new FakeRunner();
        FakeGate gate = new FakeGate();
        LyricRetryCoordinator coordinator =
            new LyricRetryCoordinator(LyricFetchRetryPolicy.RETRY_DELAYS_MS, runner, gate);
        int[] fetches = {0};
        coordinator.onFailure("k1", () -> fetches[0]++);
        gate.currentKey = "k2";                          // 任务还没跑，歌先换了（调用方漏了 cancel）
        runner.tick();
        assertEquals(0, fetches[0]);                     // gate 拦下过期结果
        assertEquals(1, gate.blocked.size());
    }

    @Test public void aRetryThatArrivesAfterLyricsAlreadyReadyIsDropped() {
        FakeRunner runner = new FakeRunner();
        FakeGate gate = new FakeGate();
        LyricRetryCoordinator coordinator =
            new LyricRetryCoordinator(LyricFetchRetryPolicy.RETRY_DELAYS_MS, runner, gate);
        int[] fetches = {0};
        coordinator.onFailure("k1", () -> fetches[0]++);
        gate.state = "ready";                            // WebView 抢先把词推到了
        runner.tick();
        assertEquals(0, fetches[0]);                     // 不覆盖已有时间轴
    }

    // ---- 场景 5：重复请求合并 ----

    @Test public void duplicateFailuresForOneSongCollapseIntoASinglePendingRetry() {
        FakeRunner runner = new FakeRunner();
        FakeGate gate = new FakeGate();
        LyricRetryCoordinator coordinator =
            new LyricRetryCoordinator(LyricFetchRetryPolicy.RETRY_DELAYS_MS, runner, gate);
        List<String> executed = new ArrayList<>();
        coordinator.onFailure("k1", () -> executed.add("first"));
        coordinator.onFailure("k1", () -> executed.add("second")); // 第一次失败还在挂起时又失败一次
        runner.tick();
        runner.tick();
        // 先到的被作废（stale 不执行），只有后到的跑：合并成一次。
        assertEquals(1, executed.size());
        assertEquals("second", executed.get(0));
    }

    // ---- Doze / 间隔合理性 ----

    @Test public void retryDelaysStayWithinOneTypicalTrackAndBelowRateLimitEtiquette() {
        long[] delays = LyricFetchRetryPolicy.RETRY_DELAYS_MS;
        assertEquals(2, delays.length);
        assertTrue("首枪 20s 内", delays[0] <= 20_000L);
        assertTrue("两枪合计 ≤80s，一首歌内补完", delays[0] + delays[1] <= 80_000L);
        // 限流结论（RATE_LIMITED）不走这条链：由 decide 单独保证，不因重试变密集。
        assertFalse(LyricFetchRetryPolicy.decide("RATE_LIMITED", 0).retry);
        assertFalse(LyricFetchRetryPolicy.decide("RATE_LIMITED", 1).retry);
    }
}
