package io.github.huleixin.tingyu;

import android.content.Context;

// android/app/src/main/java/io/github/huleixin/tingyu/RearPlanA.java
/**
 * Which rear-screen controller runs, and the one piece of state that must outlive every
 * component: the user closed the window on purpose.
 *
 * <p>The controller is chosen at runtime so a device test can fall back to the previous engine
 * with a single tap. Both engines are compiled in; exactly one of them is allowed to issue
 * commands (enforced by {@link RearCommandGate}), so a rollback cannot leave two controllers
 * fighting.
 *
 * <p>The dismissal flag is persisted rather than held in memory because the coordinator, the
 * rear Activity and the playback service are torn down and recreated independently. A camera
 * episode that outlives the process must not be able to bring the window back, and neither may
 * an automatic recovery after the user closed it.
 */
final class RearPlanA {
    static final String PREFS = "rear_lyrics";
    static final String KEY_ENGINE = "rear_engine";
    static final String KEY_DISMISSED = "user_dismissed";
    static final String ENGINE_PLAN_A = "plan-a";
    static final String ENGINE_LEGACY = "legacy";

    /** Test hook only; null means "read the persisted preference". */
    private static volatile Boolean override;

    private RearPlanA() {}

    static boolean enabled(Context context) {
        Boolean forced = override;
        if (forced != null) return forced;
        if (context == null) return true;
        String engine = context.getSharedPreferences(PREFS, 0).getString(KEY_ENGINE, ENGINE_PLAN_A);
        return !ENGINE_LEGACY.equals(engine);
    }

    static String engine(Context context) {
        Boolean forced = override;
        if (forced != null) return forced ? ENGINE_PLAN_A : ENGINE_LEGACY;
        if (context == null) return ENGINE_PLAN_A;
        String engine = context.getSharedPreferences(PREFS, 0).getString(KEY_ENGINE, ENGINE_PLAN_A);
        return ENGINE_LEGACY.equals(engine) ? ENGINE_LEGACY : ENGINE_PLAN_A;
    }

    static void setEngine(Context context, String engine) {
        if (context == null) return;
        boolean legacy = ENGINE_LEGACY.equals(engine);
        context.getSharedPreferences(PREFS, 0).edit()
            .putString(KEY_ENGINE, legacy ? ENGINE_LEGACY : ENGINE_PLAN_A).apply();
        override = null;
    }

    /** The user closed the rear window; no component may present, wake or rebuild it. */
    static void markDismissed(Context context) {
        if (context == null) return;
        context.getSharedPreferences(PREFS, 0).edit().putBoolean(KEY_DISMISSED, true).apply();
    }

    static void clearDismissed(Context context) {
        if (context == null) return;
        context.getSharedPreferences(PREFS, 0).edit().putBoolean(KEY_DISMISSED, false).apply();
    }

    static boolean dismissed(Context context) {
        return context != null && context.getSharedPreferences(PREFS, 0).getBoolean(KEY_DISMISSED, false);
    }

    /** Unit tests run without a Context; never left set outside a test. */
    static void overrideForTest(Boolean value) { override = value; }
}
