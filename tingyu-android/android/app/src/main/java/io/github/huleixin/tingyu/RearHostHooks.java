package io.github.huleixin.tingyu;

import android.app.Activity;
import android.app.Application;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Parcel;
import android.os.SystemClock;
import android.view.Display;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import java.lang.ref.WeakReference;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

// android/app/src/main/java/io/github/huleixin/tingyu/RearHostHooks.java
/**
 * 只运行在小米背屏中心（com.xiaomi.subscreencenter）进程内的宿主注入。
 *
 * <p>1.3.95 的实现在这个进程里寻找 MAML 音乐卡片：{@code findElement("music_control")} +
 * {@code ownMedia()}（MediaController 包名必须是听屿）。小米不建卡时整条链路直接失败。
 *
 * <p>1.3.96 换成 backmone（changyun233/backmone）验证过的思路：hook 背屏中心自己的
 * launcher Activity 生命周期，把听屿的歌词舞台作为一个<b>新增的顶层子 View</b> 挂到它的
 * 窗口上。不寻找、不隐藏、不暂停任何 MAML 元素；不碰 MediaController / MediaSession；
 * 不注入其它应用。释放 = 摘掉自己的 View，原生界面一直在下面。
 *
 * <p>所有权仍然只来自听屿的显示会话：binder 调用方 UID 必须是听屿，session 必须通过
 * {@link RearHostPolicy#validSession(String)}，同一时刻只允许一个 lease。
 */
public final class RearHostHooks {
    private static final String TAG = "TingyuRearHost";
    /** HyperOS 3 / 小米 17 Pro 的背屏桌面入口；找不到时退回 Activity 生命周期 + 类名判定。 */
    private static final String LAUNCHER = "com.xiaomi.subscreencenter.SubScreenLauncher";
    private static String launcherClass = LAUNCHER;
    private static String process = "?";
    private static Controller controller;
    /**
     * 通信初始化是否完成。只有它为真才算「装上了」：Controller 能创建、CONNECT 能收到、
     * Provider 能握手。它<b>不</b>依赖任何 MAML / 音乐卡片类，也不依赖 UI Hook 是否兼容。
     */
    private static boolean communicationReady;
    private static boolean installing;
    private static volatile boolean uiHooksReady;
    /** 安装阶段 / 该阶段的异常；随 register 一起送到听屿诊断，不允许只报「请启用作用域」。 */
    private static volatile String stage = "not-installed";
    private static volatile String stageError = "";
    private static volatile int priority;
    private static volatile String capability = "not installed";
    /** 最近一次 register 失败的原因；由 ping 应答带回听屿，Provider 不可达时也能读到最后错误。 */
    private static volatile String registerError = "";

