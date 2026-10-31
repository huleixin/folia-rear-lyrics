package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearTakeoverPolicy.java
/**
 * 锁屏时「系统背屏桌面（AOD）把歌词窗口顶掉」之后的重建节流。
 *
 * <p>REAREye 的 SubScreenBackHomeWhitelistModule 给出了这条接管链路的源码证据：
 * 背屏中心（com.xiaomi.subscreencenter）在 reason="aod" 时把自己
 * （SubScreenLauncher，日志串 "Start SubScreen Home reason " /
 * "getHomeToFrontOptions from Aod or turning off"）拉到背屏 Display。它发生在
 * **背屏中心自己的进程里**，系统 server 只能看到下游（startActivity / moveRootTaskToDisplay）。
 *
 * <p>LSP 模式在系统 server 侧拦截（RearHomeGuard），Shizuku 模式没有这个能力，只能
 * 「被顶掉之后再把自己的任务拉回前台」。两条路都需要一个节流器，否则就是每 2 秒一次的
 * 抢前台循环——那正是用户看到的闪烁与状态错乱。
 *
 * <p>规则：每个锁屏周期最多重夺 {@link #MAX_ATTEMPTS_PER_LOCK} 次、间隔不小于
 * {@link #MIN_GAP_MS}；用完即停并标记 {@code exhausted}，留给诊断一个确定的结论：
 * 「系统在锁屏后反复夺屏，本模式无法阻止」——而不是无限对抢。
 *
 * <p>纯逻辑，不碰 Android API，可在 JVM 上直接断言。
 */
final class RearTakeoverPolicy {

    static final int MAX_ATTEMPTS_PER_LOCK = 3;
    static final long MIN_GAP_MS = 20_000;
    /** HyperOS 的背屏中心：锁屏 AOD 时由它把自己的背屏桌面拉到 Display 1。 */
    static final String REAR_CENTRE_PACKAGE = "com.xiaomi.subscreencenter";

    enum Decision { NONE, RECOVER }

    private boolean exhausted;
    private int attempts;
    private long lastAttemptAt;

    /** 解锁或用户重新开启歌词：新周期，额度重置。 */
    void reset() { exhausted = false; attempts = 0; lastAttemptAt = 0; }

    /**
     * @param wanted        用户要歌词（开关开启、播放中或手动开启）
     * @param locked        主屏处于锁定/熄灭状态
     * @param systemCovered 背屏当前前台任务确实是系统背屏中心（不是我们的窗口）
     * @param camera        相机占用背屏
     * @param closing       关闭流程进行中
     */
    Decision evaluate(boolean wanted, boolean locked, boolean systemCovered,
                      boolean camera, boolean closing, long now) {
        if (!wanted || !locked || !systemCovered || camera || closing) return Decision.NONE;
        if (exhausted) return Decision.NONE;
        if (attempts >= MAX_ATTEMPTS_PER_LOCK) { exhausted = true; return Decision.NONE; }
        if (lastAttemptAt != 0 && now - lastAttemptAt < MIN_GAP_MS) return Decision.NONE;
        attempts++; lastAttemptAt = now;
        return Decision.RECOVER;
    }

    /** 重夺成功（我们的窗口重新成为背屏前台）：本轮额度不再消耗。 */
    void onRecovered() { lastAttemptAt = 0; }

    int attempts() { return attempts; }
    boolean exhausted() { return exhausted; }

    @Override public String toString() {
        return "attempts=" + attempts + "/" + MAX_ATTEMPTS_PER_LOCK + ", exhausted=" + exhausted;
    }
}
