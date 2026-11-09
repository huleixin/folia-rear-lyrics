package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearHostEvidenceTest.java
public class RearHostEvidenceTest {
    @Test public void aodPowerChatterDoesNotEraseThePreTapColdStartup(){
        String value=RearHostEvidence.append("","host/connect-request","cold-start-doze");
        for(int i=0;i<500;i++)value=RearHostEvidence.append(value,"host/web-stage","state-"+i);
        assertTrue(value.contains("cold-start-doze"));assertTrue(value.contains("state-499"));
        assertTrue(value.split("\n").length<=96);
    }
    @Test public void retainedStartupResetsOnlyForNewAttemptAndBoundsEveryEntry(){
        String value=RearHostEvidence.append("old attempt\n","host/connect-request","new startup");
        assertFalse(value.contains("old attempt"));
        value=RearHostEvidence.append(value,"host/web-stage","html-complete");
        assertTrue(value.contains("new startup"));assertTrue(value.contains("html-complete"));
        for(int i=0;i<500;i++)value=RearHostEvidence.append(value,"host/paused","x".repeat(2000));
        assertTrue(value.length()<=96*901);assertTrue(value.split("\n").length<=96);
    }
}
