package io.github.huleixin.tingyu.lsp;

import android.content.ComponentName;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearDreamGuard.java
/**
 * DreamManagerService 路径的兜底拦截（保留但降级为「兜底」：REAREye 源码证据表明
 * 锁屏背屏接管的主路径是背屏中心的 home-to-front，由 RearHomeGuard 在启动/迁移
 * 两条系统调用上拦截）。
 *
 * <p>v1.3.56 的缺陷已修复：hookAllMethods 对方法名不匹配是**静默零命中**——旧版
 * 只要 findClass 成功就 installed=true，即使一个方法都没 hook 上。现在匹配数被
 * 显式统计；零命中会在诊断中暴露（dreamHooks=0），不再是假阳性。
 */
final class RearDreamGuard {
    private boolean installed;
    private volatile boolean failed;
    private volatile int dreamHooks, consulted, blocked, allowedNoLease, allowedCamera, allowedOtherOrUnknown, unresolvable;
    private volatile String lastDecision = "not consulted";
    private volatile boolean loggedFirst;

    void install(ClassLoader loader, RearLeaseView lease) {
        try {
            Class<?> dreams = XposedHelpers.findClass("com.android.server.dreams.DreamManagerService", loader);
            XC_MethodHook guard = new XC_MethodHook() {
                @Override protected void beforeHookedMethod(MethodHookParam hook) {
                    try {
                        if (!loggedFirst) {
                            loggedFirst = true;
                            XposedBridge.log("Tingyu rear dream guard: consulted, args=" + signature(hook.args));
                        }
                        consulted++;
                        String pkg = dreamPackageFrom(hook);
                        boolean held = lease.lyricsLeaseHeld();
                        boolean camera = lease.cameraRecentlyOnLeasedDisplay();
                        RearDreamPolicy.Decision decision = RearDreamPolicy.evaluate(pkg, held, camera);
                        if (decision == RearDreamPolicy.Decision.BLOCK) {
                            blocked++;
                            lastDecision = "blocked rear-aod dream (pkg=" + pkg + ")";
                            hook.setResult(null);
                            return;
                        }
                        if (pkg == null) unresolvable++;
                        else if (!held) allowedNoLease++;
                        else if (camera) allowedCamera++;
                        else allowedOtherOrUnknown++;
                        lastDecision = "allowed (pkg=" + (pkg == null ? "unknown" : pkg) + ", lease=" + held + ")";
                    } catch (Throwable error) { logOnce(error); }
                }
            };
            XposedBridge.hookAllMethods(dreams, "startDream", guard);
            XposedBridge.hookAllMethods(dreams, "startDozeDream", guard);
            XposedBridge.hookAllMethods(dreams, "requestStartDream", guard);
            dreamHooks = countMethods(dreams, "startDream") + countMethods(dreams, "startDozeDream")
                + countMethods(dreams, "requestStartDream");
            installed = true;
        } catch (Throwable error) { logOnce(error); }
    }

    private static int countMethods(Class<?> owner, String name) {
        try {
            int count = 0;
            for (java.lang.reflect.Method method : owner.getDeclaredMethods())
                if (method.getName().equals(name)) count++;
            return count;
        } catch (Throwable error) { return 0; }
    }

    /** 从 hook 参数与已知字段尽力解析 Dream 组件包名；解析不出返回 null（按策略放行）。 */
    private String dreamPackageFrom(XC_MethodHook.MethodHookParam hook) {
        for (Object arg : hook.args) {
            String pkg = packageOf(arg);
            if (pkg != null) return pkg;
        }
        for (String field : new String[] {"mCurrentDreamComponent", "mCurrentDreamName", "mDozeComponent"}) {
            try {
                Object current = XposedHelpers.getObjectField(hook.thisObject, field);
                String pkg = packageOf(current);
                if (pkg != null) return pkg;
            } catch (Throwable ignored) { /* Field differs across releases. */ }
        }
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

    private static String signature(Object[] args) {
        StringBuilder text = new StringBuilder();
        if (args != null) for (Object arg : args) {
            if (text.length() > 0) text.append(", ");
            text.append(arg == null ? "null" : arg.getClass().getName());
        }
        return "[" + text + "]";
    }

    boolean installed() { return installed; }
    String status() {
        return "rearDreamHook=" + installed + ", dreamHookError=" + failed
            + ", dreamHooks=" + dreamHooks + ", dreamConsulted=" + consulted
            + ", rearAodBlocked=" + blocked + ", allowedNoLease=" + allowedNoLease
            + ", allowedCamera=" + allowedCamera + ", allowedOther=" + allowedOtherOrUnknown
            + ", unresolvable=" + unresolvable + ", lastDecision=" + lastDecision;
    }
    private void logOnce(Throwable error) {
        if (!failed) { failed = true; XposedBridge.log("Tingyu rear dream guard: " + error); }
    }
}
