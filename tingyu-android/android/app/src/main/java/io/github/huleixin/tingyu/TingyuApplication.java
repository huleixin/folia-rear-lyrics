package io.github.huleixin.tingyu;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;

import java.io.BufferedReader;
import java.io.FileReader;

import io.github.huleixin.tingyu.diagnostics.DiagnosticBootstrap;
import io.github.huleixin.tingyu.diagnostics.StartupGuard;

// android/app/src/main/java/io/github/huleixin/tingyu/TingyuApplication.java
/**
 * 极早期诊断入口。
 *
 * <p>这个类只做两件事：把崩溃处理器/事件流/启动记账尽早装上，再记一个阶段。
 * 所有业务初始化仍然留在 MainActivity —— 这里多一行同步 IO，用户就多等一毫秒。
 *
 * <p>为什么值得新增一个 Application：在它之前系统只会跑 ContentProvider，
 * 而 `attachBaseContext` 是进程里第一段属于我们的代码（见 DiagnosticBootstrapProvider，
 * 那是第二道保险）。没有它，Application/Provider 阶段的崩溃在下一包里会完全没有痕迹。
 */
public final class TingyuApplication extends Application {
    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        try {
            StartupGuard.noteProcessName(currentProcessName());
        } catch (Throwable ignored) {
        }
        // 崩溃处理器必须在任何业务代码之前装；失败也不能影响启动。
        DiagnosticBootstrap.install(base, StartupGuard.STAGE_APP_ATTACH);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        // DEBUG 构建专用：允许通过 prefs 复现「Application 阶段崩溃」，release 里不读这个键。
        if (BuildConfig.DEBUG && "app-create".equals(
            getSharedPreferences("tingyu_debug_fault", MODE_PRIVATE)
                .getString("stage", ""))) {
            throw new IllegalStateException("Injected startup fault at app-create (debug build)");
        }
        DiagnosticBootstrap.stage(StartupGuard.STAGE_APP_CREATE);
        // 只为了区分「主界面拉起」和「背屏 Activity 拉起」：后者不加载 React，不能算启动失败。
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override public void onActivityCreated(Activity activity, Bundle state) {
                StartupGuard.noteEntry(
                    activity instanceof MainActivity || activity instanceof SafeModeActivity ? "main" : "rear");
            }
            @Override public void onActivityStarted(Activity activity) {}
            @Override public void onActivityResumed(Activity activity) {}
            @Override public void onActivityPaused(Activity activity) {}
            @Override public void onActivityStopped(Activity activity) {}
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
            @Override public void onActivityDestroyed(Activity activity) {}
        });
    }

    /** API 28+ 直接拿进程名；更低版本读 /proc/self/cmdline（只用于诊断标注）。 */
    private static String currentProcessName() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                String name = Application.getProcessName();
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Throwable ignored) {
        }
        try (BufferedReader reader = new BufferedReader(new FileReader("/proc/self/cmdline"))) {
            String line = reader.readLine();
            if (line != null && !line.isEmpty()) return line.trim();
        } catch (Throwable ignored) {
        }
        return "main";
    }
}
