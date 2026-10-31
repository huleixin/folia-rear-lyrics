package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 取词预算：超时或被判定失效就必须停，绝不把线程拴在一首没人要的歌上。 */
public class LyricFetchBudgetTest {

    @Test public void expiresAfterItsBudget() {
        LyricFetchBudget budget = LyricFetchBudget.start(1_000L, 5_000L);
        assertFalse(budget.expired(1_000L));
        assertFalse(budget.expired(5_999L));
        assertTrue(budget.expired(6_000L));
        assertEquals(0L, budget.remaining(9_000L));
    }

    @Test public void defaultBudgetIsShorterThanAShortSong() {
        // 比一首 1 分钟的歌短：这样即使每首都最坏情况，队列也不会落后到「一整首都没词」。
        assertTrue(LyricFetchBudget.DEFAULT_MS < 60_000L);
        assertTrue("但要长于单条 HTTP callTimeout(14s)", LyricFetchBudget.DEFAULT_MS > 14_000L);
    }

    @Test public void aSongNobodyWantsAnymoreStopsImmediately() {
        LyricFetchBudget budget = LyricFetchBudget.start(0L, 5_000L);
        assertFalse("即使还有预算，队列走过去了就该放弃", budget.allows(10L, false));
        assertTrue(budget.allows(10L, true));
    }

    @Test public void elapsedIsClampedAtZero() {
        LyricFetchBudget budget = LyricFetchBudget.start(5_000L, 1_000L);
        assertEquals(0L, budget.elapsed(1_000L));
        assertFalse(budget.expired(1_000L));
    }
}
