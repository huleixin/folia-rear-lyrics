package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearNativeCardPolicyTest.java
public class RearNativeCardPolicyTest {
    @Test public void onlyOwnSelectedMediaCanPassIdentityGate(){
        assertTrue(RearNativeCardPolicy.ownMedia(RearHostContract.APP));
        assertFalse(RearNativeCardPolicy.ownMedia(null));
        assertFalse(RearNativeCardPolicy.ownMedia("com.other.player"));
    }
    @Test public void absenceIdentityAndRestoreFailuresAreDistinguished(){
        assertTrue(RearNativeCardPolicy.blocker(false,null,false).contains("unavailable"));
        assertTrue(RearNativeCardPolicy.blocker(true,null,true).contains("no selected"));
        assertTrue(RearNativeCardPolicy.blocker(true,"com.other.player",true).contains("prohibited"));
        assertTrue(RearNativeCardPolicy.blocker(true,RearHostContract.APP,false).contains("incomplete"));
        assertTrue(RearNativeCardPolicy.blocker(true,RearHostContract.APP,true).contains("not enabled"));
    }
}
