package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearHostPolicyTest.java
public class RearHostPolicyTest {
    @Test public void onlyOwnMusicOnTheRearDisplayMayBeOwned(){
        assertTrue(RearHostPolicy.eligible(RearHostContract.APP,true,false,true,1));
        for(String other:new String[]{"com.other.music","com.android.systemui","",null})assertFalse(RearHostPolicy.eligible(other,true,false,true,1));
        assertFalse(RearHostPolicy.eligible(RearHostContract.APP,true,false,true,0));
        assertFalse(RearHostPolicy.eligible(RearHostContract.APP,true,true,true,1));
        assertFalse(RearHostPolicy.eligible(RearHostContract.APP,false,false,true,1));
        assertFalse(RearHostPolicy.eligible(RearHostContract.APP,true,false,false,1));
    }
    @Test public void aGestureAloneNeverDeclaresTheSystemCardDismissed(){
        assertFalse(RearHostPolicy.userExit(true,false,false,100,120));
        assertTrue(RearHostPolicy.userExit(true,true,false,100,120));
        assertFalse(RearHostPolicy.userExit(true,true,true,100,120));
        assertFalse(RearHostPolicy.userExit(false,true,false,100,120));
        assertFalse(RearHostPolicy.userExit(true,true,false,-1,120));
        assertFalse(RearHostPolicy.userExit(true,true,false,100,2000));
    }
    @Test public void aDismissalSurvivesPlaybackCameraAndBackendChangesUntilExplicitEnable(){
        for(int songs=0;songs<50;songs++){
            assertFalse(RearDisplayPolicy.wanted(true,true,false));
            assertFalse(RearHostPolicy.eligible(RearHostContract.APP,RearDisplayPolicy.wanted(true,true,false),false,true,1));
        }
        assertTrue(RearDisplayPolicy.wanted(true,false,false));
        assertFalse(RearDisplayPolicy.wanted(true,false,true));
    }
    @Test public void oldSessionAndReleaseCallbacksCannotCloseTheReplacement(){
        assertFalse(RearDisplayPolicy.matching("session-old","session-new"));
        assertFalse(RearDisplayPolicy.closeCallback(1,2,true));
        assertFalse(RearDisplayPolicy.closeCallback(2,2,false));
        assertTrue(RearDisplayPolicy.closeCallback(2,2,true));
    }
    @Test public void aodAndOffSuspendTheRendererWithoutChangingPlaybackIntent(){
        for(int state:new int[]{0,1,3,4})assertFalse(RearDisplayPolicy.render(true,true,false,false,state));
        assertTrue(RearDisplayPolicy.render(true,true,false,false,2));
        assertFalse(RearDisplayPolicy.render(true,true,true,false,2));
    }
    @Test public void displaySessionTokensAreBounded(){
        assertTrue(RearHostPolicy.validSession(java.util.UUID.randomUUID().toString()));
        assertFalse(RearHostPolicy.validSession(""));assertFalse(RearHostPolicy.validSession("../token"));assertFalse(RearHostPolicy.validSession("x".repeat(81)));
    }
    @Test public void delayedHandshakeCannotStartAfterCancelOrTemporaryLossOfIntent(){
        assertTrue(RearHostPolicy.mayStart(7,7,true));
        assertFalse(RearHostPolicy.mayStart(7,8,true));
        assertFalse(RearHostPolicy.mayStart(7,7,false));
        assertFalse(RearHostPolicy.mayStart(7,8,false));
    }
}
