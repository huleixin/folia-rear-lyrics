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
 * <h3>v1.3.59 的缺陷</h3>
 * {@code onRecovered()} 只把 {@code lastAttemptAt} 清零，{@code attempts} 却从不归还：
 * 一次长锁屏里只要发生 3 次「被顶掉 → 我们成功夺回」，第 4 次被顶掉时额度已被历史成功
 * 耗尽，{@code exhausted} 永久置位，整场锁屏再也不重夺。表现就是「前几首正常、连播几首
 * 之后背屏就停在系统桌面不动了」。成功与失败必须分开记账。
 *
 * <h3>现在的规则</h3>
 * <ul>
 *   <li>{@code consecutiveFailures}：连续无效的重夺次数，达 {@link #MAX_CONSECUTIVE_FAILURES}
 *       才停。**稳定恢复后归还**（{@link #STABLE_MS} 内我们的窗口一直在最前才算稳定，
 *       只是闪一下不算）；</li>
 *   <li>{@code attempts}：本锁屏周期的**总量**安全上限 {@link #MAX_ATTEMPTS_PER_LOCK}，
 *       无论成功失败都计数，到顶即停 —— 成功再多也不能无限抢占背屏；</li>
 *   <li>{@link #MIN_GAP_MS} 冷却不变：两次尝试之间至少 20 秒，避免抢前台闪烁；</li>
 *   <li>任一条到顶都置 {@code exhausted} 并留下确定结论，不再对抢。</li>
 * </ul>
 *
 * <p>纯逻辑，不碰 Android API，可在 JVM 上直接断言。
 */
final class RearTakeoverPolicy {

    /**
     * 本锁屏周期允许的重夺总次数。
     *
     * <p>v1.3.59 是 3 次且被「成功」消耗 —— 那是把总量和连续失败混成一个计数器。现在总量
     * 放宽到 12，但连续失败仍然是 3，因此「系统反复夺屏且我们抢不回来」依旧很快停下；
     * 只有「抢得回来但系统后来又夺」这种正常抖动才允许继续。
     */
    static final int MAX_ATTEMPTS_PER_LOCK = 12;
    /** 连续无效的重夺上限：抢回来立刻又被顶掉，连续 3 次就判定本模式抢不过。 */
    static final int MAX_CONSECUTIVE_FAILURES = 3;
    static final long MIN_GAP_MS = 20_000;
    /** 恢复后需要稳定这么久才算「成功」，避免把一次闪回当成成功而无限续命。 */
    static final long STABLE_MS = 8_000;

    /** HyperOS 的背屏中心：锁屏 AOD 时由它把自己的背屏桌面拉到 Display 1。 */
    static final String REAR_CENTRE_PACKAGE = "com.xiaomi.subscreencenter";

    enum Decision { NONE, RECOVER }

    private boolean exhausted;
    private int attempts;
    private int consecutiveFailures;
    private long lastAttemptAt;
    /** 是否已经在本周期尝试过；用布尔量而不是 lastAttemptAt != 0 作哨兵，避免时刻 0 被误判。 */
    private boolean attempted;
    private boolean pendingAttempt;
    private long ownFrontSince;

    /** 解锁或用户重新开启歌词：新周期，额度重置。 */
    synchronized void reset() {
        exhausted = false; attempts = 0; consecutiveFailures = 0;
        lastAttemptAt = 0; attempted = false; pendingAttempt = false; ownFrontSince = 0;
    }

    /**
     * 观测「背屏现在最前的是不是我们」。每次任务列表探测都会调用，与是否要重夺无关。
     *
     * <p>稳定恢复（连续 {@link #STABLE_MS} 都在最前）会把连续失败额度归还 —— 这是本版
     * 最重要的一行：成功不该占用失败额度。
     */
    synchronized void observe(boolean oursInFront, long now) {
        if (!oursInFront) { ownFrontSince = 0; return; }
        if (ownFrontSince == 0) ownFrontSince = now;
        if (now - ownFrontSince >= STABLE_MS) {
            // 稳定恢复：这次重夺是成功的，连续失败额度归还，且它不再可能被判为失败。
            consecutiveFailures = 0;
            pendingAttempt = false;
        }
    }

    /**
     * @param wanted        用户要歌词（开关开启、播放中或手动开启）
     * @param locked        主屏处于锁定/熄灭状态
     * @param systemCovered 背屏当前前台任务确实是系统背屏中心（不是我们的窗口）
     * @param camera        相机占用背屏
     * @param closing       关闭流程进行中
     */
    synchronized Decision evaluate(boolean wanted, boolean locked, boolean systemCovered,
                                   boolean camera, boolean closing, long now) {
        if (!wanted || !locked || camera || closing) return Decision.NONE;
        observe(!systemCovered, now);
        settle(now, systemCovered);
        if (!systemCovered) return Decision.NONE;
        if (exhausted) return Decision.NONE;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) { exhausted = true; return Decision.NONE; }
        if (attempts >= MAX_ATTEMPTS_PER_LOCK) { exhausted = true; return Decision.NONE; }
        if (attempted && now - lastAttemptAt < MIN_GAP_MS) return Decision.NONE;
        attempts++; lastAttemptAt = now; attempted = true; pendingAttempt = true;
        return Decision.RECOVER;
    }

    /**
     * 结算上一次尝试：过了 {@link #STABLE_MS} 仍被系统占着，就是一次无效重夺。
     * 反过来说，只要这期间我们回到了最前，就由 {@link #observe} 的稳定性判定负责清零。
     */
    private void settle(long now, boolean systemCovered) {
        if (!pendingAttempt) return;
        if (now - lastAttemptAt < STABLE_MS) return;
        pendingAttempt = false;
        if (systemCovered) consecutiveFailures++;
    }

    synchronized int attempts() { return attempts; }
    synchronized int consecutiveFailures() { return consecutiveFailures; }
    synchronized boolean exhausted() { return exhausted; }
    /** 本周期是否已经不允许再重夺（额度耗尽或连续无效）。 */
    synchronized boolean blocked() { return exhausted; }

    @Override public synchronized String toString() {
        return "attempts=" + attempts + "/" + MAX_ATTEMPTS_PER_LOCK
            + ", consecutiveFailures=" + consecutiveFailures + "/" + MAX_CONSECUTIVE_FAILURES
            + ", exhausted=" + exhausted;
    }
}
