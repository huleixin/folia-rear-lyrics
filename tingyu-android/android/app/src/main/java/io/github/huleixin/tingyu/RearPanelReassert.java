package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearPanelReassert.java
/**
 * Shizuku 后端锁屏保亮的真实机制：观察 → 有界恢复。
 *
 * <p>v1.3.55 的教训（真机证据）：{@code subscreen_display_time} 管不住锁屏瞬间的系统
 * 强制熄屏——它只控制解锁态的背屏超时（bright 文档中 90s 的
 * {@code SubScreenAutoOffAlarmTimeout} 才是解锁后超时）。锁屏熄屏走的是主屏 sleep →
 * 副屏电源状态转换，shell 无法阻止它发生。
 *
 * <p>bright 的 Root 永不息屏同样承认这一点：写完设置后仍有一个守护「查询 Display 1
 * 状态，OFF/DOZE/DOZE_SUSPEND/ON_SUSPEND 时 {@code input -d 1 keyevent
 * KEYCODE_WAKEUP}」——点亮是 shell 能做到的（真机验证过），阻止点亮不是。
 *
 * <p>本类把 bright 的 2 秒轮询改为**事件驱动 + 有界**：锁屏事件、DisplayListener 的
 * 状态变化事件、以及既有 2 秒窗口心跳作为兜底观测点；只有观测到背屏非 ON 且保亮
 * 条件成立时才动作。动作序列与 bright 一致：先 WAKE（真机验证过的点亮手段），
 * 连续失败再退到 power 恢复命令。每个锁屏周期有硬上限，耗尽即停——不是无限循环，
 * 不是 100ms 高频唤醒。解锁或保亮条件解除时清零重置。
 *
 * <p>纯逻辑：不碰 Shizuku、不碰 DisplayManager。
 */
final class RearPanelReassert {

    /** Hard cap per lock episode; exhausted means "give up until the episode ends". */
    static final int MAX_ATTEMPTS_PER_EPISODE = 12;
    /** Minimum spacing between attempts; observations between them are free (no shell call). */
    static final long MIN_INTERVAL_MS = 1500;
    /** Attempts after which the stronger power-policy command is used instead of a wake. */
    static final int POWER_RESET_AFTER = 4;

    enum Action { NONE, WAKE, POWER_RESET }

    private boolean episode;
    private int attempts;
    private long lastAttemptAt;
    private boolean exhausted;
    private long awakeSince = Long.MIN_VALUE;
    private int recoveries;

    /** A lock episode starts while the lyrics are active; budget resets. */
    void begin() {
        if (episode) return;
        episode = true; attempts = 0; exhausted = false; lastAttemptAt = 0;
    }

    /** Unlock, pause, camera or user close ends the episode; the system owns the panel again. */
    void end() {
        episode = false; attempts = 0; exhausted = false; lastAttemptAt = 0; awakeSince = Long.MIN_VALUE;
    }

    /**
     * One decision per observation.
     *
     * @param holding      保亮条件成立（歌词活动、播放中、用户开启、非相机、非合盖）
     * @param displayAwake 背屏面板当前观测为 STATE_ON
     */
    Action observe(boolean holding, boolean displayAwake, long now) {
        if (!episode || exhausted) return Action.NONE;
        if (displayAwake) {
            if (awakeSince == Long.MIN_VALUE) { awakeSince = now; recoveries++; }
            return Action.NONE; // Healthy; observation costs nothing.
        }
        awakeSince = Long.MIN_VALUE;
        if (!holding) return Action.NONE;
        // lastAttemptAt==0 means "never attempted within this episode"; the spacing guard
        // only applies between real attempts.
        if (lastAttemptAt != 0 && now - lastAttemptAt < MIN_INTERVAL_MS) return Action.NONE;
        if (attempts >= MAX_ATTEMPTS_PER_EPISODE) {
            exhausted = true; // Stop forever for this episode; never loop.
            return Action.NONE;
        }
        attempts++;
        lastAttemptAt = now;
        return attempts > POWER_RESET_AFTER ? Action.POWER_RESET : Action.WAKE;
    }

    boolean holdingBudget() { return episode && !exhausted; }
    int attempts() { return attempts; }
    boolean exhausted() { return exhausted; }
    int recoveries() { return recoveries; }

    @Override public String toString() {
        return "episode=" + episode + ", attempts=" + attempts + "/" + MAX_ATTEMPTS_PER_EPISODE
            + ", exhausted=" + exhausted + ", recoveries=" + recoveries;
    }
}
