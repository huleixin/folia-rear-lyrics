package io.github.huleixin.tingyu;

import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
import android.os.SystemClock;
import io.github.huleixin.tingyu.lsp.RearBridgeContract;

// android/app/src/main/java/io/github/huleixin/tingyu/LspRearBridge.java
/** App-side connection. A missing module never silently falls back to another backend. */
final class LspRearBridge {
    private static volatile IBinder binder;
    private static volatile String detail = "等待 LSP 模块连接；请启用听屿模块，作用域勾选系统框架并重启";
    private static long requestedAt;
    static boolean selected(Context context) {
        return "lsp".equals(context.getSharedPreferences("rear_lyrics", 0).getString("backend", "shizuku"));
    }
    static IBinder get() { IBinder value = binder; return value != null && value.isBinderAlive() ? value : null; }
    static String detail() { return detail; }
    static synchronized void accept(Context context, IBinder service, String profile) throws Exception {
        if (service == null || !RearBridgeContract.DESCRIPTOR.equals(service.getInterfaceDescriptor()))
            throw new SecurityException("Invalid LSP rear service");
        service.linkToDeath(() -> {
            synchronized (LspRearBridge.class) {
                if (binder != service) return;
                binder = null; detail = "LSP 系统服务已断开，等待重新连接";
            }
            RearLyricsCoordinator.get(context).windowChanged();
        }, 0);
        binder = service; detail = profile;
        RearLyricsCoordinator.get(context).lspConnected();
    }
    static synchronized void request(Context context) {
        if (get() != null) return;
        long now = SystemClock.elapsedRealtime();
        if (requestedAt != 0 && now - requestedAt < 5000) return;
        requestedAt = now;
        context.sendBroadcast(new Intent(RearBridgeContract.REQUEST).setPackage("android"));
    }
}
