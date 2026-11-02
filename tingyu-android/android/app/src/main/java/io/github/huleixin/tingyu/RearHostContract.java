package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostContract.java
/**
 * 听屿 ↔ 背屏中心宿主进程的私有协议。
 *
 * <p>v2（1.3.96）把宿主从「系统音乐卡片」搬到「背屏中心 launcher 窗口」，因此 SHOW 需要
 * 携带目标背屏显示 id，宿主也要能上报 created / launch / released 三种诊断事件。协议号与
 * descriptor 一起升到 v2：更新 APK 后如果背屏中心进程里还驻留着旧模块，握手会被拒绝，
 * 应用侧按「宿主不可用」回退独立窗口，而不是把 v1 的语义当成 v2 使用。
 */
public final class RearHostContract {
    public static final String TARGET = "com.xiaomi.subscreencenter";
    public static final String APP = BuildConfig.APPLICATION_ID;
    public static final String AUTHORITY = APP + ".rearhost";
    public static final String REQUEST = APP + ".rearhost.CONNECT";
    /**
     * 有序广播探针：背屏中心进程里的模块用 {@code setResultData} 回答
     * {@code build/process/stage/error}。它不经过 ContentProvider，不受包可见性影响，
     * 是「模块到底有没有跑在这个进程里」的独立证据。
     */
    public static final String PING = APP + ".rearhost.PING";
    public static final String DESCRIPTOR = APP + ".rearhost.v2";
    public static final int VERSION = 2, SHOW = 1, HIDE = 2, SUSPEND = 3, PROBE = 4;
    /** 宿主允许上报的事件；ready 是唯一会把应用侧会话标记为「已接管」的事件。 */
    private static final String[] EVENTS = {"native-card-probe", "web-stage", "show-received", "attaching", "blocked", "waiting-launcher", "launcher", "page-ready", "drawn", "created", "launch", "ready", "paused", "failed", "user-exit", "released"};

    public static boolean knownEvent(String value) {
        if (value == null) return false;
        for (String event : EVENTS) if (event.equals(value)) return true;
        return false;
    }

    private RearHostContract() {}
}
