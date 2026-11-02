package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearSystemCardProfileTest.java
public class RearSystemCardProfileTest {
    @Test public void mainAndAssistantPanelsUseSeparateHolderAndMethodContracts(){
        RearSystemCardProfile p=RearSystemCardProfile.forPanel(426091419L,"com.xiaomi.subscreencenter.MainPanel");
        assertNotNull(p);assertEquals("t",p.bindMethod);assertEquals("k2.y",p.holderClass);
        assertEquals("k",p.holdersField);assertEquals("q",p.activeField);
        assertEquals("e",p.holderWidgetField);assertEquals("b",p.holderSlotField);
        assertEquals(boolean.class,p.parameters()[2]);
        RearSystemCardProfile old=RearSystemCardProfile.forPanel(26010521L,"com.xiaomi.subscreencenter.MainPanel");
        assertEquals("q",old.bindMethod);assertEquals("Z1.x",old.holderClass);assertEquals("j",old.holdersField);
        assertEquals("p",old.activeField);
        assertSame(RearSystemCardProfile.SEPTEMBER,RearSystemCardProfile.forPanel(426091419L,"com.xiaomi.subscreencenter.SmartAssistantPanel"));
        assertEquals(int.class,RearSystemCardProfile.SEPTEMBER.parameters()[2]);
        assertNull(RearSystemCardProfile.forPanel(426091419L,"android.widget.FrameLayout"));
        assertNull(RearSystemCardProfile.forPanel(426091420L,"com.xiaomi.subscreencenter.MainPanel"));
    }
    @Test public void knownVersionsUseDistinctVerifiedBindings(){
        RearSystemCardProfile old=RearSystemCardProfile.forVersion(26010521L);
        RearSystemCardProfile current=RearSystemCardProfile.forVersion(426091419L);
        assertNotNull(old);assertNotNull(current);
        assertEquals("n",old.bindMethod);assertEquals("Z1.s0",old.holderClass);assertEquals("r2.r",old.widgetClass);
        assertEquals("y",current.bindMethod);assertEquals("k2.o0",current.holderClass);assertEquals("E2.w",current.widgetClass);
        assertFalse(current.matchesTypes(Object.class,Object.class));
    }
    @Test public void unknownVersionsNeverInheritAdjacentMappings(){
        for(long version:new long[]{0,-1,26010520,26010522,426091418,426091420,Long.MAX_VALUE})assertNull(RearSystemCardProfile.forVersion(version));
    }
}
