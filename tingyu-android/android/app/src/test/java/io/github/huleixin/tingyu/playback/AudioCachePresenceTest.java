package io.github.huleixin.tingyu.playback;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import java.io.File;
import java.lang.reflect.Constructor;
import java.nio.file.Files;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/AudioCachePresenceTest.java
// Presence checks trust only committed file/metadata pairs, not queued or partial downloads.
@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
public class AudioCachePresenceTest {
    private AudioCacheStore store()throws Exception{
        Constructor<AudioCacheStore> ctor=AudioCacheStore.class.getDeclaredConstructor(Context.class);ctor.setAccessible(true);
        AudioCacheStore store=ctor.newInstance((Context)ApplicationProvider.getApplicationContext());store.awaitWrites();store.clear();return store;
    }
    private void committed(AudioCacheStore store,String key,int size)throws Exception{
        Files.write(new File(store.dir,AudioCacheStore.hash(key)+".audio").toPath(),new byte[size]);
        Files.writeString(new File(store.dir,AudioCacheStore.hash(key)+".json").toPath(),new JSONObject().put("key",key).put("size",size).toString());
    }
    @Test public void missingPartialAndMismatchedFilesNeverReceiveCachedMarks()throws Exception{
        AudioCacheStore store=store();String key="current";committed(store,key,16);
        assertEquals(1,store.available(new JSONArray().put(key).put("other-quality")).length());
        new File(store.dir,AudioCacheStore.hash(key)+".audio").delete();assertFalse(store.isComplete(key));
        committed(store,key,16);Files.write(new File(store.dir,AudioCacheStore.hash(key)+".audio").toPath(),new byte[8]);assertFalse(store.isComplete(key));store.clear();
    }
    @Test public void variantsCountAsOneSongAndCompletedFilesAreNotEvictedByOldLimits()throws Exception{
        AudioCacheStore store=store();String route=new String(new char[64]).replace("\0","a");
        String one="offline_v1_lossless_"+route+"_online:qq:one",two="offline_v1_high_"+route+"_online:qq:one";
        committed(store,one,16);committed(store,two,16);store.prefs.edit().putInt("limitGb",0).apply();
        java.lang.reflect.Method prune=AudioCacheStore.class.getDeclaredMethod("prune",long.class);prune.setAccessible(true);prune.invoke(store,0L);
        assertEquals(1,store.status().getInt("cached"));assertEquals(32,store.status().getLong("bytes"));assertTrue(store.isComplete(one));assertTrue(store.isComplete(two));
        store.configure(new JSONObject().put("limitGb",1));store.awaitWrites();assertFalse(store.prefs.contains("limitGb"));assertFalse(store.status().has("limitGb"));store.clear();
    }
    @Test public void accumulatedUsageBeyondEightGiBDoesNotRejectNewAudio()throws Exception{
        AudioCacheStore store=store();store.configure(new JSONObject().put("enabled",true).put("wifiOnly",false));store.awaitWrites();
        java.lang.reflect.Field used=AudioCacheStore.class.getDeclaredField("usedBytes");used.setAccessible(true);used.setLong(store,9L*1024*1024*1024);
        store.bind("https://example.invalid/audio","key","qq",120000,"lossless");
        assertNotNull(store.open("https://example.invalid/audio",0,65536,"audio/flac","fixture"));store.clear();
    }
}
