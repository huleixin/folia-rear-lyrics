package io.github.huleixin.tingyu;

// android/app/src/main/java/io/github/huleixin/tingyu/RearCoveredRecovery.java
/**
 * 锁屏后被系统背屏桌面（{@code SubScreenLauncher}）盖住时的恢复状态机。
 *
 * <h3>为什么 1.3.39 能、1.3.59~1.3.64 不能（本次回归的结论）</h3>
 * <pre>
 * 1.3.39  reuse = (!locked || lsp || preserve) &amp;&amp; attached
 *         → 锁屏 + Shizuku → reuse=false → 「Display 0 暂存透明任务 → am display move-stack → 只唤醒背屏」
 *
 * 1.3.59+ reuse = (!locked || lsp || preserve || planA) &amp;&amp; attached
 *         → planA 默认 true → reuse=true → if (reuse) 提前 return，迁移路径永远执行不到
 * </pre>
 * 于是两个版本在锁屏时做的是**不同机制**的事：1.3.39 新建一个任务再整体迁移，
 * 1.3.64 让一个被系统压在下面的旧任务回前台。后者在当前固件上无效（日志里
 * {@code moveTaskToFront} 返回成功、前台不变），但这不能推出前者也无效 ——
 * 它们操作的是任务树里不同层级的对象。所以这里保留两条：先试「让旧任务回前台」，
 * 失败再走「新建 + 迁移」。
 *
 * <ol>
 *   <li><b>IN_APP_MOVE_TO_FRONT</b>：不重建任何东西，代价最小，解锁态下确实有效。</li>
 *   <li><b>MAIN_STAGE_MIGRATE</b>：1.3.39 的机制。在 Display 0 上建一个透明任务
 *       （不点亮、不解锁、不弹界面），再整体搬到背屏。</li>
 * </ol>
 * 两者互不替代，所以失败分类必须分开记：{@code NOT_FRONTED}（命令执行了但没效果）、
 * {@code COMMAND_UNSUPPORTED}（表读不出来，**不是**任务不存在）、{@code TASK_NOT_FOUND}
 * （表可读且确实没有该任务）、{@code PERMISSION_DENIED}、{@code SYSTEM_RETAKEN}、
 * {@code RECOVERED}（唯一成功判据：窗口真正可见）。
 *
 * <p>纯逻辑，不碰 Android API，可在 JVM 上直接断言。
 */
final class RearCoveredRecovery {

    /** 真正不同的恢复手段，按副作用从小到大排。 */
    enum Mechanism {
        /** 进程内 {@code ActivityManager.moveTaskToFront}：不重建、不点亮、不重启 WebView。 */
        IN_APP_MOVE_TO_FRONT,
        /**
         * 1.3.39 的机制：在 Display 0 上建一个**全新**的透明任务，再 {@code move-stack} 到背屏。
         *
         * <p>它与 {@link #IN_APP_MOVE_TO_FRONT} 的本质区别是对象层级：新建的任务是自己的
         * root task，可以整体搬屏；旧任务是被系统桌面压在下面的子任务，只能被「提为前台」。
         * 前者在锁屏态可用（1.3.39 真机验证过），后者不可用（1.3.64 真机日志）。
         */
        MAIN_STAGE_MIGRATE,
        /** 只有窗口确实不存在时才允许。 */
        REBUILD
    }

    /**
     * 一次尝试的结论。六种状态对应六种不同的下一步：
     * 三种要停手，两种要换机制，一种表示成功。
     */
    enum Result {
        /** 窗口真正可见（{@code onStart} 跑过、已绘制）。唯一的成功判据。 */
        RECOVERED,
        /** 命令被执行，窗口仍不可见，但前台**不是**我们 —— 置顶没有生效。 */
        NOT_FRONTED,
        /** 表读不出来（命令不支持 / 输出为空 / 格式不认识）。**不是**「任务不存在」。 */
        COMMAND_UNSUPPORTED,
        /** 表读得出来，但里面确实没有这个任务 —— 窗口真的没了。 */
        TASK_NOT_FOUND,
        /** 系统/权限直接拒绝（SecurityException 等），带原文。 */
        PERMISSION_DENIED,
        /** 前台又变成系统背屏桌面：我们让开之后系统立刻抢回去了。 */
        SYSTEM_RETAKEN,
        /** 背屏本身不存在了。 */
        WINDOW_GONE
    }

