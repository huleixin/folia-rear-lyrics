package io.github.huleixin.tingyu;

import android.content.Context;

// android/app/src/main/java/io/github/huleixin/tingyu/RearLaunchRoute.java
/**
 * 锁屏时走哪条启动路线。这是一个**回归修复**的判定，不是新策略。
 *
 * <h3>1.3.39 与 1.3.59+ 的唯一实质差异</h3>
 * <pre>
 * 1.3.39  reuse = (!locked || lsp || preserve) &amp;&amp; attached
 *         → 锁屏 + Shizuku → reuse=false → 走「Display 0 暂存 → move-stack → 只唤醒背屏」
 *
 * 1.3.59+ reuse = (!locked || lsp || preserve || planA) &amp;&amp; attached
 *         → planA 默认 true，所以锁屏 + Shizuku 也是 reuse=true
 *         → 迁移路径被 if (reuse) 提前 return 挡住，只剩 am start / moveTaskToFront
 * </pre>
 * 真机验证：1.3.39 的 Shizuku 能在锁屏后显示背屏歌词（当时的问题是相机冲突）；
 * 1.3.64 的 Shizuku 不能。差别就是这一个布尔量，所以修复也必须落在这里，
 * 而不是继续给「让已有任务回到前台」加命令。
 *
 * <h3>为什么是「换机制」而不是「换重试次数」</h3>
 * 迁移会让 ATMS **新建**一个任务（{@code FLAG_ACTIVITY_NEW_TASK} 在 Display 0 上创建），
 * 然后把它整体搬到背屏。新建的任务是**它自己的 root task**，{@code am display move-stack}
 * 才对它有意义 —— 这也是为什么 1.3.39 的迁移能生效、而对一个被系统压在下面的旧任务
 * 反复 {@code moveTaskToFront} 不能：两者操作的是不同层级的对象。
 *
 * <h3>A/B 路由</h3>
 * {@link Mode} 可持久化，真机可以强制只跑 A（复用/置顶）或只跑 B（迁移），
 * 用同一份诊断对比，不必改代码重编。默认 {@link Mode#AUTO}：看得见就复用，
 * 看不见就迁移。
 *
 * <p>纯逻辑，不碰 Android API 之外的东西（{@link Context} 仅用于读设置），可在 JVM 上断言。
 */
final class RearLaunchRoute {

    /** 实际要执行的路线。 */
    enum Route {
        /** 直接 {@code am start --display <rear>}。未锁屏、或 LSP 未持有窗口时使用。 */
        DIRECT,
        /** 复用仍然存在的窗口：只做置顶/唤醒，不重建任何东西。 */
        REUSE,
        /** 1.3.39 兼容路径：Display 0 暂存一个透明任务，再整体迁移到背屏。 */
        MIGRATE
    }

    /** A/B：允许真机强制某一条，用于判断到底哪条有效。 */
    enum Mode {
        /** 看得见就复用，看不见就迁移（默认，等于恢复 1.3.39 的锁屏行为）。 */
        AUTO("auto"),
        /** A：只复用/置顶，永不迁移（1.3.59~1.3.64 的行为，用于对照）。 */
        REUSE("reuse"),
        /** B：锁屏时总是迁移（1.3.39 的行为，用于单独验证迁移本身）。 */
        MIGRATE("migrate");

        final String value;

        Mode(String value) { this.value = value; }

        static Mode of(String raw) {
            if (raw != null) {
                for (Mode mode : values()) if (mode.value.equals(raw)) return mode;
            }
            return AUTO;
        }
    }

    static final String PREFS = "rear_lyrics";
    static final String KEY_MODE = "locked_route";

    private RearLaunchRoute() {}

    /**
     * @param attached 我们的 Activity 与窗口仍然存在（{@code attached=true}），与「可见」无关
     * @param visible  真正可见（{@code onStart} 且已绘制）
     * @param locked   主屏处于锁定/熄屏态
     * @param planA    当前控制引擎是否为 Plan A；旧引擎（{@code legacy}）等价于 1.3.39 语义
     * @param mode     A/B 偏好
     */
    static Route decide(boolean attached, boolean visible, boolean locked, boolean planA, Mode mode) {
        if (!locked) return attached ? Route.REUSE : Route.DIRECT;
        // 旧引擎就是 1.3.39 的行为：锁屏一律重建再迁移（当时的 reuse 计算里没有 planA）。
        if (!planA) return Route.MIGRATE;
        Mode chosen = mode == null ? Mode.AUTO : mode;
        switch (chosen) {
            case REUSE:
                // A：只让已有任务回前台，永不迁移。用于确认「这条确实不行」。
                return attached ? Route.REUSE : Route.DIRECT;
            case MIGRATE:
                // B：无视现有窗口，直接走迁移。用于单独验证迁移能力。
                return Route.MIGRATE;
            case AUTO:
            default:
                // 看得见就不打扰；看不见（被背屏桌面盖住 / 窗口已不在）就走迁移。
                // 这一行就是 1.3.39 → 1.3.59 的回归点。
                return visible ? Route.REUSE : Route.MIGRATE;
        }
    }

    /** 锁屏后是否允许这条路线接管。相机让位、用户关闭歌词时一律不允许。 */
    static boolean allowedWhenLocked(Route route, boolean cameraOwned, boolean wanted) {
        if (!wanted || cameraOwned) return false;
        return route == Route.REUSE || route == Route.MIGRATE;
    }

    static Mode readMode(Context context) {
        if (context == null) return Mode.AUTO;
        return Mode.of(context.getSharedPreferences(PREFS, 0).getString(KEY_MODE, Mode.AUTO.value));
    }

    static void writeMode(Context context, Mode mode) {
        if (context == null || mode == null) return;
        context.getSharedPreferences(PREFS, 0).edit().putString(KEY_MODE, mode.value).apply();
    }

    /** 诊断用：一行说明当前偏好与本次判定依据。 */
    static String describe(Mode mode, Route route, boolean attached, boolean visible, boolean locked) {
        return "lockedRoute=" + (mode == null ? Mode.AUTO : mode).value
            + "->" + route
            + "(attached=" + attached + ",visible=" + visible + ",locked=" + locked + ")";
    }
}
