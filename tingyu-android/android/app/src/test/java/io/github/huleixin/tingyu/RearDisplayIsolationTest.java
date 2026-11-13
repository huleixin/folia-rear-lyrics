package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// No frame may be exposed during display-0 staging or after migration back to the front.
public class RearDisplayIsolationTest {
    @Test public void requiresAnExplicitMatchingSecondaryDisplay() {
        assertFalse(RearDisplayPolicy.targetDisplay(0, 1));
        assertFalse(RearDisplayPolicy.targetDisplay(0, 0));
        assertFalse(RearDisplayPolicy.targetDisplay(-1, -1));
        assertTrue(RearDisplayPolicy.targetDisplay(1, 1));
        assertFalse(RearDisplayPolicy.targetDisplay(2, 1));
    }
}
