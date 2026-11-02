package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearHostProgressTest.java
public class RearHostProgressTest {
    @Test public void unsupportedHostBeforeCreationRetainsItsBlocker(){
        RearHostProgress p=new RearHostProgress();
        p.update("show-received","");
        p.update("blocked","unsupported system slot profile versionCode=426091419");
        p.update("attaching","probe");
        assertTrue(p.describe().contains("milestone=show-received"));
        assertTrue(p.describe().contains("error=unsupported system slot profile versionCode=426091419"));
        assertFalse(p.describe().contains("milestone=created"));
    }
    @Test public void probeDoesNotEraseCreatedOrActualError(){
        RearHostProgress p=new RearHostProgress();
        p.update("created","view exists");p.update("web-error","script failed");p.update("attaching","probe");
        assertTrue(p.describe().contains("milestone=created"));
        assertTrue(p.describe().contains("waiting=probe"));
        assertTrue(p.describe().contains("error=script failed"));
        p.update("page-ready","");p.update("page-start","");
        assertTrue(p.describe().contains("milestone=page-ready"));
    }
}
