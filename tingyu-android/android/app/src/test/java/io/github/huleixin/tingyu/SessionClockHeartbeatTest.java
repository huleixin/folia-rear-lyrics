package io.github.huleixin.tingyu;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

// android/app/src/test/java/io/github/huleixin/tingyu/SessionClockHeartbeatTest.java
/**
 * 后台播放期间 PlaybackState 刷新判定的行为回归。
 *
 * <p>这个判定存在的理由：消费端（灵动岛 / SystemUI / 蓝牙车载）读的是「会话里最后一个
 * PlaybackState」，用 {@code position + speed × (now − updateTime)} 外推。修复前后台播放时
 * 没有任何东西刷新它，时间戳会停在几分钟前，任何重新订阅的消费端都会外推出一个越过
 * 整首歌时长的位置 —— 表现是「连续播几首后灵动岛歌词不推进 / 消失」。
 */
public class SessionClockHeartbeatTest {

    @Test
    public void neverPublishedPublishesImmediately() {
        assertTrue(SessionClockHeartbeat.shouldPublish(true, true, 10_000L, 0L));
    }

    @Test
    public void publishesOncePerIntervalWhilePlaying() {
        assertFalse(SessionClockHeartbeat.shouldPublish(true, true, 10_400L, 10_000L));
        assertTrue(SessionClockHeartbeat.shouldPublish(true, true, 11_000L, 10_000L));
        assertTrue(SessionClockHeartbeat.shouldPublish(true, true, 60_000L, 10_000L));
    }

    @Test
    public void pausedDoesNotNeedAHeartbeat() {
        // 暂停时位置不会自己走：那一次的暂停发布已经把状态定住了，再刷是纯粹的开销。
        assertFalse(SessionClockHeartbeat.shouldPublish(true, false, 60_000L, 10_000L));
    }

    @Test
    public void inactiveSessionIsNotPublished() {
        assertFalse(SessionClockHeartbeat.shouldPublish(false, true, 60_000L, 10_000L));
    }

    @Test
    public void intervalBoundsTheExtrapolationError() {
        // 外推误差的上界就是刷新间隔：必须比「一首歌」小几个数量级。
        assertTrue(SessionClockHeartbeat.INTERVAL_MS <= 1_000L);
        assertTrue(SessionClockHeartbeat.INTERVAL_MS > 0L);
    }
}
