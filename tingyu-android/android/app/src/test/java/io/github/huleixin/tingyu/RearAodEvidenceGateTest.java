package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearAodEvidenceGateTest.java
public class RearAodEvidenceGateTest {
    @Test public void repeatedStatesAreDeduplicatedAndRapidChangesHaveABoundedBurst(){
        RearAodEvidenceGate gate=new RearAodEvidenceGate();
        assertTrue(gate.allow("same",0));
        for(int i=0;i<100;i++)assertFalse(gate.allow("same",i));
        for(int i=1;i<12;i++)assertTrue(gate.allow("edge"+i,i));
        for(int i=0;i<100;i++)assertFalse(gate.allow("overflow"+i,100+i));
        assertEquals(100,gate.takeSuppressed());assertEquals(0,gate.takeSuppressed());
        assertTrue(gate.allow("final",5000));assertFalse(gate.allow("final",6000));
    }
}
