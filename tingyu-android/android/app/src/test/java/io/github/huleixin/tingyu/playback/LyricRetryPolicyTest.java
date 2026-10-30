package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 后台自动换歌时「这一首还没词」的重问边界。
 *
 * 现场的失败方式：原生只问一次，JS 那一次没答上（监听器在重挂 / 词要联网取），
 * 于是整首空着，直到用户打开 App。重问必须存在，但必须有界、必须跟着当前曲走。
 */
public class LyricRetryPolicyTest {

    @Test public void asksAgainOnlyWhileTheSameTrackIsStillPending() {
        assertTrue(LyricRetryPolicy.shouldAsk("online:tx:2", "online:tx:2", "pending", 0));
        // 已经有人补上了：不必再问。
        assertFalse(LyricRetryPolicy.shouldAsk("online:tx:2", "online:tx:2", "ready", 0));
        // 确认没有词：再问也是同一个答案。
        assertFalse(LyricRetryPolicy.shouldAsk("online:tx:2", "online:tx:2", "none", 0));
        // 已经切到下一首：上一首的重问必须作废，否则会覆盖当前曲的身份。
        assertFalse(LyricRetryPolicy.shouldAsk("online:tx:2", "online:tx:3", "pending", 0));
        assertFalse(LyricRetryPolicy.shouldAsk("", "online:tx:3", "pending", 0));
    }

    @Test public void theRetryBudgetIsBounded() {
        int allowed = 0;
        for (int attempt = 0; attempt < 10; attempt++) {
            if (LyricRetryPolicy.shouldAsk("k", "k", "pending", attempt)) allowed++;
        }
        assertEquals(LyricRetryPolicy.RETRY_DELAYS_MS.length, allowed);
        assertEquals(3, LyricRetryPolicy.maxAsks());
        assertEquals(3_000L, LyricRetryPolicy.delayFor(0));
        assertEquals(9_000L, LyricRetryPolicy.delayFor(1));
        assertEquals(-1L, LyricRetryPolicy.delayFor(2));
    }

    @Test public void everyAskHasItsOwnDelay() {
        for (int attempt = 0; attempt < LyricRetryPolicy.RETRY_DELAYS_MS.length; attempt++) {
            assertTrue(LyricRetryPolicy.delayFor(attempt) > 0L);
        }
    }
}
