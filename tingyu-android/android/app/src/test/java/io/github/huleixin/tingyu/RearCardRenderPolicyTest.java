package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearCardRenderPolicyTest.java
public class RearCardRenderPolicyTest {
    @Test public void readyAndPreFenceDrawDoNotAuthorizeFirstFrameHandoff(){
        RearCardRenderPolicy.FrameEvidence f=new RearCardRenderPolicy.FrameEvidence();
        f.begin(1);assertFalse(f.recordDraw(1));assertFalse(f.drawn(1));
        assertTrue(f.visualReady(1));assertFalse(f.drawn(1));
        assertTrue(f.recordDraw(1));assertTrue(f.drawn(1));
    }
    @Test public void staleVisualCallbacksCannotAuthorizeAResumedMode(){
        RearCardRenderPolicy.FrameEvidence f=new RearCardRenderPolicy.FrameEvidence();
        f.begin(1);f.visualReady(1);f.recordDraw(1);
        f.begin(2);assertFalse(f.visualReady(1));assertFalse(f.recordDraw(1));
        assertFalse(f.recordDraw(2));assertFalse(f.drawn(2));
        assertTrue(f.visualReady(2));assertTrue(f.recordDraw(2));
    }
    private RearCardRenderPolicy.Decision resolve(RearCardRenderPolicy.Transition t,int power,long now,
            boolean center,boolean active,boolean shown,boolean owned,boolean own,boolean follow){
        return t.resolve(true,own,true,center,active,true,shown,owned,follow,false,power,now);
    }
    @Test public void onlyVerifiedAlreadyOwnedCentralCardGetsABoundedAodVisibilityBridge(){
        RearCardRenderPolicy.Transition t=new RearCardRenderPolicy.Transition();
        assertEquals(RearCardRenderPolicy.Mode.NORMAL,resolve(t,2,0,true,true,true,true,true,true).mode);
        assertEquals(RearCardRenderPolicy.Mode.AOD,resolve(t,3,100,true,false,false,true,true,true).mode);
        // DOZE_SUSPEND and further visibility callbacks cannot renew the original deadline.
        assertEquals(1400,resolve(t,4,200,true,false,false,true,true,true).remainingMs);
        assertEquals(1,resolve(t,4,1599,true,false,false,true,true,true).remainingMs);
        assertEquals(RearCardRenderPolicy.Mode.HIDDEN,resolve(t,4,1600,true,false,false,true,true,true).mode);
        assertEquals(RearCardRenderPolicy.Mode.AOD,resolve(t,4,1700,true,true,true,true,true,true).mode);
        assertEquals(RearCardRenderPolicy.Mode.NORMAL,resolve(t,2,1800,true,true,true,true,true,true).mode);
    }
    @Test public void userNavigationDisabledPreferenceAndMediaLossCannotUseTheBridge(){
        for(int failure=0;failure<4;failure++){
            RearCardRenderPolicy.Transition t=new RearCardRenderPolicy.Transition();
            resolve(t,2,0,true,true,true,true,true,true);
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,
                resolve(t,3,100,failure!=0,false,false,failure!=1,failure!=2,failure!=3).mode);
        }
        RearCardRenderPolicy.Transition t=new RearCardRenderPolicy.Transition();
        assertEquals(RearCardRenderPolicy.Mode.HIDDEN,resolve(t,2,0,true,false,false,true,true,true).mode);
    }
    @Test public void offInvalidBindingDetachedAndExpiredLeaseAlwaysWin(){
        for(int failure=0;failure<4;failure++){
            RearCardRenderPolicy.Transition t=new RearCardRenderPolicy.Transition();
            resolve(t,2,0,true,true,true,true,true,true);
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,t.resolve(failure!=0,true,failure!=1,true,false,
                failure!=2,false,true,true,true,failure==3?1:3,100).mode);
        }
    }
    @Test public void rapidPowerEdgesAndSystemCardReturnNeverBecomeAnUnboundedLease(){
        RearCardRenderPolicy.Transition t=new RearCardRenderPolicy.Transition();
        for(int i=0;i<200;i++){
            long now=i*10000L;
            assertEquals(RearCardRenderPolicy.Mode.NORMAL,resolve(t,2,now,true,true,true,true,true,true).mode);
            assertEquals(RearCardRenderPolicy.Mode.AOD,resolve(t,3,now+100,true,true,true,true,true,true).mode);
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,resolve(t,4,now+200,false,true,true,true,true,true).mode);
            assertEquals(RearCardRenderPolicy.Mode.AOD,resolve(t,4,now+300,true,true,true,false,true,true).mode);
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,resolve(t,1,now+400,true,true,true,true,true,true).mode);
        }
    }
    @Test public void systemOffWinsOverAodCommand(){
        for(int power:new int[]{0,1})assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(true,true,true,true,true,power));
    }
    @Test public void normalDozeAndResumeRespectSystemAndPreference(){
        assertEquals(RearCardRenderPolicy.Mode.NORMAL,RearCardRenderPolicy.mode(true,true,true,true,false,2));
        for(int power:new int[]{2,3,4})assertEquals(RearCardRenderPolicy.Mode.AOD,RearCardRenderPolicy.mode(true,true,true,true,true,power));
        for(int power:new int[]{3,4}){
            assertEquals(RearCardRenderPolicy.Mode.AOD,RearCardRenderPolicy.mode(true,true,true,true,false,power));
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(true,true,true,false,false,power));
        }
    }
    @Test public void collapsedRetiredAndOtherSessionCannotDisplayAod(){
        for(int power:new int[]{2,3,4}){
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(false,true,true,true,true,power));
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(true,false,true,true,true,power));
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(true,true,false,true,true,power));
            assertEquals(RearCardRenderPolicy.Mode.AOD,RearCardRenderPolicy.mode(true,true,true,true,true,power));
        }
    }
}
