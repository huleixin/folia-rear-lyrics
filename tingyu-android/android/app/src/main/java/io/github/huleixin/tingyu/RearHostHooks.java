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
    private static Controller controller;
    private static boolean installed;
    private static volatile boolean capabilityReady;
    private static volatile String capability = "not installed";

    public static synchronized void install(ClassLoader loader) {
        if (installed) return;
        installed = true;
        try {
            XposedHelpers.findAndHookMethod(Application.class, "attach", Context.class, new XC_MethodHook() {
                @Override protected void afterHookedMethod(MethodHookParam param) {
                    if (controller == null && param.args.length > 0 && param.args[0] instanceof Context) {
                        controller = new Controller((Context) param.args[0]);
                        log("controller attached to " + ((Context) param.args[0]).getPackageName());
                    }
                }
            });
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
            capabilityReady = hooks >= 2;
            capability = (launcher == null ? "launcher-class-missing" : "launcher=" + launcherClass)
                + ", lifecycleHooks=" + hooks;
        } catch (Throwable error) {
            capabilityReady = false;
            capability = "hook install failed: " + error.getClass().getSimpleName();
        }
        log("install capability=" + capability + " ready=" + capabilityReady);
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

    /** 只认背屏中心自己的桌面窗口：别的 Activity（哪怕是同进程）一律不参与宿主判定。 */
    private static boolean isLauncher(Activity activity) {
        String name = activity.getClass().getName();
        return RearHostContract.TARGET.equals(activity.getPackageName())
            && (name.equals(launcherClass) || name.endsWith("SubScreenLauncher"));
    }

    private static void log(String message) {
        XposedBridge.log(TAG + ": " + message);
    }

    private static final class Controller extends Binder implements RearHostView.Events {
        private static final int ATTACHED = 1, PENDING = 0, FAILED = -1;

        private final Context context;
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
        private int display = -1, rebinds, launches;
        private long nextLaunchAt, pausedAt;
        private String lastFailure = "背屏中心 launcher 尚未出现";

        Controller(Context context) {
            this.context = context.getApplicationContext();
            attachInterface(null, RearHostContract.DESCRIPTOR);
            BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent intent) {
                    if (RearHostContract.REQUEST.equals(intent.getAction())) register();
                }
            };
            IntentFilter filter = new IntentFilter(RearHostContract.REQUEST);
            if (Build.VERSION.SDK_INT >= 33) {
                this.context.registerReceiver(receiver, filter, RearHostContract.APP + ".permission.LSP_CONNECT", main, Context.RECEIVER_EXPORTED);
            } else {
                this.context.registerReceiver(receiver, filter, RearHostContract.APP + ".permission.LSP_CONNECT", main);
            }
        }

        private void register() {            io.execute(() -> {
                try {
                    Bundle bundle = new Bundle();
                    bundle.putBinder("service", this);
                    bundle.putInt("protocol", RearHostContract.VERSION);
                    bundle.putString("profile", "背屏中心宿主 v" + RearHostContract.VERSION + " · " + capability);
                    Bundle result = context.getContentResolver().call(Uri.parse("content://" + RearHostContract.AUTHORITY), "register", null, bundle);
                    IBinder next = result == null ? null : result.getBinder("lifeline");
                    if (result != null) appUid = result.getInt("appUid", -1);
                    if (next != null && next != lifeline) {
                        lifeline = next;
                        next.linkToDeath(() -> main.post(() -> {
                            if (lifeline == next) { release(); lifeline = null; }
                        }), 0);
                    }
                } catch (Throwable error) {
                    log("handshake failed: " + error.getClass().getSimpleName());
                }
            });
        }

        // ------------------------------------------------------------ launcher lifecycle

        void resumed(Activity activity) {
            if (Looper.myLooper() != main.getLooper()) { main.post(() -> resumed(activity)); return; }
            int id = displayOf(activity);
            if (id <= 0) { log("ignored launcher on display " + id); return; }
            boolean same = launcher.get() == activity;
            launcher = new WeakReference<>(activity);
            resumed = true;
            display = id;
            pausedAt = 0;
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
            if (!capabilityReady) { lastFailure = "背屏中心宿主 hook 未加载（" + capability + "）"; return FAILED; }
            if (lease.isEmpty()) return FAILED;
            if (suspended) { lastFailure = "宿主正在让位（相机或应用侧挂起）"; return PENDING; }
            Activity activity = launcher.get();
            if (activity == null || activity.isFinishing() || !resumed) {
                lastFailure = "背屏中心 launcher 不在前台";
                requestLauncher(why);
                return PENDING;
            }
            int id = displayOf(activity);
            if (id <= 0) { lastFailure = "背屏中心 launcher 不在背屏上"; return FAILED; }
            display = id;
            int power = state(id);
            if (power != RearHostPolicy.STATE_ON) {
                // 背屏没点亮时不在背屏中心里建视图：点屏是应用侧独立窗口的职责，宿主不抢电源。
                lastFailure = "背屏当前未点亮（state=" + power + "）";
                return FAILED;
            }
            if (host != null && !host.closed() && host.activity() == activity) { host.refresh(); return ATTACHED; }
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
                } catch (Throwable ignored) {}
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
                            int result = attach("show");
                            ok[0] = result != FAILED;
                            reason[0] = result == ATTACHED
                                ? "已在背屏中心创建听屿宿主视图，等待首帧"
                                : result == PENDING ? lastFailure + "；等待背屏中心回到背屏" : lastFailure;
                            if (result == FAILED) release();
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
