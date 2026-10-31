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
    private volatile int dreamHooks, consulted, blocked, allowedNoLease, allowedCamera, allowedOtherOrUnknown,
        unresolvable, skipped;
    /** 最近一次「本该拦但拦不了」的具体原因（返回类型不允许取消调用）。 */
    private volatile String lastSkip = "none";
    /** 真正挂上的方法名（扫描匹配的结果），用于核对，而不是「安装了」这种笼统状态。 */
    private volatile String hookedNames = "none";
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
                            // 返回值安全性：{@code startDream} 在不同 ROM 上是 void / boolean / int。
                            // 过去的写法无条件 {@code setResult(null)} —— 对非 void 方法，取消一个
                            // 方法却不能给出合法返回值，调用方拆箱时会抛异常；而「拦不住」时这里
                            // 又没有计数，真机上看起来和「没命中」一模一样。
                            Class<?> returns = returnTypeOf(hook);
                            if (returns != void.class && returns != boolean.class) {
                                skipped++;
                                lastSkip = "return=" + returns.getSimpleName();
                                lastDecision = "cannot-cancel dream (pkg=" + pkg + ", " + lastSkip + ")";
                                return;
                            }
                            blocked++;
                            lastDecision = "blocked rear-aod dream (pkg=" + pkg + ")";
                            hook.setResult(returns == void.class ? null : Boolean.FALSE);
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
            // 按名字精确匹配在 API 37 上得到 0（1.3.61 真机：dreamHooks=0，而
            // rearDreamHook 仍然报 true）。这里改成按签名特征扫描：凡是名字里带 dream、
            // 且以 start/request 开头的方法都挂上 —— DozeService/DozeDream 正是这个形状。
            // 每个真正挂上的方法名都记进 hookedNames，下一次日志可以直接核对。
            StringBuilder hooked = new StringBuilder();
            for (java.lang.reflect.Method method : dreams.getDeclaredMethods()) {
                String name = method.getName();
                String lower = name.toLowerCase(java.util.Locale.ROOT);
                if (!lower.contains("dream")) continue;
                if (!(name.startsWith("start") || name.startsWith("request"))) continue;
                try {
                    XposedBridge.hookMethod(method, guard);
                    if (hooked.length() > 0) hooked.append(',');
                    hooked.append(name);
                    dreamHooks++;
                } catch (Throwable ignored) { /* 已废弃或不可挂：跳过，由总数反映。 */ }
            }
            hookedNames = hooked.length() == 0 ? "none" : hooked.toString();
            // 1.3.61 在这里无条件 installed = true：hookAllMethods 对不存在的名字是**静默零命中**，
            // 于是日志出现「rearDreamHook=true, dreamHookError=false, dreamHooks=0」——
            // 一个自相矛盾的「安装成功」。零命中必须算失败，并把候选名与类里真实的方法名带出来，
            // 下一次真机日志才能直接告诉我们该挂哪个方法。
            if (dreamHooks == 0) {
                failed = true;
                lastSkip = "no method matched startDream/startDozeDream/requestStartDream; declared="
                    + declared(dreams);
                installed = false;
                XposedBridge.log("Tingyu rear dream guard: " + lastSkip);
            } else {
                installed = true;
            }
        } catch (Throwable error) { logOnce(error); }
    }

    /** {@code MethodHookParam.method} 是 {@code Member}，要转型才能取返回类型。 */
    private static Class<?> returnTypeOf(XC_MethodHook.MethodHookParam hook) {
        java.lang.reflect.Member member = hook.method;
        return member instanceof java.lang.reflect.Method
            ? ((java.lang.reflect.Method) member).getReturnType() : void.class;
    }

    /** 零命中时把类里真实的方法名列出来（有上限），供下一次真机日志定位。 */
    private static String declared(Class<?> owner) {
        StringBuilder text = new StringBuilder();
        try {
            int shown = 0;
            for (java.lang.reflect.Method method : owner.getDeclaredMethods()) {
                if (shown >= 24) { text.append("…"); break; }
                if (text.length() > 0) text.append(',');
                text.append(method.getName());
                shown++;
            }
        } catch (Throwable error) { return "unreadable"; }
        return text.toString();
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
            + ", dreamHooks=" + dreamHooks + ", dreamHooked=[" + hookedNames + "]"
            + ", dreamConsulted=" + consulted
            + ", rearAodBlocked=" + blocked + ", allowedNoLease=" + allowedNoLease
            + ", allowedCamera=" + allowedCamera + ", allowedOther=" + allowedOtherOrUnknown
            + ", unresolvable=" + unresolvable + ", skipped=" + skipped + ", lastSkip=" + lastSkip
            + ", lastDecision=" + lastDecision;
    }
    private void logOnce(Throwable error) {
        if (!failed) { failed = true; XposedBridge.log("Tingyu rear dream guard: " + error); }
    }
}
