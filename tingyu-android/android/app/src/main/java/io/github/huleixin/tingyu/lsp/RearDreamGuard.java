package io.github.huleixin.tingyu.lsp;

import android.content.ComponentName;
import android.os.SystemClock;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearDreamGuard.java
/**
 * 在 system_server 内对 DreamManagerService 的最小干预：当且仅当听屿歌词租约持有、
 * 且待启动的 Dream 是背屏中心（com.xiaomi.subscreencenter）的 AOD Dream 时，本次启动
 * 被拒绝。系统设置中的「背屏息屏」开关从未被读取或修改；租约释放、租约过期、
 * 相机接管、进程死亡清理之后，下一次 Dream 启动完全按系统原逻辑执行。
 *
 * <p>失败透明：目标类/方法/参数不匹配时安装失败，全部放行，只记录一次日志 —— 绝不
 * 全局禁用 AOD，绝不触碰 rear_doze_always_on，绝不让 SystemUI 跳过息屏。
 */
final class RearDreamGuard {
    private boolean installed;
    private volatile boolean failed;
    private volatile long consulted, blocked, allowedNoLease, allowedCamera, allowedOtherOrUnknown;
    private volatile String lastDecision = "not consulted";

    /** 租约与相机证据来自既有的电源租约持有者，单一事实来源。 */
    interface LeaseView {
        boolean lyricsLeaseHeld();
        boolean cameraRecentlyOnLeasedDisplay();
    }

    void install(ClassLoader loader, LeaseView lease) {
        try {
            Class<?> dreams = XposedHelpers.findClass("com.android.server.dreams.DreamManagerService", loader);
            XC_MethodHook guard = new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam hook) {
                    try {
                        String pkg = dreamPackageFrom(hook);
                        consulted++;
                        boolean held = lease.lyricsLeaseHeld();
                        boolean camera = lease.cameraRecentlyOnLeasedDisplay();
                        RearDreamPolicy.Decision decision = RearDreamPolicy.evaluate(pkg, held, camera);
                        if (decision == RearDreamPolicy.Decision.BLOCK) {
                            blocked++;
                            lastDecision = "blocked rear-aod dream while lyrics lease held";
                            hook.setResult(null);
                            return;
                        }
                        if (!held) allowedNoLease++;
                        else if (camera) allowedCamera++;
                        else allowedOtherOrUnknown++;
                        lastDecision = "allowed (pkg=" + (pkg == null ? "unknown" : pkg) + ", lease=" + held + ")";
                    } catch (Throwable error) { logOnce(error); }
                }
            };
            // The internal overload(s) carry the resolved ComponentName; covering every
            // overload at once keeps the guard honest about what it is blocking.
            XposedBridge.hookAllMethods(dreams, "startDream", guard);
            try {
                // The doze entry point resolves its component internally; the same guard
                // inspects whatever component evidence the call site can offer.
                XposedBridge.hookAllMethods(dreams, "startDozeDream", guard);
            } catch (Throwable ignored) { /* Older AOSP without the doze entry. */ }
            installed = true;
        } catch (Throwable error) { logOnce(error); }
    }

    /**
     * 从 hook 参数中尽力解析 Dream 组件包名：ComponentName 参数、String 参数
     * （flatten 形式）或对象里的 component 字段。解析不出返回 null —— 按策略放行。
     */
    private String dreamPackageFrom(XC_MethodHook.MethodHookParam hook) {
        for (Object arg : hook.args) {
            String pkg = packageOf(arg);
            if (pkg != null) return pkg;
        }
        // No component argument (e.g. a no-arg doze entry): fall back to the service's
        // current dream component field if it names the rear centre.
        try {
            Object current = XposedHelpers.getObjectField(hook.thisObject, "mCurrentDreamComponent");
            String pkg = packageOf(current);
            if (pkg != null) return pkg;
        } catch (Throwable ignored) { /* Field name differs across releases. */ }
        return null;
    }

    private String packageOf(Object arg) {
        if (arg instanceof ComponentName) return ((ComponentName) arg).getPackageName();
        if (arg instanceof String) return RearDreamPolicy.packageNameOf((String) arg);
        if (arg != null) {
            try {
                Object component = XposedHelpers.callMethod(arg, "toShortString");
                if (component instanceof String) return RearDreamPolicy.packageNameOf((String) component);
            } catch (Throwable ignored) { /* Not a component-like object. */ }
        }
        return null;
    }

    boolean installed() { return installed; }
    String status() {
        return "rearDreamHook=" + installed + ", dreamHookError=" + failed
            + ", dreamConsulted=" + consulted + ", rearAodBlocked=" + blocked
            + ", allowedNoLease=" + allowedNoLease + ", allowedCamera=" + allowedCamera
            + ", allowedOtherOrUnknown=" + allowedOtherOrUnknown + ", lastDecision=" + lastDecision;
    }
    private void logOnce(Throwable error) {
        if (!failed) { failed = true; XposedBridge.log("Tingyu rear dream guard: " + error); }
    }
}
