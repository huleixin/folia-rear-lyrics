package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 「这一首现在能不能出词」的判定次序。
 *
 * <p>核心回归点：**任何一处有时间轴就是 READY**。旧实现先看原生磁盘缓存里的负记录，
 * 一旦命中就直接判「无词」，于是舞台上明明有完整时间轴的 QQ/网易云独占曲在背屏上是 0 行。
 */
public class LyricDeliveryTest {

    @Test public void bridgeTimelineWinsOverANativeNegativeRecord() {
        LyricDelivery.Decision decision = LyricDelivery.decide(true, false, false, true);
        assertEquals(LyricDelivery.State.READY, decision.state);
        assertEquals("bridge", decision.source);
    }

    @Test public void unifiedTimelineWinsOverANativeNegativeRecord() {
        LyricDelivery.Decision decision = LyricDelivery.decide(false, true, false, true);
        assertEquals(LyricDelivery.State.READY, decision.state);
        assertEquals("unified", decision.source);
    }

    @Test public void nativeTimelineIsReady() {
        assertEquals(LyricDelivery.State.READY, LyricDelivery.decide(false, false, true, false).state);
    }

    @Test public void negativeRecordOnlyCountsWhenNothingHasATimeline() {
        assertEquals(LyricDelivery.State.NONE, LyricDelivery.decide(false, false, false, true).state);
    }

    @Test public void nothingKnownIsPendingNotMissing() {
        LyricDelivery.Decision decision = LyricDelivery.decide(false, false, false, false);
        assertEquals(LyricDelivery.State.PENDING, decision.state);
        assertFalse(decision.ready());
        assertEquals("pending", decision.toString());
    }

    @Test public void bridgeWinsOverUnifiedWhenBothHaveOne() {
        // 舞台版本通常更全（逐字/翻译），诊断里要能看出这一首用的是哪一份。
        assertEquals("bridge", LyricDelivery.decide(true, true, true, true).source);
    }

    @Test public void stateOfMatchesDecide() {
        assertEquals(LyricDelivery.State.READY, LyricDelivery.stateOf(false, true, false, false));
        assertEquals(LyricDelivery.State.NONE, LyricDelivery.stateOf(false, false, false, true));
        assertTrue(LyricDelivery.decide(false, true, false, false).ready());
    }
}