    /**
     * 在 {@code com.xiaomi.subscreencenter} 的<b>任意进程</b>调用。
     *
     * <p>1.3.95 在这里先加载 {@code MamlView / MusicControlScreenElement} 再挂
     * {@code Application.attach}，并把 {@code installed=true} 提前写死：任何一个私有类不兼容，
     * 连「Controller 创建 + Binder 握手」都被跳过，应用侧只会看到 hostConnected=false。
     *
     * <p>现在分成两个互不阻断的阶段：
     * <ol>
     *   <li><b>通信</b>：挂 {@code Application.attach} 与公开的 {@code Application.onCreate}
     *       （attach 是隐藏 API，签名可能随 ROM 变化；onCreate 必然存在），只依赖 Android
     *       框架类。失败时记录阶段与堆栈并允许下一次调用重试。</li>
     *   <li><b>UI Hook</b>：launcher 生命周期。失败只降低 priority，不影响通信与诊断上报。</li>
     * </ol>
     */
    public static synchronized void install(ClassLoader loader, String processName) {
        if (communicationReady || installing) return;
        installing = true;
        process = processName == null || processName.isEmpty() ? "?" : processName;
        log("install begin process=" + process + " build=" + BuildConfig.BUILD_ID);
        try {
            stage = "communication";
            XC_MethodHook create = new XC_MethodHook() {
                @Override protected void afterHookedMethod(MethodHookParam param) {
                    ensureController(param.thisObject);
                }
            };
            int attachHooks = safeHookAll(Application.class, "attach", create);
            int createHooks = safeHookAll(Application.class, "onCreate", create);
            if (attachHooks + createHooks == 0) throw new IllegalStateException("Application 生命周期方法不可用");
            communicationReady = true;
            log("communication ready attachHooks=" + attachHooks + " onCreateHooks=" + createHooks);
        } catch (Throwable error) {
            communicationReady = false;
            stage = "communication-failed";
            stageError = describe(error);
            log("communication failed: " + stageError);
            installing = false;
            return;
        }
        try {
            stage = "ui-hooks";
            Class<?> launcher = XposedHelpers.findClassIfExists(LAUNCHER, loader);
            if (launcher != null) launcherClass = launcher.getName();
            int hooks = 0;
            hooks += hookLifecycle("performResume", true);
            hooks += hookLifecycle("performPause", false);
            hooks += hookLifecycle("performDestroy", false);
            if (hooks < 2 && launcher != null) {
                // 老 ROM 或裁剪过的 Activity：退回 launcher 类里声明的方法。
                hooks += hookDeclared(launcher, "onResume", true);
                hooks += hookDeclared(launcher, "onPause", false);
                hooks += hookDeclared(launcher, "onDestroy", false);
            }
            {
                // 第三层兜底：Instrumentation 的 callActivityOnXxx 对每个 Activity 都会调用，
                // 不依赖 Activity 子类是否 super.onResume()，也不依赖 performXxx 的隐藏签名。
                hooks += hookInstrumentation("callActivityOnResume", true);
                hooks += hookInstrumentation("callActivityOnPause", false);
                hooks += hookInstrumentation("callActivityOnDestroy", false);
            }
            uiHooksReady = hooks >= 2;
            stage = uiHooksReady ? "ready" : "ui-hooks-incomplete";
            if (!uiHooksReady) stageError = "lifecycle hooks=" + hooks + ", launcherClass=" + (launcher != null);
        } catch (Throwable error) {
            uiHooksReady = false;
            stage = "ui-hooks-failed";
            stageError = describe(error);
        }
        // 通信可用就先注册：UI Hook 失败时应用侧仍能看到 hostConnected=true 与确切失败阶段，
        // 而不是被一句「请启用作用域」盖住。
        priority = uiHooksReady ? 2 : 1;
        capability = "process=" + process + ", launcher=" + launcherClass
            + ", uiHooks=" + (uiHooksReady ? "ok" : "no") + ", stage=" + stage
            + ", build=" + BuildConfig.BUILD_ID;
        installing = false;
        log("install done priority=" + priority + " " + capability
            + (stageError.isEmpty() ? "" : " error=" + stageError));
    }

    private static int safeHookAll(Class<?> type, String method, XC_MethodHook hook) {
        try {
            return XposedBridge.hookAllMethods(type, method, hook).isEmpty() ? 0 : 1;
        } catch (Throwable error) {
            log("hook " + type.getSimpleName() + "." + method + " failed: " + describe(error));
            return 0;
        }
    }

    /** attach / onCreate 共用：先挂一个最小的 ping 应答器，再创建唯一 Controller。 */
    private static synchronized void ensureController(Object target) {
        if (!(target instanceof Application)) return;
        Application application = (Application) target;
        ensurePing(application);
        if (controller != null) { controller.initialize("application-lifecycle"); return; }
        try {
            controller = new Controller(application, process);
            log("controller created process=" + process);
            controller.initialize("controller-created");
        } catch (Throwable error) {
            stage = "controller-failed";
            stageError = describe(error);
            log("controller create failed: " + stageError);
        }
    }

    private static BroadcastReceiver pingReceiver;

