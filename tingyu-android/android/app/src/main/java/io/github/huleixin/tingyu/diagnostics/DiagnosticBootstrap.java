package io.github.huleixin.tingyu.diagnostics;

import android.content.Context;

// android/app/src/main/java/io/github/huleixin/tingyu/diagnostics/DiagnosticBootstrap.java
/**
 * 极早期诊断安装点。
 *
 * <p>被 {@link io.github.huleixin.tingyu.TingyuApplication#attachBaseContext} 与
 * {@link DiagnosticBootstrapProvider#onCreate} 各调用一次：前者是进程里最早的 App 代码，
 * 后者是「Application.onCreate 之前」的最后一道保险（ContentProvider 先于它创建）。
 *
 * <p>这里只做三件事：装崩溃处理器、装事件流、记阶段。任何一步失败都不允许影响启动 ——
 * 一个诊断组件如果自己抛异常，就等于给用户造了一个新的闪退原因。
 */
public final class DiagnosticBootstrap {
    private static volatile boolean installed;

    private DiagnosticBootstrap() {}

    /** 幂等。stage 只影响第一次调用记录的阶段名。 */
    public static void install(Context context, String stage) {
        if (context == null) return;
        if (!installed) {
            installed = true;
            // 崩溃处理器必须最先装：后面任何一行都可能抛。
            try {
                io.github.huleixin.tingyu.CrashDiagnostics.install(context);
            } catch (Throwable ignored) {
            }
            try {
                DiagnosticLog.install(context);
            } catch (Throwable ignored) {
            }
            try {
                StartupGuard.begin(context);
            } catch (Throwable ignored) {
            }
        }
        stage(stage);
    }

    /** 记录一个启动阶段（空名忽略）。 */
    public static void stage(String stage) {
        if (stage == null || stage.isEmpty()) return;
        try {
            StartupGuard.stage(stage);
        } catch (Throwable ignored) {
        }
    }

    public static boolean isInstalled() {
        return installed;
    }
}
