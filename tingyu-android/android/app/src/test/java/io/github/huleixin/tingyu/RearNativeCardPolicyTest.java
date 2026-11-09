package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearNativeCardPolicyTest.java
public class RearNativeCardPolicyTest {
    @Test public void samePackageDoesNotAuthorizeAReplacementOrDestroyedMediaSession(){
        assertTrue(RearNativeCardPolicy.sameMediaSession("token-a","token-a",false));
        assertTrue(RearNativeCardPolicy.sameMediaSession(null,"token-a",false));
        assertFalse(RearNativeCardPolicy.sameMediaSession("token-a","token-b",false));
        assertFalse(RearNativeCardPolicy.sameMediaSession("token-a","token-a",true));
        assertFalse(RearNativeCardPolicy.sameMediaSession(null,null,false));
    }
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
        assertTrue(RearNativeCardPolicy.blocker(true,RearHostContract.APP,true).contains("lifecycle checks"));
    }
    @Test public void mountRequiresTheRealVisibleOwnCardOnTheRequestedRearDisplay(){
        String own=RearHostContract.APP;
        assertTrue(RearNativeCardPolicy.mayMount(own,true,true,1,1,904,572));
        assertFalse(RearNativeCardPolicy.mayMount(null,true,true,1,1,904,572));
        assertFalse(RearNativeCardPolicy.mayMount("com.other.player",true,true,1,1,904,572));
        assertFalse(RearNativeCardPolicy.mayMount(own,false,true,1,1,904,572));
        assertFalse(RearNativeCardPolicy.mayMount(own,true,false,1,1,904,572));
        assertFalse(RearNativeCardPolicy.mayMount(own,true,true,0,0,904,572));
        assertFalse(RearNativeCardPolicy.mayMount(own,true,true,2,1,904,572));
        assertFalse(RearNativeCardPolicy.mayMount(own,true,true,1,1,0,572));
        assertFalse(RearNativeCardPolicy.mayMount(own,true,true,1,1,904,0));
    }
    @Test public void hiddenPreparationNeverGrantsVisibleMountOrBypassesMediaAndDisplayIdentity(){
        String own=RearHostContract.APP;
        assertTrue(RearNativeCardPolicy.mayPrepare(own,true,1,1,904,572));
        assertFalse(RearNativeCardPolicy.mayMount(own,true,false,1,1,904,572));
        assertFalse(RearNativeCardPolicy.mayPrepare("other",true,1,1,904,572));
        assertFalse(RearNativeCardPolicy.mayPrepare(own,false,1,1,904,572));
        assertFalse(RearNativeCardPolicy.mayPrepare(own,true,0,0,904,572));
        assertFalse(RearNativeCardPolicy.mayPrepare(own,true,2,1,904,572));
        assertFalse(RearNativeCardPolicy.mayPrepare(own,true,1,1,0,572));
    }
}
