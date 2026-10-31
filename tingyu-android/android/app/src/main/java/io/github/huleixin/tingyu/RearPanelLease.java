package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearPanelLease.java
/**
 * Shizuku 后端锁屏期的「背屏显示租约」：锁屏期间由本进程负责把被 HyperOS 压灭的背屏面板
 * 重新点亮，直到解锁 / 暂停 / 关闭歌词 / 相机接管 / 合盖 / Shizuku 断开为止。
 *
 * <p><b>为什么不能靠设置。</b>{@code settings system subscreen_display_time} 只控制解锁态
 * 「最后一次触摸之后保持多久」（mi-back-screen 的 XiaomiLitTime 与 bright 的文档都是这个
 * 语义），锁屏瞬间的熄屏走的是 PowerManagerService 的 wakefulness → 显示组休眠 →
 * 副屏 DisplayPowerController，与这个键无关。真机把该键写成 2147483647 后锁屏仍然熄屏，
 * 已经证实这条路径无效，因此本版本不再写这个全局设置，只在锁屏时读一次做对照证据。
 *
 * <p><b>为什么只能点亮、不能阻止。</b>副屏的电源策略是 system_server 里
 * {@code DisplayPowerController} 的内部状态（LSP 模块正是 hook 它把 policy 改成
 * POLICY_BRIGHT）。shell 只有 {@code input}、{@code am}、{@code cmd settings} 这些接口，
 * 没有任何一条能改写那个 policy；能做的只有「点亮」——
 * {@code input -d <id> keyevent KEYCODE_WAKEUP}，一次约点亮 16 秒（bright 与
 * mi-back-screen 在真机上测到的同一行为）。
 *
 * <p><b>所以这是「观测 → 有界恢复」，不是「阻止熄屏」。</b>只有真的观测到面板不是 ON
 * 才发一次点亮并回读确认；失败按 3s→8s→20s→45s→60s 退避；连续 6 次点亮都无效即停，
 * 并留下 {@code relight-ineffective}（说明这版固件连点亮都拒绝，必须走 LSP）。没有
 * 定时轮询式高频唤醒，也不会「无限循环点亮」：每一次点亮之前都必须先有一次真实的
 * 熄屏观测，一次成功点亮之后要等下一次熄屏观测才会再动手。
 *
 * <p>与 v1.3.57 的差别（真机无效的直接原因）：旧 {@code RearPanelReassert} 每个锁屏
 * 周期只给 12 次、且 1.5 秒就重试一次，两分钟就耗尽后永久放弃；旧
 * {@code RearLockWakeBudget} 只给 3 次。一次点亮只够 16 秒，于是「锁屏几分钟后背屏就
 * 再也不亮」。这里改的是**总量**：整个锁屏周期内只要还在播放就一直有租约（上限 90 分钟
 * 仅作安全阀），但每一次动作都必须有新的熄屏证据，速率因此天然被面板本身的 16 秒节律
 * 限制住。
 *
 * <p>纯逻辑，不碰 Shizuku、不碰 DisplayManager，可在 JVM 上直接断言。
 */
final class RearPanelLease {

    /** 两次点亮之间的最小间隔：一次点亮已经够 16 秒，再密只是白耗电。 */
    static final long BASE_GAP_MS = 3_000;
    /** 点亮后回读面板状态的等待时间，用来判定这次点亮到底有没有生效。 */
    static final long VERIFY_MS = 1_200;
    /** 安全阀：单个锁屏周期最多维护 90 分钟，之后交还系统（播放停止本来就会提前结束）。 */
    static final long MAX_SESSION_MS = 90L * 60_000;
    /** 连续这么多次点亮都无法把面板点亮，就认定这版固件拒绝 shell 点亮，停止重试。 */
    static final int MAX_CONSECUTIVE_FAILURES = 6;
    /** 连续失败后的退避序列；越失败越慢，避免把「点不亮」变成唤醒风暴。 */
    private static final long[] BACKOFF_MS = { 3_000, 8_000, 20_000, 45_000, 60_000 };

    enum Action { NONE, RELIGHT }

    private boolean active;
    private boolean awaiting;
    private long startedAt, lastAttemptAt, nextAttemptAt;
    private int relights, recoveries, failures, consecutive;
    private String stopped = "";
    /**
     * 最近一次「没有点亮」的原因。
     *
     * <p>没有这一项时，Shizuku 锁屏不亮的现场只剩一个 {@code relights=0}，无法区分
     * 「没有窗口」「面板本来就是亮的」「被相机挡住」「还在退避」。真机判读全靠它。
     */
    private String lastSkip = "none";

