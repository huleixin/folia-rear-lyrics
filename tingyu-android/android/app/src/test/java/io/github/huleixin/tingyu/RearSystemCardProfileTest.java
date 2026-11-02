package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearSystemCardProfileTest.java
public class RearSystemCardProfileTest {
    @Test public void onlyAssistantPanelCanAuthorizeLyricEmbedding(){
        assertNull(RearSystemCardProfile.forPanel(426091419L,"com.xiaomi.subscreencenter.MainPanel"));
        assertNull(RearSystemCardProfile.forPanel(26010521L,"com.xiaomi.subscreencenter.MainPanel"));
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
        assertEquals("n2.a",old.musicGate);assertEquals("Z1.V",old.managerClass);assertEquals("k",old.entryDataField);
        assertEquals("A2.a",current.musicGate);assertEquals("k2.V",current.managerClass);assertEquals("l",current.entryDataField);
        assertFalse(current.matchesTypes(Object.class,Object.class));
    }
    @Test public void unknownVersionsNeverInheritAdjacentMappings(){
        for(long version:new long[]{0,-1,26010520,26010522,426091418,426091420,Long.MAX_VALUE})assertNull(RearSystemCardProfile.forVersion(version));
    }
}
