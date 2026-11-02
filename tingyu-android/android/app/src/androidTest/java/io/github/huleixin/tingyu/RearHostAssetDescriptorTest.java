package io.github.huleixin.tingyu;

import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/androidTest/java/io/github/huleixin/tingyu/RearHostAssetDescriptorTest.java
/** Uses the actual packaged APK. Deferred JS readers must not prevent HTML from reaching EOF. */
public class RearHostAssetDescriptorTest {
    @Test public void deferredModuleReadersDoNotBlockMainDocument() throws Exception {
        AssetManager assets=InstrumentationRegistry.getInstrumentation().getTargetContext().getAssets();
        String[] files=assets.list("public/assets");
        String first=null,second=null;
        for(String file:files)if(file.endsWith(".js")){if(first==null)first=file;else{second=file;break;}}
        assertNotNull(first);assertNotNull(second);
        try(AssetFileDescriptor a=assets.openFd("public/assets/"+first);
            AssetFileDescriptor b=assets.openFd("public/assets/"+second);
            AssetFileDescriptor html=assets.openFd("public/rear-lyrics.html");
            InputStream stream=html.createInputStream()) {
            // Keep both module descriptors open and unread; consume HTML independently and bounded.
            byte[] buffer=new byte[4096];long size=0;int count;
            while((count=stream.read(buffer))!=-1){size+=count;assertTrue(size<=html.getLength());}
            assertEquals(html.getLength(),size);assertTrue(size>0);
        }
    }
}
