package io.github.huleixin.tingyu.chrome;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import io.github.huleixin.tingyu.MainActivity;
import org.junit.Test;
import org.junit.runner.RunWith;

// android/app/src/androidTest/java/io/github/huleixin/tingyu/chrome/InterfaceAppearanceDeviceTest.java
@RunWith(AndroidJUnit4.class)
public class InterfaceAppearanceDeviceTest {
    @Test public void appearanceSwitchKeepsActivityWebViewAndShellAndSurvivesRecreation(){
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        String previous=InterfaceAppearance.mode(context);
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(activity->{
                ComposeChromeHost shell=activity.getNativeShell();
                android.webkit.WebView web=activity.getBridge().getWebView();
                assertNotNull(shell);
                for(String mode:new String[]{"light","dark","system","light"}){
                    shell.setAppearance(mode);
                    assertEquals(mode,InterfaceAppearance.mode(activity));
                    assertSame(shell,activity.getNativeShell());
                    assertSame(web,activity.getBridge().getWebView());
                    assertFalse(activity.isFinishing());
                }
            });
            scenario.recreate();
            scenario.onActivity(activity->{assertEquals("light",InterfaceAppearance.mode(activity));assertTrue(InterfaceAppearance.light(activity));});
            scenario.onActivity(activity->activity.getNativeShell().setAppearance(previous));
        } finally { InterfaceAppearance.save(context,previous); }
    }
}
