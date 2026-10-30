package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearLockWakeBudget.java
/**
 * 锁屏后的唤醒预算，按后端分流。
 *
 * <p>为什么需要区分：LSP 模块在 system_server 里有 {@code shouldSleep} hook，锁屏时由它维持背屏，
 * 听屿一侧再补一次 {@code input keyevent} 只是多余甚至有害。Shizuku 没有这样的 hook，HyperOS 4
 * 会在 SCREEN_OFF 时直接熄灭背屏面板，此时窗口其实还挂着、也没有被移走 —— 四种「背屏消失」里最
 * 温和的一种，一次唤醒就该解决。
 *
 * <p>原来的实现是整场会话只允许一次唤醒（{@code wakeTried}）：一次熄屏前的抖动用掉这个名额后，
 * 整个锁屏周期再也不会尝试，于是表现为「背屏歌词被关闭」。这里改成每次锁屏独立预算，并封顶三次，
 * 既不反复抢占，也不会一击致命。
 *
 * <p>纯逻辑：不碰 PowerManager，不碰 Shizuku，方便在 JVM 上直接断言。
 */
final class RearLockWakeBudget {

    /** Three attempts per lock: enough for one transition plus its display-state lag, never a loop. */
    static final int MAX_WAKES = 3;

    private boolean candidate;
    private int wakes;

    /**
     * @param hookOwnsIdle false 表示这条还原路径上没有 system hook（Shizuku），需要本进程自己唤醒
     */
    void lockStarted(boolean hookOwnsIdle) {
        candidate = !hookOwnsIdle;
        wakes = 0;
    }

    void unlocked() {
        candidate = false;
        wakes = 0;
    }

    /** 消耗一次预算；只有本次锁屏仍在预算内才返回 true。 */
    boolean take() {
        if (!candidate || wakes >= MAX_WAKES) return false;
        wakes++;
        return true;
    }

    boolean candidate() { return candidate; }
    int wakes() { return wakes; }

    @Override public String toString() { return "candidate=" + candidate + ", wakes=" + wakes + "/" + MAX_WAKES; }
}
