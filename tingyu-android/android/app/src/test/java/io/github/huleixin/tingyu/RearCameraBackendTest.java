package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearCameraBackendTest.java
/** Hardware evidence belongs to Shizuku; Xiaomi owns native-card visibility and camera priority. */
public class RearCameraBackendTest {
    @Test public void nativeCardNeverRegistersCameraAvailabilityEvenBeforeAHostLeaseExists(){
        for(boolean enabled:new boolean[]{false,true})for(boolean dismissed:new boolean[]{false,true}){
            assertFalse(RearCameraPolicy.monitorRequired(true,enabled,dismissed));
            assertEquals(enabled&&!dismissed,RearCameraPolicy.monitorRequired(false,enabled,dismissed));
        }
    }
    @Test public void hardwareBusyAndExitTailStillBlockShizukuButNeverNativeCards(){
        RearCameraPolicy camera=new RearCameraPolicy();camera.start(0);
        camera.available("0",false,100);
        for(long now:new long[]{100,1000,10000}){
            assertTrue(camera.blocked(now));
            assertTrue(RearCameraPolicy.blocksPresentation(false,camera.blocked(now)));
            assertFalse(RearCameraPolicy.blocksPresentation(true,camera.blocked(now)));
        }
        camera.available("0",true,11000);
        assertTrue(RearCameraPolicy.blocksPresentation(false,camera.blocked(12000)));
        assertFalse(RearCameraPolicy.blocksPresentation(true,camera.blocked(12000)));
        assertFalse(RearCameraPolicy.blocksPresentation(false,camera.blocked(13500)));
        camera.stop();assertFalse(camera.blocked(14000));
    }
    @Test public void replayBothDiagnosticCameraFailuresWithTheSameVerifiedNativeCard(){
        // Sanitized facts from 1.3.190@01521bb5, seq=3/5: own/root/center/active/bound/
        // associated/attached/shown remain true; AOD command true, physical rear ON/DOZE.
        for(int power:new int[]{2,3}){
            RearCardRenderPolicy.Transition transition=new RearCardRenderPolicy.Transition();
            RearCardRenderPolicy.Decision decision=transition.resolve(true,true,true,true,true,true,true,true,true,true,power,1000);
            assertEquals(RearCardRenderPolicy.Mode.AOD,decision.mode);
            assertEquals("current-card",decision.reason);
            assertFalse(RearCameraPolicy.blocksPresentation(true,true));
        }
    }
    @Test public void tenLockChargeAndDozeCyclesDoNotRequireANewRendererOrLoseAValidCard(){
        RearCardRenderPolicy.Transition transition=new RearCardRenderPolicy.Transition();
        long now=0;
        for(int cycle=0;cycle<10;cycle++)for(int power:new int[]{2,3,4,3,4,3,2}){
            now+=100;
            RearCardRenderPolicy.Decision decision=transition.resolve(true,true,true,true,true,true,true,true,true,false,power,now);
            assertEquals(power==2?RearCardRenderPolicy.Mode.NORMAL:RearCardRenderPolicy.Mode.AOD,decision.mode);
            assertFalse(RearHostPolicy.requiresNewView(true,false,true));
        }
    }
    @Test public void realSystemCardNavigationAndInvalidIdentityStillHideImmediately(){
        for(int invalid=0;invalid<6;invalid++){
            RearCardRenderPolicy.Decision decision=new RearCardRenderPolicy.Transition().resolve(
                invalid!=0,invalid!=1,invalid!=2,invalid!=3,true,invalid!=4,true,true,invalid!=5,true,3,1000);
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,decision.mode);
        }
    }
}
