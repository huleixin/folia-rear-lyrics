package io.github.huleixin.tingyu.feedback;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import io.github.huleixin.tingyu.diagnostics.DiagnosticLog;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

// feedback/CloudDiagnosticSnapshot.java: bounded background reads; cloud whitelist applied in Worker.
public final class CloudDiagnosticSnapshot {
    private static final ThreadPoolExecutor READER = new ThreadPoolExecutor(0, 1, 10, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(2), task -> new Thread(task, "tingyu-feedback-read"), new ThreadPoolExecutor.AbortPolicy());
    private CloudDiagnosticSnapshot() {}
    public static void read(android.content.Context context, PluginCall call) {
        try { READER.execute(() -> {
            try {
                JSObject result = new JSObject();
                result.put("events", DiagnosticLog.previousSessionJsonl(160_000) + "\n" + DiagnosticLog.snapshotJsonl());
                result.put("crashes", io.github.huleixin.tingyu.CrashDiagnostics.read(context));
                call.resolve(result);
            } catch (Exception ignored) { call.reject("Diagnostic read failed"); }
        }); } catch (Exception ignored) { call.reject("Diagnostic reader busy"); }
    }
}
