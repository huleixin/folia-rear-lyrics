package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearHostProgressTest.java
public class RearHostProgressTest {
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
