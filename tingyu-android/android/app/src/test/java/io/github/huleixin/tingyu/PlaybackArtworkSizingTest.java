package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// PlaybackArtworkSizingTest.java — exercises the actual bounded thumbnail sizing used by the service.
public class PlaybackArtworkSizingTest {
    @Test public void scalesLargeAndPortraitCoversWithoutDistortion() {
        assertArrayEquals(new int[]{512, 256}, PlaybackArtworkSizing.fit(4000, 2000));
        assertArrayEquals(new int[]{256, 512}, PlaybackArtworkSizing.fit(2000, 4000));
        assertEquals(4, PlaybackArtworkSizing.sampleSize(4096, 2048));
    }
    @Test public void doesNotEnlargeSmallImagesAndClampsInvalidOrExtremeSizes() {
        assertArrayEquals(new int[]{120, 80}, PlaybackArtworkSizing.fit(120, 80));
        assertArrayEquals(new int[]{1, 1}, PlaybackArtworkSizing.fit(-1, 0));
        assertArrayEquals(new int[]{512, 1}, PlaybackArtworkSizing.fit(1000000, 1));
        int sample = PlaybackArtworkSizing.sampleSize(Integer.MAX_VALUE, 20);
        assertTrue(Integer.MAX_VALUE / sample <= 1024);
    }
}
