package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/SessionClockHeartbeat.java
/**
 * 播放中要不要再刷一次 {@code MediaSession.setPlaybackState}（纯决策）。
 *
 * <h3>为什么要它</h3>
 * 修复前，后台连续播放期间**没有任何东西**刷新 PlaybackState：
 * {@code MediaSession} 只在换歌、暂停、seek、以及 WebView 推来状态时才写一次，
 * 而锁屏/后台时 WebView 是冻结的。于是会话里那个 {@code PlaybackState} 的时间戳
 * 会停在几分钟前。
 *
 * <p>SystemUI / 灵动岛消费端自己不会轮询播放器，它们读的是「会话里最后一个
 * PlaybackState」并用 {@code position + speed × (now − updateTime)} 外推。
 * 一旦有消费端在这个空档里**重新订阅**（SystemUI 重启、亮屏重建、通知栏重挂、
 * 蓝牙/车载端连接），它拿到的就是一个陈旧的时间戳，外推出的位置直接越过整首歌的
 * 时长 —— 表现正是「连续播几首后灵动岛歌词不再推进 / 直接消失」，
 * 而且只有再切一首歌才会恢复。
 *
 * <p>所以规则很简单：<b>播放中至少每 {@value #INTERVAL_MS} ms 刷一次</b>；
 * 暂停时不需要（那一次的暂停发布已经把状态定住了）；会话不活跃时不刷（刷了也没人听）。
 *
 * <p>刷新只写 PlaybackState —— 不重建 metadata、不动通知、不写诊断、不碰封面。
 */
public final class SessionClockHeartbeat {

    /** 播放中两次 PlaybackState 之间的最大间隔。1 s 是所有音乐应用的通行做法，也是外推误差的上界。 */
    public static final long INTERVAL_MS = 1_000L;

    private SessionClockHeartbeat() {
    }

    /**
     * @param sessionActive MediaSession 是否还活着
     * @param playing       是否真的在播（暂停时位置不会自己走，不需要心跳）
     * @param nowElapsed    {@code SystemClock.elapsedRealtime()}
     * @param lastPublishedElapsed 上一次 setPlaybackState 的时刻；0 = 还没发过
     */
    public static boolean shouldPublish(boolean sessionActive, boolean playing,
                                        long nowElapsed, long lastPublishedElapsed) {
        if (!sessionActive || !playing) return false;
        if (lastPublishedElapsed <= 0L) return true;
        return nowElapsed - lastPublishedElapsed >= INTERVAL_MS;
    }
}
