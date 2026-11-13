package io.github.huleixin.tingyu.playback;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import java.io.File;
import java.nio.file.Files;
import static org.junit.Assert.*;

// Real cache migration and short-lived backup miss behavior, with no network access.
@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
public class BackupLyricCacheTest {
    @Test public void oldNegativeCannotDeclareNoLyricsAndMissExpiresBeforeRetry() throws Exception {
        Context context=ApplicationProvider.getApplicationContext();
        java.lang.reflect.Constructor<NativeLyricsRepository> constructor=NativeLyricsRepository.class.getDeclaredConstructor(Context.class);
        constructor.setAccessible(true);
        NativeLyricsRepository repo=constructor.newInstance(context);
        String key="online:netease:backup-test";
        File dir=new File(context.getFilesDir(),"native-lyrics");dir.mkdirs();
        File file=new File(dir,NativeLyricsRepository.sha1(key)+".json");
        JSONObject record=new JSONObject().put("songKey",key).put("status","none").put("source","all-sources").put("at",System.currentTimeMillis());
        Files.write(file.toPath(),record.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertNull(repo.readCache(key));
        record.put("status","miss").put("at",System.currentTimeMillis());Files.write(file.toPath(),record.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertNotNull(repo.readCache(key));
        assertEquals(NativeLyricsRepository.Status.UNRESOLVED,repo.readCache(key).status);
        record.put("at",System.currentTimeMillis()-16000);Files.write(file.toPath(),record.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertNull(repo.readCache(key));
    }
}
