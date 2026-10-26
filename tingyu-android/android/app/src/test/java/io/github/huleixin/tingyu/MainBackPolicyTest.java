package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/MainBackPolicyTest.java
public class MainBackPolicyTest {
    @Test public void unknownNavigationStaysConservative() {
        assertTrue(new MainBackPolicy().needsWebHandler());
    }
    @Test public void onlyCurrentRootStateCanBypassWeb() {
        MainBackPolicy policy = new MainBackPolicy();
        policy.update(false, 10); assertFalse(policy.needsWebHandler());
        policy.update(true, 12); assertTrue(policy.needsWebHandler());
        policy.update(false, 11); assertTrue(policy.needsWebHandler());
        policy.update(false, 12); assertTrue(policy.needsWebHandler());
        policy.update(false, 13); assertFalse(policy.needsWebHandler());
    }
}
