package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 真机 2026-10-31：小米灵动岛歌词「有些歌有、有些歌整首没有」。
 *
 * 诊断证据：LRCLIB 一次 HTTP 503；失败后 {@code lyricsCooldown} 记 90 秒，但没有任何
 * 调度器会在冷却结束后**仍然在同一首歌**时再提交一次取词 —— schedule 只发生在换歌。
 * 结果：取词那一次恰好撞上网络抖动/503 的歌，整首播放期间 metadata 里没有 lyricInfo，
 * 灵动岛整首留白；而预取成功或 WebView 推过词的歌正常显示。
 *
 * 修复契约：网络类临时失败（NETWORK / 异常）且这一首仍是当前曲、原生缓存仍未拿到时，
 * 允许有限次数的慢速重试（间隔 ≥90s 冷却，封顶 2 次）；服务端明确结论（NOT_FOUND）
 * 与限流结论（RATE_LIMITED，对方要求别打了）不自动重试。
 */
public class LyricFetchRetryPolicyTest {

    @Test public void aTransientNetworkFailureGetsABoundedSlowRetry() {
        LyricFetchRetryPolicy.Decision first =
            LyricFetchRetryPolicy.decide("NETWORK", 0);
        assertTrue(first.retry);
        assertEquals(20_000L, first.delayMs);
        assertTrue(LyricFetchRetryPolicy.decide("NETWORK", 1).retry);
    }

    @Test public void anInProcessExceptionIsAlsoTransient() {
        assertTrue(LyricFetchRetryPolicy.decide("EXCEPTION", 0).retry);
    }

    @Test public void retriesStopAtTheCeilingInsteadOfPollingForever() {
        assertFalse(LyricFetchRetryPolicy.decide("NETWORK", 2).retry);
        assertFalse(LyricFetchRetryPolicy.decide("EXCEPTION", 5).retry);
    }

    @Test public void aDefinitiveNoLyricAnswerIsNeverRetried() {
        assertFalse(LyricFetchRetryPolicy.decide("NOT_FOUND", 0).retry);
    }

    @Test public void aRateLimitedAnswerHonorsTheServerInsteadOfHammering() {
        // 对方刚限过流：尊重结论等冷却，不自动重打。
        assertFalse(LyricFetchRetryPolicy.decide("RATE_LIMITED", 0).retry);
        assertFalse(LyricFetchRetryPolicy.decide("NO_IDENTITY", 1).retry);
    }

    @Test public void successfulOutcomesNeedNoRetry() {
        assertFalse(LyricFetchRetryPolicy.decide("FETCHED", 0).retry);
        assertFalse(LyricFetchRetryPolicy.decide("CACHE_HIT", 0).retry);
    }

    @Test public void retryDelaysStayWithinOneTypicalTrack() {
        // 间隔本身与 90s 失败冷却解耦：调度补问时会清掉本次失败记下的冷却。
        long[] delays = LyricFetchRetryPolicy.RETRY_DELAYS_MS;
        for (int attempt = 0; attempt < delays.length; attempt++) {
            LyricFetchRetryPolicy.Decision decision =
                LyricFetchRetryPolicy.decide("NETWORK", attempt);
            assertTrue(decision.retry);
            assertEquals(delays[attempt], decision.delayMs);
        }
    }
}
