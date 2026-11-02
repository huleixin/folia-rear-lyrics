package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearSystemCardPolicyTest.java
public class RearSystemCardPolicyTest {
    @Test public void ownMusicMustBeTheActiveNativeCenterSlot(){
        assertTrue(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,true,true,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,false,true,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,true,false,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,true,true,false));
    }
    @Test public void anotherPlayerOrBusinessNeverAuthorizesReplacement(){
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music","com.other.player",true,true,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music",null,true,true,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","foodDelivery",RearHostContract.APP,true,true,true));
        assertFalse(RearSystemCardPolicy.eligible(RearHostContract.APP,"music",RearHostContract.APP,true,true,true));
    }
}
