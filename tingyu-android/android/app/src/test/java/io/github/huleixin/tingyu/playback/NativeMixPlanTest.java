package io.github.huleixin.tingyu.playback;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/NativeMixPlanTest.java
public final class NativeMixPlanTest {
    @Test public void fallbackActuallyHasOverlapAndConstantPower(){
        NativeMixPlan p=NativeMixPlan.resolve("a","b",200000,180000,5,null);
        assertEquals(195000,p.start);assertEquals(5000,p.length);
        for(int i=0;i<=100;i++){double t=i/100.0;double a=NativeMixPlan.incoming(t),b=NativeMixPlan.outgoing(t);assertEquals(1,a*a+b*b,.00001);}
        assertTrue(NativeMixPlan.incoming(.5)>0);assertTrue(NativeMixPlan.outgoing(.5)>0);
    }
    @Test public void onlyTheExactPairCanExecuteAnIntelligentPlan()throws Exception{
        JSONObject plan=new JSONObject().put("fromKey","a").put("toKey","b").put("outStartMs",180000)
            .put("inStartMs",4000).put("overlapMs",12000).put("stretch",1.04);
        NativeMixPlan p=NativeMixPlan.resolve("a","b",200000,180000,5,plan);
        assertEquals("planner",p.source);assertEquals(4000,p.entry);assertEquals(12000,p.length);assertEquals(1.04,p.stretch,.0001);
        assertEquals("native-fallback",NativeMixPlan.resolve("a","c",200000,180000,5,plan).source);
    }
    @Test public void corruptAndShortPlansCannotSeekOutsideTheTrack()throws Exception{
        JSONObject plan=new JSONObject().put("fromKey","a").put("toKey","b").put("outStartMs",999999).put("overlapMs",999999);
        assertEquals("native-fallback",NativeMixPlan.resolve("a","b",200000,180000,5,plan).source);
        assertNull(NativeMixPlan.resolve("a","b",0,180000,5,null));
        assertNull(NativeMixPlan.resolve("a","b",1000,1000,5,null));
        plan.put("fade",false);assertNull(NativeMixPlan.resolve("a","b",200000,180000,5,plan));
    }
}
