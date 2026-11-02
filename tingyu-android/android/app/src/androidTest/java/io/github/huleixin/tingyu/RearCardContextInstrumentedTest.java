package io.github.huleixin.tingyu;

import android.content.Context;
import android.content.ContextWrapper;
import android.view.ContextThemeWrapper;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/androidTest/java/io/github/huleixin/tingyu/RearCardContextInstrumentedTest.java
public class RearCardContextInstrumentedTest {
    @Test public void wrappedCardContextWithoutLauncherSupportsRendererCreation(){
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
            Context app=InstrumentationRegistry.getInstrumentation().getTargetContext();
            Context card=new ContextThemeWrapper(new ContextWrapper(app),android.R.style.Theme_Material_NoActionBar);
            assertNull(RearCardContext.activity(card));assertTrue(RearCardContext.usable(card));
            FrameLayout frame=new FrameLayout(card);WebView view=new WebView(card);
            try{frame.addView(view);assertSame(frame,view.getParent());assertSame(card,frame.getContext());}
            finally{frame.removeView(view);view.destroy();}
        });
    }
    @Test public void cyclicOrMissingContextNeverHangs(){
        assertFalse(RearCardContext.usable(null));
        ContextWrapper cycle=new ContextWrapper(null){@Override public Context getBaseContext(){return this;}};
        assertNull(RearCardContext.activity(cycle));
    }
}
