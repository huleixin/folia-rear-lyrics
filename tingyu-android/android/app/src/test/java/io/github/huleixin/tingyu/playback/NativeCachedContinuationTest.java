package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.net.Uri;
import android.os.Looper;
import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.test.core.app.ApplicationProvider;
import java.io.File;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;
import io.github.huleixin.tingyu.resolver.ResolverRegistry;
import io.github.huleixin.tingyu.resolver.SourceResolution;
import io.github.huleixin.tingyu.resolver.SourceResolver;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/NativeCachedContinuationTest.java
/** Persistent cache -> native resolver -> real engine -> Media3 queue, with no WebView callbacks. */
@RunWith(RobolectricTestRunner.class)
@Config(manifest=Config.NONE, sdk=35)
@LooperMode(LooperMode.Mode.PAUSED)
public class NativeCachedContinuationTest {
    private NativeAudioEngine engine;
    private ExoPlayer player;
    private AudioCacheStore cache;
    private BackgroundContinuation continuation;
    private final AtomicInteger resolutions = new AtomicInteger();
    private final AtomicInteger registrations = new AtomicInteger();

    private void engineField(String name, Object value) throws Exception {
        Field field = NativeAudioEngine.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(engine, value);
    }

    @Before public void setUp() throws Exception {
        NativePlaylist.resetForTest(); QualityPreference.resetForTest(); ResolverRegistry.get().resetForTest();
        continuation = BackgroundContinuation.get(); continuation.cancel(); continuation.resetBudgets();
        continuation.setInlineForTest(true);
        continuation.setRegistrarForTest(url -> { registrations.incrementAndGet(); return "http://127.0.0.1:1/remote-audio/fixture"; });
        ResolverRegistry.get().registerForTest(new SourceResolver() {
            public String id() { return "demo"; }
            public boolean supports(String provider) { return "demo".equals(provider); }
            public SourceResolution resolve(NativePlaylist.Track track, String quality) {
                resolutions.incrementAndGet();
                return SourceResolution.okDirect("https://cdn.example/fixture.flac", quality, 1L);
            }
        });
        Context context = ApplicationProvider.getApplicationContext();
        cache = AudioCacheStore.get(context); cache.awaitWrites(); cache.clear();
        engine = NativeAudioEngine.get(context);
        Field field = NativeAudioEngine.class.getDeclaredField("player"); field.setAccessible(true);
        player = (ExoPlayer) field.get(engine);
        // Seed the initial item before enabling the session; no prepare/network/audio output is needed.
        player.setMediaItem(new MediaItem.Builder().setMediaId("song-0").setUri("https://cdn.example/current.flac").build());
        engineField("sourceId", "background-fixture"); engineField("songKey", "song-0");
        engineField("desiredPaused", false);
    }

    @After public void tearDown() throws Exception {
        continuation.cancel(); continuation.resetBudgets(); continuation.setInlineForTest(false);
        continuation.setRegistrarForTest(null); NativeAudioEngine.releaseIfPresent();
        if (cache != null) { cache.awaitWrites(); cache.clear(); }
        ResolverRegistry.get().resetForTest(); NativePlaylist.resetForTest(); QualityPreference.resetForTest();
    }

    private NativePlaylist.Track track(String key) throws Exception {
        String providerData = new JSONObject().put("audioCacheKeys",
            new JSONObject().put(QualityPreference.get(), "fixture-cache:" + key)).toString();
        return new NativePlaylist.Track(key, "demo", key, "T", "A", "B", 100_000L, "", providerData);
    }

    @Test public void committedCacheFileIsAdoptedByTheRealNativeEngine() throws Exception {
        NativePlaylist.Track first = track("song-0"), next = track("song-1");
        NativePlaylist.get().replace(Arrays.asList(first, next), NativePlaylist.Mode.SEQUENCE, false, 0L, "test");
        String key = AudioCacheStore.key(next, QualityPreference.get());
        assertFalse(key.isEmpty());
        File file = new File(cache.dir, AudioCacheStore.hash(key) + ".audio");
        Files.write(file.toPath(), new byte[16_384]);
        Files.writeString(new File(cache.dir, AudioCacheStore.hash(key) + ".json").toPath(),
            new JSONObject().put("key", key).put("size", file.length()).toString());
        assertEquals(file, cache.lookup(key));
        assertEquals(-1L, engine.msSinceJsWindow());
        int before = continuation.takeoversForTest();
        continuation.consider(engine, "background-tick");
        shadowOf(Looper.getMainLooper()).idle();
        assertEquals(2, player.getMediaItemCount());
        MediaItem adopted = player.getMediaItemAt(1);
        assertEquals(next.songKey, adopted.mediaId);
        assertEquals(Uri.fromFile(file), adopted.localConfiguration.uri);
        assertEquals(0, resolutions.get()); assertEquals(0, registrations.get());
        assertEquals(before + 1, continuation.takeoversForTest());
        continuation.consider(engine, "background-tick");
        shadowOf(Looper.getMainLooper()).idle();
        assertEquals(2, player.getMediaItemCount());
    }
}