    /**
     * 独立于 Provider/Binder 的存活证明：听屿发有序广播，模块用 setResultData 回答。
     * 即使 Controller 创建失败、Provider 不可见、UID 校验拒绝，只要模块进程里这段代码
     * 跑到过，听屿就能拿到 build/process/stage；拿不到则说明模块没在该进程运行。
     */
    private static synchronized void ensurePing(Application application) {
        if (pingReceiver != null) return;
        try {
            BroadcastReceiver candidate = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    if (!RearHostContract.PING.equals(intent.getAction())) return;
                    String data = "build=" + BuildConfig.BUILD_ID
                        + ";process=" + process
                        + ";stage=" + stage
                        + ";controller=" + (controller != null ? "yes" : "no")
                        + ";context=" + (controller == null ? "not-created" : controller.context.getClass().getName())
                        + ";receiver=" + (controller != null && controller.receiverReady ? "ready" : "not-ready")
                        + ";receiverError=" + (controller == null ? "-" : controller.receiverError)
                        + ";register=" + (registerError.isEmpty() ? "-" : registerError)
                        + ";error=" + (stageError.isEmpty() ? "-" : stageError);
                    try {
                        setResultCode(1);
                        setResultData(data);
                    } catch (Throwable ignored) {}
                    log("ping answered: " + data);
                }
            };
            IntentFilter filter = new IntentFilter(RearHostContract.PING);
            Handler handler = new Handler(Looper.getMainLooper());
            if (Build.VERSION.SDK_INT >= 33) {
                application.registerReceiver(candidate, filter, null, handler, Context.RECEIVER_EXPORTED);
            } else {
                application.registerReceiver(candidate, filter, null, handler);
            }
            pingReceiver = candidate;
            log("ping receiver registered");
        } catch (Throwable error) {
            if (stageError.isEmpty()) stageError = "ping: " + describe(error);
            log("ping receiver failed: " + describe(error));
        }
    }

    /** 失败原因里带异常类型、消息和第一帧调用点，方便从日志一眼定位阶段。 */
    static String describe(Throwable error) {
        if (error == null) return "unknown";
        String message = error.getMessage();
        StackTraceElement[] frames = error.getStackTrace();
        return error.getClass().getSimpleName() + (message == null ? "" : ": " + message)
            + (frames.length == 0 ? "" : " @ " + frames[0]);
    }

    private static int hookLifecycle(String method, final boolean resume) {
        XC_MethodHook hook = new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                if (param.hasThrowable() || !(param.thisObject instanceof Activity)) return;
                Activity activity = (Activity) param.thisObject;
                if (!isLauncher(activity)) return;
                Controller target = controller;
                if (target == null) return;
                if (resume) target.resumed(activity);
                else if ("performDestroy".equals(method)) target.destroyed(activity);
                else target.paused(activity);
            }
        };
        try {
            return XposedBridge.hookAllMethods(Activity.class, method, hook).isEmpty() ? 0 : 1;
        } catch (Throwable error) {
            return 0;
        }
    }

    private static int hookDeclared(Class<?> type, String method, final boolean resume) {
        XC_MethodHook hook = new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                if (param.hasThrowable() || !(param.thisObject instanceof Activity)) return;
                Activity activity = (Activity) param.thisObject;
                if (!isLauncher(activity)) return;
                Controller target = controller;
                if (target == null) return;
                if (resume) target.resumed(activity);
                else if ("onDestroy".equals(method)) target.destroyed(activity);
                else target.paused(activity);
            }
        };
        try {
            return XposedBridge.hookAllMethods(type, method, hook).isEmpty() ? 0 : 1;
        } catch (Throwable error) {
            return 0;
        }
    }

    /** Instrumentation 兜底：参数第一个就是 Activity，与子类实现无关。 */
    private static int hookInstrumentation(String method, final boolean resume) {
        XC_MethodHook hook = new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                if (param.hasThrowable() || param.args.length == 0 || !(param.args[0] instanceof Activity)) return;
                Activity activity = (Activity) param.args[0];
                if (!isLauncher(activity)) return;
                Controller target = controller;
                if (target == null) return;
                if (resume) target.resumed(activity);
                else if ("callActivityOnDestroy".equals(method)) target.destroyed(activity);
                else target.paused(activity);
            }
        };
        return safeHookAll(android.app.Instrumentation.class, method, hook);
    }

    /** 只认背屏中心自己的桌面窗口：别的 Activity（哪怕是同进程）一律不参与宿主判定。 */
    private static boolean isLauncher(Activity activity) {
        String name = activity.getClass().getName();
        return RearHostContract.TARGET.equals(activity.getPackageName())
            && (name.equals(launcherClass) || name.endsWith("SubScreenLauncher"));
    }

    /** 同时写 logcat（tag TingyuRearHost）与 LSPosed 日志，真机取证不再依赖某一端。 */
    private static void log(String message) {
        try { android.util.Log.i(TAG, message); } catch (Throwable ignored) {}
        XposedBridge.log(TAG + ": " + message);
    }

    private static final class Controller extends Binder implements RearHostView.Events {
        private static final int ATTACHED = 1, PENDING = 0, FAILED = -1;

        private final Context context;
        private final String process;
        private final Handler main = new Handler(Looper.getMainLooper());
        private final ExecutorService io = Executors.newSingleThreadExecutor();
        private final AtomicInteger commands = new AtomicInteger();
        private volatile String lease = "", lastReleased = "";
        private volatile int appUid = -1;
        private WeakReference<Activity> launcher = new WeakReference<>(null);
        private RearHostView host;
        private IBinder lifeline;
        private boolean suspended;
        private boolean resumed;
        private boolean launcherSeen;
        private int display = -1, rebinds, launches;
        private long nextLaunchAt, pausedAt;
        private int publishFailures;
        private String lastFailure = "背屏中心 launcher 尚未出现";
        private volatile boolean receiverReady;
        private volatile String receiverError = "";
        private final java.util.concurrent.atomic.AtomicBoolean publishing = new java.util.concurrent.atomic.AtomicBoolean();

        Controller(Application application, String processName) {
            this.context = RearHostContext.resolve(application);
            log("context ready type=" + context.getClass().getName());
            this.process = processName;
            attachInterface(null, RearHostContract.DESCRIPTOR);
            application.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
                public void onActivityCreated(Activity a, Bundle state) {}
                public void onActivityStarted(Activity a) {}
                public void onActivityResumed(Activity a) { if(isLauncher(a)){log("launcher lifecycle callback resumed display="+displayOf(a));resumed(a);} }
                public void onActivityPaused(Activity a) { if(isLauncher(a))paused(a); }
                public void onActivityStopped(Activity a) {}
                public void onActivitySaveInstanceState(Activity a, Bundle state) {}
                public void onActivityDestroyed(Activity a) { if(isLauncher(a))destroyed(a); }
            });
        }

        // Reuse this Controller on onCreate/CONNECT; do not allocate another Binder or executor.
        void initialize(String why) {
            registerReceiver();
            publish(why);
        }

        /**
         * CONNECT 广播只是「请现在 register 一次」的提示，不携带任何数据；安全边界在
         * {@link RearHostProvider} 的 UID 校验。签名权限在部分 ROM/系统应用上注册会抛异常，
         * 这种情况下退回不带权限的导出接收器，宁可让广播送达，也不能让握手整条消失。
         */
        private synchronized void registerReceiver() {
            if (receiverReady) return;
            BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent intent) {
                    if (RearHostContract.REQUEST.equals(intent.getAction())) {
                        log("CONNECT broadcast received");
                        publish("connect-broadcast");
                    }
                }
            };
            IntentFilter filter = new IntentFilter(RearHostContract.REQUEST);
            String permission = RearHostContract.APP + ".permission.LSP_CONNECT";
            try {
                if (Build.VERSION.SDK_INT >= 33) {
                    context.registerReceiver(receiver, filter, permission, main, Context.RECEIVER_EXPORTED);
                } else {
                    context.registerReceiver(receiver, filter, permission, main);
                }
                receiverReady=true; receiverError="";
                log("receiver registered with signature permission");
            } catch (Throwable error) {
                log("receiver with permission failed: " + describe(error) + "; retrying without it");
                try {
                    if (Build.VERSION.SDK_INT >= 33) {
                        context.registerReceiver(receiver, filter, null, main, Context.RECEIVER_EXPORTED);
                    } else {
                        context.registerReceiver(receiver, filter, null, main);
                    }
                    receiverReady=true; receiverError="";
                    log("receiver registered without permission; provider UID check remains the gate");
                } catch (Throwable second) {
                    log("receiver registration failed: " + describe(second));
                    receiverError = describe(second);
                }
            }
        }

        /** 见过真实 launcher 实例的进程比「只装上了 Hook」的进程更可信，优先级再高一档。 */
        private int priority() {
            return uiHooksReady ? (launcherSeen ? 3 : 2) : 1;
        }

        /** 失败后能否安全重试：通信/控制器失败可再调 install；UI Hook 失败要重启目标进程。 */
        private String retryHint() {
            if (stage.startsWith("communication") || stage.startsWith("controller")) return "safe";
            if (stage.startsWith("ui-hooks")) return "restart-process";
            return "n/a";
        }

        private String profile() {
            return "背屏中心宿主 v" + RearHostContract.VERSION
                + " · build=" + BuildConfig.BUILD_ID
                + " · " + process
                + " · stage=" + stage
                + " · priority=" + priority()
                + " · retry=" + retryHint()
                + " · context=" + context.getClass().getName()
                + " · receiver=" + receiverReady
                + (receiverError.isEmpty() ? "" : " · receiverError=" + receiverError)
                + (stageError.isEmpty() ? "" : " · " + stageError);
        }

        /** 主动把 Binder 交给听屿；不依赖听屿先发广播，冷启动/丢广播都能连上。 */
        void publish(String why) {
            if (!publishing.compareAndSet(false,true)) return;
            io.execute(() -> {
                try {
                    Bundle bundle = new Bundle();
                    bundle.putBinder("service", this);
                    bundle.putInt("protocol", RearHostContract.VERSION);
                    bundle.putInt("priority", priority());
                    bundle.putString("stage", stage);
                    bundle.putString("error", stageError);
                    bundle.putString("process", process);
                    bundle.putString("build", BuildConfig.BUILD_ID);
                    bundle.putString("profile", profile());
                    log("provider register begin (" + why + "), receiver=" + receiverReady);
                    Bundle result = context.getContentResolver().call(
                        Uri.parse("content://" + RearHostContract.AUTHORITY), "register", null, bundle);
                    IBinder next = result == null ? null : result.getBinder("lifeline");
                    int acceptedUid = result == null ? -1 : result.getInt("appUid", -1);
                    if (next == null || !next.isBinderAlive() || acceptedUid < 0)
                        throw new IllegalStateException("Provider register returned no live lifeline/appUid");
                    appUid = acceptedUid;
                    if (next != null && next != lifeline) {
                        next.linkToDeath(() -> main.post(() -> {
                            if (lifeline == next) { release(); lifeline = null; }
                        }), 0);
                        lifeline = next;
                    }
                    log("registered with app (" + why + "), lifeline=" + (next != null) + ", appUid=" + appUid);
                    registerError = "";
                } catch (Throwable error) {
                    // 这里失败通常是 Provider 不可见/权限/进程问题；Logcat 保留阶段与堆栈。
                    registerError = describe(error);
                    log("register failed (" + why + ", stage=" + stage + "): " + registerError);
                    // 只重试一次：覆盖「听屿进程正在启动、Provider 尚未就绪」的瞬时失败，
                    // 不做无限重试，也不把失败藏起来。
                    if (publishFailures++ == 0) main.postDelayed(() -> initialize("retry-once"), 1_500);
                } finally { publishing.set(false); }
            });
        }

        // ------------------------------------------------------------ launcher lifecycle

        void resumed(Activity activity) {
            if (Looper.myLooper() != main.getLooper()) { main.post(() -> resumed(activity)); return; }
            int id = displayOf(activity);
            log("launcher discovered resumed display="+id+", lease="+!lease.isEmpty());
            if (id <= 0) { log("ignored launcher on display " + id); return; }
            boolean same = launcher.get() == activity;
            launcher = new WeakReference<>(activity);
            resumed = true;
            display = id;
            pausedAt = 0;
            if (!launcherSeen) {
                // 第一次看到真正的 launcher：把优先级升到 3 并重新注册，让听屿优先选这个进程。
                launcherSeen = true;
                log("launcher seen process=" + process + "; re-registering with priority " + priority());
                publish("launcher-seen");
            }
            if (!lease.isEmpty()) report(lease,"launcher",id,"Launcher resumed via lifecycle observation");
            if (!same && host != null && host.activity() != activity) {
                // 旧窗口的宿主视图随旧窗口一起销毁；新窗口必须拿一个新的。
                host.close();
                host = null;
            }
            // 同一个窗口重新前台：先把宿主的 resumed 复位，否则它会在 render() 里永远判为不可见。
            if (host != null && host.activity() == activity) host.resumed(true);
            if (!lease.isEmpty()) attach("launcher-resumed");
        }

        void paused(Activity activity) {
            if (Looper.myLooper() != main.getLooper()) { main.post(() -> paused(activity)); return; }
            if (activity != launcher.get()) return;
            resumed = false;
            pausedAt = SystemClock.uptimeMillis();
            if (host != null) host.resumed(false);
        }

        void destroyed(Activity activity) {
            if (Looper.myLooper() != main.getLooper()) { main.post(() -> destroyed(activity)); return; }
            if (activity != launcher.get()) return;
            resumed = false;
            if (host != null) {
                host.close();
                host = null;
                report(lease, "paused", display, "launcher window destroyed; waiting for a new one");
            }
        }

        // ------------------------------------------------------------ attach / launch

        private int attach(String why) {
            report(lease,"attaching",display,"attach="+why+", launcher="+(launcher.get()!=null)+", resumed="+resumed+", suspended="+suspended+", power="+state(display));
            if (!uiHooksReady) {
                lastFailure = "背屏中心 UI Hook 不可用（stage=" + stage + (stageError.isEmpty() ? "" : ", " + stageError) + "）";
                return FAILED;
            }
            if (lease.isEmpty()) return FAILED;
            if (suspended) { lastFailure = "宿主正在让位（相机或应用侧挂起）"; return PENDING; }
            Activity activity = launcher.get();
            if (activity == null || activity.isFinishing() || !resumed) {
                lastFailure = "背屏中心 launcher 不在前台";
                report(lease,"waiting-launcher",display,lastFailure+", resumed="+resumed+", power="+state(display));
                requestLauncher(why);
                return PENDING;
            }
            int id = displayOf(activity);
            if (id <= 0) { lastFailure = "背屏中心 launcher 不在背屏上"; return FAILED; }
            display = id;
            // Existing view follows display/AOD events; a read-only probe must not turn normal
            // suspension into failure and destroy a successfully created renderer.
            if (!RearHostPolicy.requiresNewView(host!=null,host!=null&&host.closed(),host!=null&&host.activity()==activity)) { host.refresh(); return ATTACHED; }
            int power = state(id);
            if (power != RearHostPolicy.STATE_ON) {
                // 背屏没点亮时不在背屏中心里建视图：点屏是应用侧独立窗口的职责，宿主不抢电源。
                lastFailure = "背屏当前未点亮（state=" + power + "）";
                return FAILED;
            }

            if (host != null) { host.close(); host = null; }
            if (!RearHostPolicy.mayRebind(rebinds)) {
                lastFailure = "宿主重建次数已达上限（" + rebinds + "）；本次会话不再重建";
                return FAILED;
            }
            rebinds++;
            RearHostView next = new RearHostView(activity, lease, this);
            if (!next.attach()) {
                lastFailure = next.failure();
                next.close();
                log("view create failed: " + lastFailure + " (" + why + ")");
                return FAILED;
            }
            host = next;
            lastFailure = "";
            report(lease, "created", display, "rear-centre host attached: display=" + display
                + ", " + RearHostPolicy.describe(rebinds, launches) + ", " + why);
            log("view created display=" + display + " " + why + " " + RearHostPolicy.describe(rebinds, launches));
            return ATTACHED;
        }

        /**
         * 主动请求背屏中心回到背屏（仅冷启动：本次会话还没见过 launcher）。
         *
         * <p>面板必须亮着、未被相机挂起、并且这次会话从未观察到 launcher 被别的界面暂停过。
         * 每个显示会话最多 {@link RearHostPolicy#MAX_LAUNCH_REQUESTS} 次、间隔
         * {@link RearHostPolicy#LAUNCH_GAP_MS}；任何一次失败都不会循环重试。
         */
        private void requestLauncher(String why) {
            long now = SystemClock.uptimeMillis();
            if (!RearHostPolicy.mayLaunch(host != null, suspended, resumed, display, state(display),
                launches, nextLaunchAt, pausedAt, now)) return;
            String target = launcher.get() != null ? launcher.get().getClass().getName() : launcherClass;
            try {
                Intent intent = new Intent().setClassName(RearHostContract.TARGET, target)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                Bundle options = android.app.ActivityOptions.makeBasic().setLaunchDisplayId(display).toBundle();
                context.startActivity(intent, options);
                launches++;
                nextLaunchAt = now + RearHostPolicy.LAUNCH_GAP_MS;
                report(lease, "launch", display, "requested rear-centre launcher on display " + display
                    + ", attempt=" + launches + ", " + why);
                log("launcher requested target=" + target + " display=" + display + " attempt=" + launches);
            } catch (Throwable error) {
                lastFailure = "启动背屏中心失败: " + error.getClass().getSimpleName();
                log(lastFailure);
            }
        }

        private int state(int id) {
            if (id <= 0) return 0;
            DisplayManager manager = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
            Display value = manager == null ? null : manager.getDisplay(id);
            return value == null ? 0 : value.getState();
        }

        private static int displayOf(Activity activity) {
            Display display = activity.getWindow() == null ? null : activity.getWindow().getDecorView().getDisplay();
            return display == null ? -1 : display.getDisplayId();
        }

        // ------------------------------------------------------------ release

        private boolean release() {
            if (host != null) { host.close(); host = null; }
            String old = lease;
            lease = "";
            if (!old.isEmpty()) lastReleased = old;
            suspended = false;
            rebinds = 0;
            launches = 0;
            nextLaunchAt = 0;
            Activity activity = launcher.get();
            resumed = activity != null && !activity.isFinishing();
            log("released " + (old.isEmpty() ? "none" : old));
            return true;
        }

        // ------------------------------------------------------------ host events

        @Override public boolean current(String session) {
            return !lease.isEmpty() && lease.equals(session);
        }

        @Override public void report(String session, String event, int id, String reason) {
            if (!lease.equals(session) && !lastReleased.equals(session)) return;
            log(event + " display=" + id + " " + reason);
            if ("user-exit".equals(event) || "failed".equals(event)) {
                if (host != null) { host.close(); host = null; }
                if (!lease.isEmpty()) lastReleased = lease;
                lease = "";
                suspended = false;
                rebinds = 0;
                launches = 0;
                nextLaunchAt = 0;
                Activity activity = launcher.get();
                resumed = activity != null && !activity.isFinishing();
            }
            io.execute(() -> {
                try {
                    Bundle bundle = new Bundle();
                    bundle.putString("session", session);
                    bundle.putString("event", event);
                    bundle.putInt("display", id);
                    bundle.putString("reason", reason);
                    context.getContentResolver().call(Uri.parse("content://" + RearHostContract.AUTHORITY), "report", null, bundle);
                } catch (Throwable error) { log("host report failed event="+event+": "+describe(error)); }
            });
        }

        // ------------------------------------------------------------ binder

        @Override protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws android.os.RemoteException {
            if (code == INTERFACE_TRANSACTION) { reply.writeString(RearHostContract.DESCRIPTOR); return true; }
            try {
                if (appUid < 0 || Binder.getCallingUid() != appUid) throw new SecurityException("Tingyu only");
                data.enforceInterface(RearHostContract.DESCRIPTOR);
                String requested = data.readString();
                boolean value = data.readInt() != 0;
                int requestedDisplay = data.readInt();
                if (!RearHostPolicy.validSession(requested)) throw new SecurityException("Invalid display session");
                int token = (code == RearHostContract.SHOW || code == RearHostContract.HIDE) ? commands.incrementAndGet() : commands.get();
                CountDownLatch done = new CountDownLatch(1);
                boolean[] ok = {false};
                String[] reason = {"Host command unavailable"};
                int[] shown = {-1};
                Runnable work = () -> {
                    try {
                        if (token != commands.get()) return;
                        if (code == RearHostContract.SHOW) {
                            if (!lease.isEmpty() && !lease.equals(requested)) { reason[0] = "Another host lease exists"; return; }
                            lease = requested;
                            suspended = false;
                            rebinds = 0;
                            launches = 0;
                            nextLaunchAt = 0;
                            if (requestedDisplay > 0) display = requestedDisplay;
                            if (display <= 0) { Activity activity = launcher.get(); display = activity == null ? -1 : displayOf(activity); }
                            report(lease,"show-received",display,"SHOW accepted; power="+state(display));
                            int result = attach("show");
                            ok[0] = result != FAILED;
                            reason[0] = result == ATTACHED
                                ? "已在背屏中心创建听屿宿主视图，等待首帧"
                                : result == PENDING ? lastFailure + "；等待背屏中心回到背屏" : lastFailure;
                            if (result == FAILED) {report(lease,"blocked",display,lastFailure);release();}
                        } else if (code == RearHostContract.HIDE) {
                            if (lease.equals(requested)) ok[0] = release();
                            else ok[0] = lastReleased.equals(requested);
                            reason[0] = ok[0] ? "宿主视图已移除，原生背屏界面已恢复" : "Host release not confirmed";
                        } else if (lease.equals(requested)) {
                            if (code == RearHostContract.SUSPEND) {
                                suspended = value;
                                if (host != null) host.suspended(value);
                                if (!value) attach("suspend-cleared");
                                ok[0] = true;
                                reason[0] = value ? "宿主让出背屏（相机/应用侧挂起）" : "宿主恢复显示";
                            } else if (code == RearHostContract.PROBE) {
                                ok[0] = attach("probe") != FAILED;
                                reason[0] = ok[0] ? "Host state refreshed" : lastFailure;
                            }
                        }
                        if (host != null) shown[0] = host.displayId();
                        else if (display > 0) shown[0] = display;
                    } catch (Throwable error) {
                        release();
                        reason[0] = "Host operation failed: " + error.getClass().getSimpleName();
                    } finally {
                        done.countDown();
                    }
                };
                if (Looper.myLooper() == Looper.getMainLooper()) work.run(); else main.post(work);
                if (!done.await(2500, TimeUnit.MILLISECONDS)) {
                    boolean invalidated = commands.compareAndSet(token, token + 1);
                    if (invalidated) main.post(() -> { if (commands.get() == token + 1 && lease.equals(requested)) release(); });
                    reason[0] = "Host UI command timed out; release must be acknowledged";
                    ok[0] = false;
                }
                reply.writeNoException();
                reply.writeInt(ok[0] ? 0 : 1);
                reply.writeInt(shown[0]);
                reply.writeString(reason[0]);
                return true;
            } catch (Throwable error) {
                reply.writeException(new SecurityException(error.getClass().getSimpleName()));
                return true;
            }
        }
    }
}
