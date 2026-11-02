package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearHostContextTest.java
public class RearHostContextTest {
    @Test public void earlyAttachRetainsItsNonNullContext() {
        Object attached = new Object();
        assertSame(attached, RearHostContext.select(null, attached));
    }
    @Test public void initializedApplicationIsPreferred() {
        Object app = new Object();
        assertSame(app, RearHostContext.select(app, new Object()));
    }
    @Test(expected=NullPointerException.class) public void missingContextFailsBeforeControllerIsSaved() {
        RearHostContext.select(null, null);
    }
}
