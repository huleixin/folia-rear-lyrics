package io.github.huleixin.tingyu.lsp;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/lsp/RearBridgeContractTest.java
public class RearBridgeContractTest {
    @Test public void acceptsOnlyKnownRearPanelsInEitherOrientation() {
        assertTrue(RearBridgeContract.isRearSize(572, 904));
        assertTrue(RearBridgeContract.isRearSize(976, 596));
        assertFalse(RearBridgeContract.isRearSize(1080, 2400));
        assertFalse(RearBridgeContract.isRearSize(1920, 1080));
        assertFalse(RearBridgeContract.isRearSize(600, 900));
    }
    @Test public void acceptsGeneratedSessionsButNotArbitraryExtras() {
        assertTrue(RearBridgeContract.validSession(java.util.UUID.randomUUID().toString()));
        assertFalse(RearBridgeContract.validSession(null));
        assertFalse(RearBridgeContract.validSession(""));
        assertFalse(RearBridgeContract.validSession("x\n-n other.package"));
        assertFalse(RearBridgeContract.validSession("x".repeat(161)));
    }
}