    /** 锁屏周期开始（SCREEN_OFF 且歌词活动、正在播放）。重复调用不重置本次周期。 */
    void begin(long now) {
        if (active) return;
        active = true; awaiting = false; stopped = "";
        consecutive = 0; startedAt = now; lastAttemptAt = 0; nextAttemptAt = 0;
    }

    /** 解锁 / 暂停 / 关闭 / 相机 / 合盖 / Shizuku 断开：立刻交还系统，不再点亮。 */
    void end() {
        active = false; awaiting = false; stopped = "";
        consecutive = 0; lastAttemptAt = 0; nextAttemptAt = 0;
    }

    boolean active() { return active; }
    /** 一次点亮正在等待回读；这期间不再叠加第二次。 */
    boolean awaiting() { return awaiting; }

    /**
     * 一次观测。
     *
     * @param guarding       租约条件成立（歌词活动 + 播放中 + 用户开启 + 无相机 + 非合盖）
     * @param panelOn        背屏面板当前观测为 STATE_ON
     * @param windowAttached 歌词窗口仍然挂在这块背屏上（Activity 被系统 stop、visible=false
     *                       不算丢失 —— 那正是面板熄灭的结果，不是原因）
     */
    Action observe(boolean guarding, boolean panelOn, boolean windowAttached, long now) {
        if (!active) { lastSkip = "no-lease"; return Action.NONE; }
        if (!guarding) { lastSkip = "guarding-off"; end(); return Action.NONE; }
        if (panelOn) {
            lastSkip = "panel-on";
            // 面板亮着：上一次点亮（如果有）已经生效，清零失败计数。
            if (awaiting) { awaiting = false; recoveries++; }
            consecutive = 0; nextAttemptAt = 0;
            return Action.NONE;
        }
        // 没有我们的窗口在背屏上，点亮只会照亮 OEM 背屏桌面 —— 这条约束保留，
        // 但必须留下原因：真机上「窗口已被销毁」与「窗口状态读不到」是两种不同的故障。
        if (!windowAttached) { lastSkip = "no-window"; return Action.NONE; }
        if (!stopped.isEmpty()) { lastSkip = stopped; return Action.NONE; }
        if (now - startedAt > MAX_SESSION_MS) { stopped = "session-cap"; lastSkip = stopped; return Action.NONE; }
        if (awaiting && now - lastAttemptAt < VERIFY_MS) { lastSkip = "verify-wait"; return Action.NONE; }
        if (awaiting) {
            // 回读到仍然熄灭：这一次算失败，按退避重排。
            awaiting = false;
            registerFailure(now);
        }
        if (now < nextAttemptAt) { lastSkip = "backoff"; return Action.NONE; }
        awaiting = true; lastAttemptAt = now; relights++; lastSkip = "relight";
        return Action.RELIGHT;
    }

    /** 点亮后 {@link #VERIFY_MS} 的回读结果；成功会把失败计数清零。 */
    void onResult(boolean recovered, long now) {
        if (!awaiting) return;
        awaiting = false;
        if (recovered) { recoveries++; consecutive = 0; nextAttemptAt = 0; lastSkip = "relight-ok"; return; }
        registerFailure(now);
    }

    private void registerFailure(long now) {
        failures++; consecutive++;
        if (consecutive >= MAX_CONSECUTIVE_FAILURES) { stopped = "relight-ineffective"; return; }
        nextAttemptAt = now + backoff(consecutive);
    }

    static long backoff(int consecutiveFailures) {
        if (consecutiveFailures <= 0) return BASE_GAP_MS;
        return BACKOFF_MS[Math.min(BACKOFF_MS.length, consecutiveFailures) - 1];
    }

    int relights() { return relights; }
    int recoveries() { return recoveries; }
    int failures() { return failures; }
    /** 本周期为什么停了：空串表示仍在维护，{@code relight-ineffective} / {@code session-cap} 表示已交还系统。 */
    String stoppedReason() { return stopped; }
    /** 最近一次没有点亮的具体原因：no-window / panel-on / backoff / verify-wait / relight-ok … */
    String lastSkip() { return lastSkip; }

    @Override public String toString() {
        return "active=" + active + ", relights=" + relights + ", recovered=" + recoveries
            + ", failed=" + failures + ", consecutiveFailures=" + consecutive
            + ", awaiting=" + awaiting + ", lastSkip=" + lastSkip
            + (stopped.isEmpty() ? "" : ", stopped=" + stopped);
    }
}
