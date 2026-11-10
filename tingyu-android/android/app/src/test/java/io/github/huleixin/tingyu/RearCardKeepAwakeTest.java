package io.github.huleixin.tingyu;

import android.content.Context;
import android.os.Binder;
import android.os.Parcel;
import io.github.huleixin.tingyu.lsp.RearBridgeContract;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowSystemClock;
import java.time.Duration;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearCardKeepAwakeTest.java
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class RearCardKeepAwakeTest {
    @Test public void onlyVerifiedVisibleCardsRenewAndDisablingReleasesTheMatchingSession() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        context.getSharedPreferences("rear_lyrics", 0).edit().putString("backend", "lsp").commit();
        context.getSharedPreferences("rear-card", 0).edit().putBoolean("keep-awake", false).commit();
        LinkedBlockingQueue<String> calls = new LinkedBlockingQueue<>();
        Binder service = new Binder() {
            @Override protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) {
                data.enforceInterface(RearBridgeContract.DESCRIPTOR);
                int display = data.readInt(); String session = data.readString(); data.readInt();
                reply.writeNoException(); reply.writeInt(0); reply.writeString("ok");
                calls.add(code + ":" + display + ":" + session); return true;
            }
        };
        java.lang.reflect.Field field = LspRearBridge.class.getDeclaredField("binder"); field.setAccessible(true); field.set(null, service);
        try {
            RearCardKeepAwake.sync(context, "card", 1, true); assertNull(calls.poll(50, TimeUnit.MILLISECONDS));
            context.getSharedPreferences("rear-card", 0).edit().putBoolean("keep-awake", true).commit();
            RearCardKeepAwake.sync(context, "card", 1, true);
            assertEquals(RearBridgeContract.HOLD_CARD_POWER + ":1:card", calls.poll(2, TimeUnit.SECONDS));
            RearCardKeepAwake.sync(context, "card", 1, true); assertNull(calls.poll(50, TimeUnit.MILLISECONDS));
            RearCardKeepAwake.sync(context, "card", 1, false);
            assertEquals(RearBridgeContract.RELEASE_POWER + ":1:card", calls.poll(2, TimeUnit.SECONDS));
            ShadowSystemClock.advanceBy(Duration.ofSeconds(13)); assertFalse(RearCardKeepAwake.active());
        } finally { RearCardKeepAwake.release(); field.set(null, null); }
    }
}
