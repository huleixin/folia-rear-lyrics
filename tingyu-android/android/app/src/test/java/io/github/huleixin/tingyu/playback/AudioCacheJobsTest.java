package io.github.huleixin.tingyu.playback;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import java.lang.reflect.Constructor;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import static org.junit.Assert.*;

// Exercise the durable database without network downloads or mocked media verification.
@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
public class AudioCacheJobsTest {
    private AudioCacheJobs open(Context context) throws Exception {
        Constructor<AudioCacheJobs> constructor=AudioCacheJobs.class.getDeclaredConstructor(Context.class);
        constructor.setAccessible(true);return constructor.newInstance(context);
    }
    private JSONObject track(String route) throws Exception {
        return new JSONObject().put("songKey","online:qq:id").put("providerId","qq").put("mediaId","id")
            .put("sourceId","qq-original").put("title","Fixture").put("artist","Artist").put("durationMs",120000)
            .put("providerData",new JSONObject().put("audioCacheRoute",route)
                .put("audioCacheKeys",new JSONObject().put("standard","offline_v1_standard_"+route+"_online:qq:id")));
    }
    private void close(AudioCacheJobs jobs) {jobs.stop();jobs.io.shutdownNow();jobs.bulk.shutdownNow();jobs.db.close();}
    @Test public void duplicatePagesCancellationAndSourceChangesRemainDurable() throws Exception {
        Context context=ApplicationProvider.getApplicationContext();context.deleteDatabase("audio-cache-jobs.db");
        AudioCacheJobs jobs=open(context);String route=new String(new char[64]).replace("\0","a");
        try {
            jobs.cache.configure(new JSONObject().put("enabled",true));jobs.sourceChanged(route);
            JSONArray tracks=new JSONArray().put(track(route));
            JSONObject page=new JSONObject().put("collection","qq:playlist").put("cacheRoute",route).put("quality","standard")
                .put("descriptor",new JSONObject().put("source","online").put("providerId","qq").put("type","playlist").put("id","playlist"))
                .put("tracks",tracks).put("offset",50);
            jobs.catalog(page);jobs.catalog(page);
            assertEquals(1,jobs.status().getInt("pending"));assertEquals(50,jobs.status().getJSONArray("catalogs").getJSONObject(0).getInt("offset"));
            jobs.action("cancel");assertEquals(1,jobs.status().getInt("cancelled"));
            jobs.enqueue(tracks,"qq:playlist","standard");assertEquals(1,jobs.status().getInt("pending"));
            jobs.db.execSQL("UPDATE jobs SET state='running'");
            close(jobs);jobs=open(context);assertEquals(1,jobs.status().getInt("pending"));
            jobs.sourceChanged(new String(new char[64]).replace("\0","b"));
            assertEquals(1,jobs.status().getInt("stale"));assertEquals(0,jobs.status().getInt("pending"));
            jobs.action("retry");assertEquals(1,jobs.status().getInt("stale"));
            jobs.enqueue(tracks,"qq:old-playlist","standard");assertEquals(0,jobs.status().getInt("pending"));
            jobs.action("clear");assertEquals(0,jobs.status().getJSONArray("tasks").length());
        } finally {close(jobs);}
    }
}
