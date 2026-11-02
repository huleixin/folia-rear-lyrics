package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearSystemCardPolicyTest.java
public class RearSystemCardPolicyTest {
    @Test public void systemNormalizedCreatorStillRequiresRealOwnEmbeddedMediaIdentity(){
        // First V.d normalizes creator; later V.f updates carry the actual app creator.
        for(String creator:new String[]{"unified.music",RearHostContract.APP}){
            assertTrue(RearSystemCardPolicy.registered("unified.music","music",creator,RearHostContract.APP,true));
            assertTrue(RearSystemCardPolicy.eligible("unified.music","music",creator,RearHostContract.APP,true,true,true));
            for(String media:new String[]{null,"","com.other.player","unified.music"}){
                assertFalse(RearSystemCardPolicy.registered("unified.music","music",creator,media,true));
                assertFalse(RearSystemCardPolicy.eligible("unified.music","music",creator,media,true,true,true));
            }
        }
    }
    @Test public void themeCanvasWithoutBusinessRecordIsNeverEligible(){
        assertFalse(RearSystemCardPolicy.eligible(null,null,null,RearHostContract.APP,true,true,true));
        assertFalse(RearSystemCardPolicy.registered(null,null,null,RearHostContract.APP,true));
        assertFalse(RearSystemCardPolicy.registered(null,"music",RearHostContract.APP,RearHostContract.APP,true));
    }
    @Test public void conflictingMetadataCannotBorrowOwnController(){
        assertFalse(RearSystemCardPolicy.registered("unified.music","music","other",RearHostContract.APP,true));
        assertFalse(RearSystemCardPolicy.registered("unified.music","foodDelivery",RearHostContract.APP,RearHostContract.APP,true));
        assertFalse(RearSystemCardPolicy.registered("unified.music","music",RearHostContract.APP,RearHostContract.APP,false));
    }
    @Test public void collapsedRegisteredCardRemainsReachableButCannotClaimVisibleOwnership(){
        assertTrue(RearSystemCardPolicy.registered("unified.music","music",RearHostContract.APP,RearHostContract.APP,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,RearHostContract.APP,true,false,true));
        assertTrue(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,RearHostContract.APP,true,true,true));
        // System recycled the holder, or selected another player: neither may borrow the lease.
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,RearHostContract.APP,true,true,false));
        assertFalse(RearSystemCardPolicy.registered("unified.music","music","other",RearHostContract.APP,true));
    }
    @Test public void ownMusicMustBeTheActiveNativeCenterSlot(){
        assertTrue(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,RearHostContract.APP,true,true,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,RearHostContract.APP,false,true,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,RearHostContract.APP,true,false,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music",RearHostContract.APP,RearHostContract.APP,true,true,false));
    }
    @Test public void anotherPlayerOrBusinessNeverAuthorizesReplacement(){
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music","com.other.player",RearHostContract.APP,true,true,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","music",null,RearHostContract.APP,true,true,true));
        assertFalse(RearSystemCardPolicy.eligible("unified.music","foodDelivery",RearHostContract.APP,RearHostContract.APP,true,true,true));
        assertFalse(RearSystemCardPolicy.eligible(RearHostContract.APP,"music",RearHostContract.APP,RearHostContract.APP,true,true,true));
    }
}
