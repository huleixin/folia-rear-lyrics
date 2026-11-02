package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearCardRenderPolicyTest.java
public class RearCardRenderPolicyTest {
    @Test public void systemOffWinsOverAodCommand(){
        for(int power:new int[]{0,1})assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(true,true,true,false,true,true,power));
    }
    @Test public void normalDozeAndResumeRespectSystemAndPreference(){
        assertEquals(RearCardRenderPolicy.Mode.NORMAL,RearCardRenderPolicy.mode(true,true,true,false,true,false,2));
        for(int power:new int[]{2,3,4})assertEquals(RearCardRenderPolicy.Mode.AOD,RearCardRenderPolicy.mode(true,true,true,false,true,true,power));
        for(int power:new int[]{3,4}){
            assertEquals(RearCardRenderPolicy.Mode.AOD,RearCardRenderPolicy.mode(true,true,true,false,true,false,power));
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(true,true,true,false,false,false,power));
        }
    }
    @Test public void cameraCollapsedRetiredAndOtherSessionCannotDisplayAod(){
        for(int power:new int[]{2,3,4}){
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(false,true,true,false,true,true,power));
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(true,false,true,false,true,true,power));
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(true,true,false,false,true,true,power));
            assertEquals(RearCardRenderPolicy.Mode.HIDDEN,RearCardRenderPolicy.mode(true,true,true,true,true,true,power));
        }
    }
}
