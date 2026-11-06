package io.github.huleixin.tingyu.diagnostics;

// android/app/src/main/java/io/github/huleixin/tingyu/diagnostics/StartupFailurePolicy.java
/**
 * 连续启动失败的判定规则（纯 JVM，可单测）。
 *
 * <p>把「上一次是不是正常启动完成 / 是不是用户自己退出 / 系统给出的退出原因」这三件事
 * 收敛成一个数字和一个布尔值，避免把「用户划掉后台」「系统低内存回收」误判成启动崩溃。
 *
 * <p>规则：
 * <ul>
 *   <li>上一次启动了 <b>startup-complete</b> → 计数清零（运行时崩溃不算启动崩溃）；</li>
 *   <li>上一次是用户主动退出 → 清零；</li>
 *   <li>系统原因（低内存 / freezer / 依赖进程死亡）→ 清零，安全模式救不了内存不足；</li>
 *   <li>其余（未完成 + 崩溃 / ANR / 无退出信息）→ 计数 +1；</li>
 *   <li>连续 {@link #THRESHOLD} 次即进入安全模式。</li>
 * </ul>
 */
public final class StartupFailurePolicy {
    /** 连续两次「没走完启动」才进安全模式：一次可能只是用户手快划掉。 */
    public static final int THRESHOLD = 2;

    /** 退出原因分类，来自 ApplicationExitInfo 或本地崩溃记录。 */
    public static final int EXIT_UNKNOWN = 0;
    public static final int EXIT_CRASH = 1;
    public static final int EXIT_ANR = 2;
    public static final int EXIT_USER = 3;
    public static final int EXIT_SYSTEM = 4;
    public static final int EXIT_OTHER = 5;

    public static final class Decision {
        public final int consecutive;
        public final boolean safeMode;

        public Decision(int consecutive, boolean safeMode) {
            this.consecutive = consecutive;
            this.safeMode = safeMode;
        }
    }

    private StartupFailurePolicy() {}

    public static Decision decide(
        boolean lastCompleted,
        boolean lastUserExit,
        int previousConsecutive
    ) {
        int previous = Math.max(0, previousConsecutive);
        if (lastCompleted || lastUserExit) return new Decision(0, false);
        int next = previous + 1;
        return new Decision(next, next >= THRESHOLD);
    }

    /**
     * 拿到系统退出原因后的复核：用户主动退出 / 系统回收都属于「不是启动崩溃」，
     * 把已经加上去的计数退回去，不允许进安全模式。
     */
    public static Decision recheck(Decision pending, int exitKind) {
        if (exitKind == EXIT_USER || exitKind == EXIT_SYSTEM) return new Decision(0, false);
        return new Decision(pending.consecutive, pending.safeMode);
    }

    public static int classifyExitReason(int reasonCode) {
        // ActivityManager.ApplicationExitInfo 的 REASON_* 常量（API 30+）。
        switch (reasonCode) {
            case 2:  // REASON_SIGNALED
            case 4:  // REASON_CRASH
            case 5:  // REASON_CRASH_NATIVE
            case 7:  // REASON_INITIALIZATION_FAILURE
            case 9:  // REASON_EXCESSIVE_RESOURCE_USAGE
                return EXIT_CRASH;
            case 6:  // REASON_ANR
                return EXIT_ANR;
            case 10: // REASON_USER_REQUESTED
            case 11: // REASON_USER_STOPPED
                return EXIT_USER;
            case 3:  // REASON_LOW_MEMORY
            case 12: // REASON_DEPENDENCY_DIED
            case 13: // REASON_OTHER：系统/厂商的杂项终止，归到「不是启动崩溃」一侧
            case 14: // REASON_FREEZER
                return EXIT_SYSTEM;
            default:
                return EXIT_UNKNOWN;
        }
    }
}
