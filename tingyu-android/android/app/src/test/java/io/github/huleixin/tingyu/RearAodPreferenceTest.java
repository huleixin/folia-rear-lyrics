package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearAodPreferenceTest.java
public class RearAodPreferenceTest {
    @Test public void unknownIsNotAnExplicitDisableAndCachedPreferencesSurviveIpcFailures(){
        RearAodPreference p=new RearAodPreference();
        assertFalse(p.update(null));assertEquals("unknown",p.status());
        assertTrue(p.update(true));assertEquals("enabled",p.status());
        assertTrue(p.update(null));assertEquals("unavailable-cached",p.status());
        assertFalse(p.update(false));assertEquals("disabled",p.status());
        assertFalse(p.update(null));
        assertTrue(p.update(true));
    }
}
