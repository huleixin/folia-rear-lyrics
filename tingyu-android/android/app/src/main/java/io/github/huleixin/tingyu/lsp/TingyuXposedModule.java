package io.github.huleixin.tingyu.lsp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/TingyuXposedModule.java
/** Framework scope only. Never inject Chromium, rendering loops or music into SystemUI. */
public final class TingyuXposedModule implements IXposedHookLoadPackage {
    private static boolean installed;
    private static final RearDisplayPower power = new RearDisplayPower();
    @Override public void handleLoadPackage(XC_LoadPackage.LoadPackageParam param) {
        if (!"android".equals(param.packageName) || !"android".equals(param.processName)) return;
        power.install(param.classLoader);
        try {
            Class<?> ams = XposedHelpers.findClass("com.android.server.am.ActivityManagerService", param.classLoader);
            XposedBridge.hookAllMethods(ams, "systemReady", new XC_MethodHook() {
                @Override protected void afterHookedMethod(MethodHookParam hook) {
                    if (hook.hasThrowable() || installed) return;
                    try {
                        Context context = (Context) XposedHelpers.getObjectField(hook.thisObject, "mContext");
                        install(context); installed = true;
                    } catch (Throwable error) { XposedBridge.log(error); }
                }
            });
        } catch (Throwable error) { XposedBridge.log(error); }
    }
    private static void install(Context context) {
        HandlerThread thread = new HandlerThread("TingyuRearBridge"); thread.start();
        Handler handler = new Handler(thread.getLooper());
        power.setTimer(context, handler);
        SystemRearBinder service = new SystemRearBinder(context, power);
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent intent) {
                if (!RearBridgeContract.REQUEST.equals(intent.getAction())) return;
                // Receiver is permission protected and delivery is off system_server's main thread.
                try {
                    Bundle extras = new Bundle(); extras.putBinder("service", service);
                    extras.putInt("protocol", RearBridgeContract.VERSION);
                    extras.putString("profile", service.profile());
                    Bundle connected = context.getContentResolver().call(android.net.Uri.parse("content://" + RearBridgeContract.AUTHORITY),
                        "connect", null, extras);
                    if (connected != null) service.watchClient(connected.getBinder("lifeline"), handler);
                } catch (Throwable error) { XposedBridge.log("Tingyu rear handshake: " + error); }
            }
        };
        IntentFilter filter = new IntentFilter(RearBridgeContract.REQUEST);
        if (Build.VERSION.SDK_INT >= 33)
            context.registerReceiver(receiver, filter, RearBridgeContract.PERMISSION, handler, Context.RECEIVER_EXPORTED);
        else context.registerReceiver(receiver, filter, RearBridgeContract.PERMISSION, handler);
    }
}
