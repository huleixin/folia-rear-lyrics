package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

/** Migration must not leave a larger main-screen WebView cropped by the physical rear panel. */
public class RearLyricsViewportGeometryTest {
    @Test public void unchangedRearWindow() {
        assertArrayEquals(new int[] {0, 0, 904, 572}, RearLyricsViewportGeometry.fit(904, 572, 0, 0, 904, 572));
    }
    @Test public void retainedMainWindowIsFittedOnBothAxes() {
        assertArrayEquals(new int[] {0, 0, 904, 572}, RearLyricsViewportGeometry.fit(1080, 2400, 0, 0, 904, 572));
    }
    @Test public void partiallyOffsetWindowStartsAtPhysicalPanelOrigin() {
        assertArrayEquals(new int[] {20, 30, 904, 572}, RearLyricsViewportGeometry.fit(1080, 2400, -20, -30, 904, 572));
    }
    @Test public void smallerUsableWindowIsNotStretched() {
        assertArrayEquals(new int[] {0, 0, 840, 530}, RearLyricsViewportGeometry.fit(840, 530, 30, 20, 904, 572));
    }
}
