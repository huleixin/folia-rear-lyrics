package io.github.huleixin.tingyu.playback;

import android.graphics.Bitmap;
import androidx.test.core.app.ApplicationProvider;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/InlineArtworkCacheTest.java
@RunWith(RobolectricTestRunner.class)
@Config(manifest=Config.NONE, sdk=34)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
public class InlineArtworkCacheTest {
    private static final String IMAGE="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1cAAAAASUVORK5CYII=";
    @Test public void repeatedInlineCoversReuseOneBitmapAcrossTracksAndCachePeeks(){
        NativeArtworkRepository repo=NativeArtworkRepository.get(ApplicationProvider.getApplicationContext());
        repo.clearDownloadable();
        NativeArtworkRepository.Result first=repo.load("local:first",IMAGE);
        assertEquals(NativeArtworkRepository.Status.FETCHED,first.status);
        assertNotNull(first.bitmap);
        NativeArtworkRepository.Result second=repo.load("local:second",IMAGE);
        assertEquals(NativeArtworkRepository.Status.CACHE_HIT,second.status);
        assertSame(first.bitmap,second.bitmap);
        assertSame(first.bitmap,repo.peek("local:second"));
        assertSame(first.bitmap,repo.readCache("local:first").bitmap);
        assertTrue(repo.matches("local:second",IMAGE));
        assertFalse(repo.matches("local:second",IMAGE+"other"));
        assertFalse(first.bitmap.isRecycled());
        repo.clearDownloadable();
    }
    @Test public void rejectsOversizeInlineDataBeforeAllocatingDecodedBytes(){
        NativeArtworkRepository repo=NativeArtworkRepository.get(ApplicationProvider.getApplicationContext());
        String huge="data:image/jpeg;base64,"+"A".repeat(9*1024*1024);
        assertEquals(NativeArtworkRepository.Status.TOO_LARGE,repo.load("local:huge",huge).status);
        assertNull(repo.peek("local:huge"));
    }
}