    enum Decision { NONE, ATTEMPT, REBUILD }

    static final class Plan {
        final Decision decision;
        final Mechanism mechanism;
        final String reason;

        Plan(Decision decision, Mechanism mechanism, String reason) {
            this.decision = decision; this.mechanism = mechanism; this.reason = reason;
        }

        @Override public String toString() {
            return decision + (mechanism == null ? "" : "(" + mechanism + ")") + ":" + reason;
        }
    }

    /**
     * 一个锁屏周期内的尝试上限。
     *
     * <p>2 不是「重试两次」，而是「两个不同手段各一次」。同一个手段永远不会被下发两次
     * （见 {@link #tried}），所以这个数字不会随失败次数被烧光，也不会变成抢占循环。
     */
    static final int MAX_ATTEMPTS = 2;
    /** 相邻两次尝试的最小间隔：留出任务切换与回读的时间，也避免抢前台闪烁。 */
    static final long MIN_GAP_MS = 5_000;
    /** 命令发出后等待窗口变成可见的时间。 */
    static final long VERIFY_MS = 1_400;

    private final java.util.EnumSet<Mechanism> tried = java.util.EnumSet.noneOf(Mechanism.class);
    private int attempts;
    private long lastAttemptAt;
    private boolean attempted;
    private boolean blocked;
    private boolean recovered;
    private boolean windowGone;
    private boolean reported;
    private Mechanism lastMechanism;
    private Result lastResult;
    private String lastDetail = "";
    private String blockedReason = "";
    /** 本周期允许的两条路线（由 {@link RearLaunchRoute.Mode} 决定，A/B 用）。 */
    private boolean allowRefront = true, allowMigrate = true;

    /** 解锁、用户重新开启歌词、播放停止：新周期，全部额度与判定复位。 */
    synchronized void reset() {
        tried.clear();
        attempts = 0;
        lastAttemptAt = 0; attempted = false;
        blocked = false; recovered = false; windowGone = false; reported = false;
        lastMechanism = null; lastResult = null; lastDetail = ""; blockedReason = "";
        allowRefront = true; allowMigrate = true;
    }

    /**
     * 新的一次「被覆盖」事件开始。
     *
     * <p>1.3.62 的 {@code recovered} 只会被置真、永远不会被置假：只要窗口曾经可见过一次，
     * 之后哪怕它被 {@code onStop}，诊断里仍然是 {@code recovered=true} 配
     * {@code visible=false}（用户看到的自相矛盾状态）。现在每次新的覆盖事件都重新判定。
     */
    synchronized void beginEpisode() {
        recovered = false;
        reported = false;
    }

    /** 窗口真的可见时才调用：这是唯一能把 {@code recovered} 置真的入口。 */
    synchronized void onVisible() {
        recovered = true;
        blocked = false;
        blockedReason = "";
    }

    /**
     * 决定下一步。
     *
     * @param windowAlive   我们的 Activity 与窗口仍然存在（{@code attached=true}），与「可见」无关
     * @param windowVisible 真正可见（{@code onStart} 且已绘制）
     * @param systemFront   背屏前台确实是系统背屏中心
     */
    synchronized Plan evaluate(boolean wanted, boolean camera, boolean closing,
                               boolean windowAlive, boolean windowVisible, boolean systemFront,
                               boolean allowRefront, boolean allowMigrate, long now) {
        this.allowRefront = allowRefront;
        this.allowMigrate = allowMigrate;
        if (!wanted || camera || closing) return new Plan(Decision.NONE, null, "idle");
        if (windowVisible) { onVisible(); return new Plan(Decision.NONE, null, "visible"); }
        if (!windowAlive) {
            windowGone = true;
            return new Plan(Decision.REBUILD, Mechanism.REBUILD, "window-gone");
        }
        if (!systemFront) return new Plan(Decision.NONE, null, "not-system-front");
        if (blocked) return new Plan(Decision.NONE, null, "blocked:" + blockedReason);
        if (attempted && now - lastAttemptAt < MIN_GAP_MS) return new Plan(Decision.NONE, null, "cooldown");
        if (attempts >= MAX_ATTEMPTS) {
            blocked = true; blockedReason = "attempt-cap";
            return new Plan(Decision.NONE, null, "attempt-cap");
        }
        Mechanism next = firstUntried();
        if (next == null) {
            blocked = true; blockedReason = "all-mechanisms-refused";
            return new Plan(Decision.NONE, null, "all-mechanisms-refused");
        }
        attempts++; lastAttemptAt = now; attempted = true; tried.add(next); lastMechanism = next;
        return new Plan(Decision.ATTEMPT, next, "attempt#" + attempts);
    }

