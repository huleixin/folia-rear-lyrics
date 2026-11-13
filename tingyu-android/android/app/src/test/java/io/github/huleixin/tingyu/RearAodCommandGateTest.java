package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// RearAodCommandGateTest.java: replay lost exitAod without overriding physical doze or card identity.
public class RearAodCommandGateTest {
    @Test public void expiredCommandClearsOnlyForVerifiedAwakeUnlockedCard(){
        RearAodCommandGate gate=new RearAodCommandGate();gate.command(true,1000);
        assertTrue(gate.effective(true,true,true,2499));
        assertFalse(gate.effective(true,true,true,2500));
        assertEquals(RearCardRenderPolicy.Mode.NORMAL,new RearCardRenderPolicy.Transition().resolve(true,true,true,true,true,true,true,false,false,false,2,2500).mode);
    }
    @Test public void physicalDozeAndLockedOrInactiveCardsKeepTheCommand(){
        RearAodCommandGate gate=new RearAodCommandGate();gate.command(true,0);
        assertTrue(gate.effective(false,true,true,2000));
        assertTrue(gate.effective(true,false,true,2000));
        assertTrue(gate.effective(true,true,false,2000));
        assertEquals(RearCardRenderPolicy.Mode.HIDDEN,new RearCardRenderPolicy.Transition().resolve(true,true,true,true,true,true,true,false,false,true,4,2000).mode);
        assertEquals(RearCardRenderPolicy.Mode.AOD,new RearCardRenderPolicy.Transition().resolve(true,true,true,true,true,true,true,false,true,true,4,2000).mode);
    }
    @Test public void repeatedEnterDoesNotExtendTheDeadlineAndNewExitIsImmediate(){
        RearAodCommandGate gate=new RearAodCommandGate();gate.command(true,0);gate.command(true,1400);
        assertFalse(gate.effective(true,true,true,1500));
        gate.command(true,2000);assertTrue(gate.effective(true,true,true,2100));
        gate.command(false,2200);assertFalse(gate.effective(false,false,false,2200));
    }
}
