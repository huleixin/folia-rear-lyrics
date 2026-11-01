package io.github.huleixin.tingyu.playback;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import android.net.Uri;
import java.io.File;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

// android/app/src/androidTest/java/io/github/huleixin/tingyu/playback/AudioCacheDataSourceDeviceTest.java
@RunWith(AndroidJUnit4.class)
public class AudioCacheDataSourceDeviceTest {
    @Test public void media3ReadsAndSeeksPrivateStagedBytesWithoutHttp()throws Exception{
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File root=new File(context.getCacheDir(),"audio-stage-instrumentation");
        AudioCacheStaging stage=new AudioCacheStaging(root);byte[] original=new byte[65536];
        for(int i=0;i<original.length;i++)original[i]=(byte)(i%251);
        String token=stage.begin(original.length);stage.append(token,0,original);File file=stage.finish(token);
        DataSource source=new DefaultDataSource.Factory(context).createDataSource();
        try{
            assertEquals(original.length-100,source.open(new DataSpec.Builder().setUri(Uri.fromFile(file)).setPosition(100).build()));
            byte[] bytes=new byte[4096];assertEquals(bytes.length,source.read(bytes,0,bytes.length));
            for(int i=0;i<bytes.length;i++)assertEquals(original[i+100],bytes[i]);
        }finally{source.close();stage.release(token);}
    }
}
