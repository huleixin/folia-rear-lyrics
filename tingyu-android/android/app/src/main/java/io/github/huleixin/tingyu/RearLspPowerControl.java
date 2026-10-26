package io.github.huleixin.tingyu;

import android.os.Handler;
import android.os.IBinder;
import android.os.Parcel;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import io.github.huleixin.tingyu.lsp.RearBridgeContract;

// android/app/src/main/java/io/github/huleixin/tingyu/RearLspPowerControl.java
/** Serialize lease/release operations; a release remains valid after its Activity has closed. */
final class RearLspPowerControl {
    interface Callback { void complete(boolean success, String detail); }
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    static void apply(Handler main, IBinder service, int display, String session, boolean hold, Callback callback) {
        WORKER.execute(() -> {
            boolean success = false; String detail;
            Parcel request = Parcel.obtain(), reply = Parcel.obtain();
            try {
                if (display <= 0 || !RearBridgeContract.validSession(session)) throw new IllegalStateException("No rear session");
                if (hold && !RearLyricsActivity.isCurrentSession(session)) throw new IllegalStateException("Cancelled rear session");
                if (service == null || !service.isBinderAlive()) throw new IllegalStateException("LSP disconnected");
                request.writeInterfaceToken(RearBridgeContract.DESCRIPTOR);
                request.writeInt(display); request.writeString(session); request.writeInt(-1);
                if (!service.transact(hold ? RearBridgeContract.HOLD_POWER : RearBridgeContract.RELEASE_POWER, request, reply, 0))
                    throw new IllegalStateException("Reboot to load the updated LSP module");
                reply.readException();
                int result = reply.readInt(); detail = reply.readString(); success = result == 0;
            } catch (Exception error) { detail = error.toString(); }
            finally { request.recycle(); reply.recycle(); }
            boolean ok = success; String message = detail;
            main.post(() -> callback.complete(ok, message));
        });
    }
}
