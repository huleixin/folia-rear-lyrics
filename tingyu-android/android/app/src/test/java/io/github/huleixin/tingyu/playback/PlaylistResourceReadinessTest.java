package io.github.huleixin.tingyu.playback;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/PlaylistResourceReadinessTest.java
// Shared disk records count independently; an unconfirmed negative lyric answer is not a cached file.
@RunWith(RobolectricTestRunner.class) @Config(sdk=34) @GraphicsMode(GraphicsMode.Mode.LEGACY)
public class PlaylistResourceReadinessTest {
    private PlaylistResourceCache cache(Context context,String key)throws Exception{
        PlaylistResourceCache cache=PlaylistResourceCache.get(context);cache.begin("fixture");
        cache.append("fixture",new JSONArray().put(new JSONObject().put("songKey",key).put("title","Fixture").put("artwork","")),0,false);return cache;
    }
    @Test public void existingSharedLyricsReconcileAnUnprocessedManifest()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();PlaylistResourceCache cache=cache(context,"fixture-ready");
        UnifiedLyricsStore store=UnifiedLyricsStore.get(context);
        store.put("fixture-ready","ok","{\"lyric\":\"[00:01.000]hello\"}",false,false,"stage","stage",false,"off");store.flushForTest();
        JSONObject status=cache.status();assertEquals(1,status.getInt("lyricsReady"));assertEquals(1,status.getInt("artworkReady"));assertEquals(1,status.getInt("completed"));
    }
    @Test public void missingLyricsDoNotEraseIndependentArtworkReadiness()throws Exception{
        Context context=ApplicationProvider.getApplicationContext();PlaylistResourceCache cache=cache(context,"fixture-missing");
        JSONObject status=cache.status();assertEquals(0,status.getInt("lyricsReady"));assertEquals(1,status.getInt("artworkReady"));assertEquals(0,status.getInt("completed"));
    }
}
