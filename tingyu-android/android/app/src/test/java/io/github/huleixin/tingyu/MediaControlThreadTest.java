package io.github.huleixin.tingyu;

import android.os.Looper;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.test.core.app.ApplicationProvider;
import io.github.huleixin.tingyu.playback.NativeAudioEngine;
import java.lang.reflect.Field;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

// android/app/src/test/java/io/github/huleixin/tingyu/MediaControlThreadTest.java
@RunWith(RobolectricTestRunner.class)
@Config(manifest=Config.NONE, sdk=35)
@LooperMode(LooperMode.Mode.PAUSED)
public class MediaControlThreadTest {
    @Test public void rearWorkerNextAdvancesPreparedNativeQueueWithoutAWebPlugin() throws Exception {
        NativeAudioEngine engine=NativeAudioEngine.get(ApplicationProvider.getApplicationContext());
        try {
            Field field=NativeAudioEngine.class.getDeclaredField("player");field.setAccessible(true);
            ExoPlayer player=(ExoPlayer)field.get(engine);
            player.setMediaItems(Arrays.asList(
                new MediaItem.Builder().setMediaId("first").setUri("https://example.test/a").build(),
                new MediaItem.Builder().setMediaId("second").setUri("https://example.test/b").build()));
            field=NativeAudioEngine.class.getDeclaredField("sourceId");field.setAccessible(true);field.set(engine,"test-control");
            Thread worker=new Thread(()->FoliaNativePlugin.emitMediaAction("next"));
            worker.start();worker.join();
            assertEquals(0,player.getCurrentMediaItemIndex());
            shadowOf(Looper.getMainLooper()).idle();
            assertEquals(1,player.getCurrentMediaItemIndex());
        } finally { NativeAudioEngine.releaseIfPresent(); }
    }
}