    /**
     * 下一个还没试过的机制。
     *
     * <p>{@code allowRefront=false}（B 路由，或用户只想要迁移）时直接跳到
     * {@link Mechanism#MAIN_STAGE_MIGRATE}；{@code allowMigrate=false}（A 路由）时不提供它，
     * 这样真机上「A 单独失败 / B 单独成功」可以被清楚地区分出来。
     */
    private Mechanism firstUntried() {
        for (Mechanism candidate : new Mechanism[] {
                Mechanism.IN_APP_MOVE_TO_FRONT, Mechanism.MAIN_STAGE_MIGRATE }) {
            if (candidate == Mechanism.IN_APP_MOVE_TO_FRONT && !allowRefront) continue;
            if (candidate == Mechanism.MAIN_STAGE_MIGRATE && !allowMigrate) continue;
            if (!tried.contains(candidate)) return candidate;
        }
        return null;
    }

    /** 记录一次尝试的结果。{@code frontIsOurs} 由同一时刻的真实前台回读给出。 */
    synchronized void onResult(Mechanism mechanism, Result result, boolean frontIsOurs, String detail, long now) {
        lastMechanism = mechanism;
        lastResult = result;
        lastDetail = detail == null ? "" : detail;
        switch (result) {
            case RECOVERED:
                recovered = true; blocked = false; blockedReason = "";
                break;
            case COMMAND_UNSUPPORTED:
                // 命令/解析层面根本不可用：换机制没意义，直接停手并留下原文。
                blocked = true; blockedReason = "command-unsupported";
                break;
            case PERMISSION_DENIED:
                blocked = true; blockedReason = "permission-denied";
                break;
            case TASK_NOT_FOUND:
                // 表读得出来但没有这个任务 = 窗口真的没了，允许走安全重建。
                windowGone = true;
                break;
            case SYSTEM_RETAKEN:
                // 系统在我们让开之后又抢回前台：本周期停手，别再耗电去点亮一块只会显示
                // 系统桌面的屏。
                blocked = true; blockedReason = "system-retaken";
                break;
            case WINDOW_GONE:
                windowGone = true;
                break;
            case NOT_FRONTED:
            default:
                if (firstUntried() == null) { blocked = true; blockedReason = "all-mechanisms-refused"; }
                break;
        }
    }

    synchronized boolean blocked() { return blocked; }
    synchronized boolean recovered() { return recovered; }
    synchronized boolean windowGone() { return windowGone; }
    synchronized int attempts() { return attempts; }
    synchronized Result lastResult() { return lastResult; }
    synchronized String blockedReason() { return blockedReason; }
    synchronized String lastDetail() { return lastDetail; }

    /** 只上报一次「已判定」，避免把同一条结论写进轨迹十几次。 */
    synchronized boolean claimReport() {
        if (reported || !blocked) return false;
        reported = true;
        return true;
    }

    synchronized boolean tried(Mechanism mechanism) { return tried.contains(mechanism); }

    @Override public synchronized String toString() {
        return "attempts=" + attempts + "/" + MAX_ATTEMPTS
            + ", tried=" + tried
            + ", blocked=" + blocked
            + (blockedReason.isEmpty() ? "" : "(" + blockedReason + ")")
            + ", recovered=" + recovered
            + ", windowGone=" + windowGone
            + (lastResult == null ? "" : ", last=" + lastResult + "@" + lastMechanism
                + (lastDetail.isEmpty() ? "" : "[" + lastDetail + "]"));
    }
}
