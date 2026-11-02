package io.github.huleixin.tingyu;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/androidTest/java/io/github/huleixin/tingyu/RearHostContextInstrumentedTest.java
public class RearHostContextInstrumentedTest {
    @Test public void nullApplicationContextStillSupportsReceiverAndResolver() {
        Context base = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Context early = new ContextWrapper(base) {
            @Override public Context getApplicationContext() { return null; }
        };
        Context resolved = RearHostContext.resolve(early);
        assertSame(early, resolved);
        assertNotNull(resolved.getContentResolver());
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {}
        };
        IntentFilter filter = new IntentFilter(base.getPackageName()+".context-test");
        if (Build.VERSION.SDK_INT >= 33) resolved.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else resolved.registerReceiver(receiver, filter);
        resolved.unregisterReceiver(receiver);
    }
}
