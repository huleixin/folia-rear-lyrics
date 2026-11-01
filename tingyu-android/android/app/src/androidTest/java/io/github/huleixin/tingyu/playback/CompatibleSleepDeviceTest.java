package io.github.huleixin.tingyu.playback;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

// android/app/src/androidTest/java/io/github/huleixin/tingyu/playback/CompatibleSleepDeviceTest.java
@RunWith(AndroidJUnit4.class)
public class CompatibleSleepDeviceTest {
    @Test public void aCompatibleLeaseCanArmTrackModeWithoutExoAndMissingRendererAckIsNotSuccess(){
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
            WebView web=new WebView(context);SleepTimerController timer=SleepTimerController.get(context);
            String lease="instrumented-compatible-output";
            try{
                timer.cancel("test-reset");
                assertTrue(timer.compatibility(web,new JSObject().put("action","claim").put("lease",lease).put("revision",1).put("songKey","online:qq:1").put("playing",true)).optBoolean("accepted"));
                assertTrue(timer.start("track",0).optBoolean("active"));
                JSObject boundary=timer.compatibility(web,new JSObject().put("action","boundary").put("lease",lease).put("revision",2).put("songKey","online:qq:1").put("playing",false));
                assertTrue(boundary.optBoolean("blocked"));assertTrue(timer.snapshot().optBoolean("pausePending"));assertNotEquals("completed",timer.snapshot().optString("reason"));
                assertFalse(timer.compatibility(web,new JSObject().put("action","pause-ack").put("lease","retired").put("ticket",timer.snapshot().optLong("generation")).put("paused",true)).optBoolean("accepted"));
            }finally{
                timer.cancel("test-end");timer.compatibility(web,new JSObject().put("action","release").put("lease",lease).put("paused",true));web.destroy();
            }
        });
    }
}
