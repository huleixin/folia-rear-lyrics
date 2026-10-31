package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearKeepAwakePolicy.java
/**
 * Shizuku 后端专用的背屏常亮策略：锁屏播放期间临时接管 HyperOS 的背屏休眠超时，
 * 退出时原值恢复。纯逻辑，不碰 Shizuku、不碰 Settings 进程，方便在 JVM 上直接断言。
 *
 * <p>故障机理（与 MRSS / RongShangs bright 的分析一致）：主屏锁定后 HyperOS 按
 * {@code settings system subscreen_display_time}（默认 10000ms）把背屏面板熄灭，
 * 此窗口还挂在背屏上（probeLock 的 "panel-off" 判定）。旧实现只靠
 * {@link RearLockWakeBudget} 的三次 {@code input keyevent KEYCODE_WAKEUP} 补救，
 * 预算用完背屏照样熄灭。这里改在策略层解决：歌词活动且正在播放时把超时写成
 * 2147483647，停止播放/关闭背屏/相机接管/Shizuku 断开时写回原值 —— 事件驱动，
 * 没有轮询，没有高频唤醒，也不动主屏（该设置只作用于背屏）。
 *
 * <p>恢复保证：写 MAX 前必须先读到原值；进程在持有期间死亡时把「待恢复」标记落盘，
 * 下次进程起来、shell 可用时先补恢复。绝不出现「改了全局值后忘记恢复」。
 */
final class RearKeepAwakePolicy {

    /** The rear-screen sleep timeout HyperOS reads; the main display never consults it. */
    static final String SETTING = "subscreen_display_time";
    static final String MAX_VALUE = "2147483647";
    /** bright's observed factory default; used when the original value cannot be read. */
    static final String DEFAULT_VALUE = "10000";

    enum Phase { IDLE, READING, CAPTURED, HOLDING, RELEASING }

    private Phase phase = Phase.IDLE;
    /** What {@code settings get} returned before we overwrote it; null = not captured yet. */
    private String savedValue;
    private boolean readCaptured;
    /** True once we wrote MAX (the only state that owes the world a restore). */
    private boolean appliedMax;
    /** True when the process died/reconnected while holding; restore is still owed. */
    private boolean restoreOwed;

    /** The action the coordinator should take next, from an event-driven sync. */
    enum Action { NONE, READ_THEN_APPLY, WRITE_MAX, WRITE_RESTORE, MARK_RESTORE_OWED }

    /**
     * One decision per sync. {@code shellUsable} is false on disconnect and while the binder
     * is re-binding; the policy then keeps the restore debt instead of pretending it is done.
     */
    Action sync(boolean shizukuBackend, boolean shellUsable, boolean wanted, boolean playing,
                boolean cameraOwned, boolean closing, boolean coverSleeping) {
        boolean holdDesired = shizukuBackend && shellUsable && wanted && playing
            && !cameraOwned && !closing && !coverSleeping;
        switch (phase) {
            case IDLE:
                if (restoreOwed && shellUsable) { phase = Phase.RELEASING; return Action.WRITE_RESTORE; }
                if (!holdDesired) return Action.NONE;
                phase = Phase.READING;
                return Action.READ_THEN_APPLY;
            case READING:
                if (!holdDesired) { phase = Phase.IDLE; return Action.NONE; }
                // A failed read retries (READ_THEN_APPLY again); the MAX write is only offered
                // after a real capture, so a failed read can never overwrite the timeout blind.
                return shellUsable ? Action.READ_THEN_APPLY : Action.NONE;
            case CAPTURED:
                if (!holdDesired) { phase = Phase.IDLE; return Action.NONE; }
                return shellUsable ? Action.WRITE_MAX : Action.NONE;
            case HOLDING:
                if (holdDesired) return Action.NONE;
                if (!shellUsable) { restoreOwed = true; phase = Phase.IDLE; return Action.MARK_RESTORE_OWED; }
                phase = Phase.RELEASING;
                return Action.WRITE_RESTORE;
            case RELEASING:
                if (shellUsable) return Action.WRITE_RESTORE;
                return Action.NONE; // stay in RELEASING; the next usable sync retries
        }
        return Action.NONE;
    }

    /** The {@code settings get} result arrives; store it verbatim and move to CAPTURED. */
    void onPreviousRead(String raw) {
        if (phase != Phase.READING) return;
        savedValue = sanitize(raw);
        readCaptured = true;
        phase = Phase.CAPTURED;
    }

    /** The MAX write succeeded; from here on a restore is owed no matter what happens. */
    void onMaxApplied() {
        if (phase != Phase.CAPTURED) return;
        phase = Phase.HOLDING;
        appliedMax = true;
        restoreOwed = true;
    }

    /** The restore write succeeded; the system owns the timeout again. */
    void onRestored() {
        if (phase != Phase.RELEASING) return;
        phase = Phase.IDLE;
        appliedMax = false;
        restoreOwed = false;
        savedValue = null;
        readCaptured = false;
    }

    /**
     * A previous process died while holding MAX (persisted marker). Adopt that debt: the very
     * first usable sync must write the persisted value back before any new hold starts.
     */
    void adoptOwedRestore(String persistedValue) {
        if (phase != Phase.IDLE || appliedMax) return;
        savedValue = sanitize(persistedValue);
        restoreOwed = true;
    }

    /** Value to write back; never null, never MAX (a MAX capture is replaced by the default). */
    String restoreValue() {
        String value = sanitize(savedValue);
        return MAX_VALUE.equals(value) ? DEFAULT_VALUE : value;
    }

    boolean holding() { return phase == Phase.HOLDING && appliedMax; }
    boolean restoreOwed() { return restoreOwed; }
    /** True when a READ_THEN_APPLY captured our own MAX write (a second hold episode). */
    boolean previousWasOurOwnMax() { return MAX_VALUE.equals(sanitize(savedValue)); }

    Phase phase() { return phase; }

    /** {@code settings get} returns the value or an empty string; anything unparsable is default. */
    static String sanitize(String raw) {
        if (raw == null) return DEFAULT_VALUE;
        String trimmed = raw.trim();
        if (trimmed.isEmpty() || trimmed.equals("null")) return DEFAULT_VALUE;
        String digits = trimmed.startsWith("0x") || trimmed.startsWith("0X")
            ? String.valueOf(parseHex(trimmed)) : trimmed;
        StringBuilder clean = new StringBuilder();
        for (int i = 0; i < digits.length() && clean.length() < 18; i++) {
            char c = digits.charAt(i);
            if (c >= '0' && c <= '9') clean.append(c);
            else if (c == '-' && clean.length() == 0) clean.append(c);
        }
        String value = clean.toString();
        if (value.isEmpty() || value.equals("-")) return DEFAULT_VALUE;
        try { Long.parseLong(value); } catch (NumberFormatException error) { return DEFAULT_VALUE; }
        return value;
    }

    private static long parseHex(String hex) {
        try { return Long.parseLong(hex.substring(2), 16); }
        catch (NumberFormatException error) { return 0; }
    }

    @Override public String toString() {
        return "phase=" + phase + ", saved=" + (savedValue == null ? "none" : savedValue)
            + ", appliedMax=" + appliedMax + ", restoreOwed=" + restoreOwed;
    }
}
