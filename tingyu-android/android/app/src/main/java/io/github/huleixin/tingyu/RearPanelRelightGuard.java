package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearPanelRelightGuard.java
/**
 * Shizuku 侧「背屏点亮是否会误亮主屏」的安全阀（纯逻辑，可 JVM 单测）。
 *
 * <p>背景：shell 侧唯一有效的点亮手段是向背屏发送唤醒事件（KEYCODE_WAKEUP），而有的 ROM
 * 把它当成<b>整机</b>唤醒 —— 主屏也跟着亮。v1.3.59 的判定是
 * 「点亮前主屏不是 ON、点亮后是 ON」就锁存 {@code relightWakesMain}，有两个缺陷：
 *
 * <ol>
 *   <li><b>归因不区分「用户解锁」</b>：验证窗口内用户自己按了指纹/电源键，主屏当然会亮，
 *       却被算成我们的错 —— 整个会话从此不再点亮背屏，用户看到的是「歌词突然再也不亮」；</li>
 *   <li><b>锁存永不解除</b>：{@code relightWakesMain} 是 Coordinator 的实例字段，解锁、
 *       重新锁屏、重新开歌词都不会清。一次误判 = 本次进程终身失效。</li>
 * </ol>
 *
 * <p>现在拆成两级，且归因必须包含「仍然锁屏」这一个必要条件：
 * <ul>
 *   <li>{@code sessionLatched} —— <b>本锁屏周期</b>内确认误亮：本周期的点亮立即停手，
 *       解锁即清（新周期重新观察）；</li>
 *   <li>{@code disabled} —— 跨周期累计确认 {@link #MAX_CONFIRMED_MAIN_WAKES} 次：
 *       说明这个 ROM 确实把唤醒事件当整机唤醒，本次进程不再尝试，并留诊断。</li>
 * </ul>
 *
 * <p>另外一条与「误亮主屏」直接相关、但 v1.3.59 完全没有的规则：<b>主屏已经亮着时不去点亮
 * 背屏</b>。KEYCODE_WAKEUP 在部分 ROM 上同时是「用户活动」，会在主屏已亮时继续续命主屏
 * —— 那正是「用功耗换表面稳定」，必须避免。
 */
final class RearPanelRelightGuard {

    /** 跨锁屏周期累计确认几次「点亮背屏也点亮了主屏」后彻底停用。 */
    static final int MAX_CONFIRMED_MAIN_WAKES = 2;

    enum Verdict {
        /** 允许点亮。 */
        RELIGHT,
        /** 主屏亮着：不去动电源（避免把用户活动续在主屏上）。 */
        SKIP_MAIN_ON,
        /** 本锁屏周期已确认误亮主屏：停手，解锁后重新观察。 */
        STOP_SESSION,
        /** 跨周期累计确认：本次进程不再尝试点亮。 */
        STOP_DISABLED
    }

    enum Attribution {
        /** 主屏状态没变，或本来就亮着：与本次点亮无关。 */
        NONE,
        /** 主屏亮了，但锁屏已解除 —— 是用户解锁，不是我们。 */
        USER_UNLOCK,
        /** 主屏原本熄灭、点亮后亮起且仍锁屏：归因于本次唤醒。 */
        OURS,
        /** 同上，且已达到跨周期上限，本次进程停止点亮。 */
        OURS_FINAL
    }

    private boolean sessionLatched;
    private int confirmedMainWakes;
    private boolean disabled;
    private String lastReason = "not consulted";

    /** 新的锁屏周期（或重新开启歌词）：清会话锁存，跨周期结论保留。 */
    synchronized void onLock() {
        sessionLatched = false;
        lastReason = disabled ? "locked-but-disabled" : "locked";
    }

    /** 解锁：本周期结束。跨周期结论保留 —— 那个 ROM 的行为不会因为解锁而改变。 */
    synchronized void onUnlock() {
        sessionLatched = false;
        lastReason = "unlocked";
    }

    synchronized Verdict verdict(boolean mainDisplayOn) {
        if (disabled) { lastReason = "disabled-after-" + confirmedMainWakes + "-main-wakes"; return Verdict.STOP_DISABLED; }
        if (sessionLatched) { lastReason = "session-latched"; return Verdict.STOP_SESSION; }
        if (mainDisplayOn) { lastReason = "main-on"; return Verdict.SKIP_MAIN_ON; }
        lastReason = "relight";
        return Verdict.RELIGHT;
    }

    /**
     * 验证点亮结果时的归因。
     *
     * @param mainWasOn       点亮前主屏是否已经是 ON
     * @param mainNowOn       验证时主屏是否 ON
     * @param keyguardLocked  验证时是否仍然锁屏（用户解锁的必要条件，必须取验证时刻的值）
     */
    synchronized Attribution attribute(boolean mainWasOn, boolean mainNowOn, boolean keyguardLocked) {
        if (mainWasOn || !mainNowOn) { lastReason = "main-unchanged"; return Attribution.NONE; }
        if (!keyguardLocked) {
            // 锁屏已经解除：主屏是被用户点亮的，不能算在我们头上。
            lastReason = "main-on-by-user-unlock";
            return Attribution.USER_UNLOCK;
        }
        confirmedMainWakes++;
        sessionLatched = true;
        if (confirmedMainWakes >= MAX_CONFIRMED_MAIN_WAKES) {
            disabled = true;
            lastReason = "main-woken-by-relight-final";
            return Attribution.OURS_FINAL;
        }
        lastReason = "main-woken-by-relight";
        return Attribution.OURS;
    }

    synchronized boolean disabled() { return disabled; }
    synchronized int confirmedMainWakes() { return confirmedMainWakes; }
    synchronized String describe() {
        return "relightGuard={sessionLatched=" + sessionLatched
            + ", confirmedMainWakes=" + confirmedMainWakes + "/" + MAX_CONFIRMED_MAIN_WAKES
            + ", disabled=" + disabled + ", last=" + lastReason + "}";
    }
}
