package io.github.huleixin.tingyu.playback;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/NativeRetryPolicyTest.java
public class NativeRetryPolicyTest {
 @Test public void retriesOnlyTransientConnectionsAndStopsAfterTwo(){assertTrue(NativeRetryPolicy.canRetry(2001,0));assertTrue(NativeRetryPolicy.canRetry(2002,1));assertFalse(NativeRetryPolicy.canRetry(2001,2));for(int code:new int[]{2003,2004,4001,1001})assertFalse(NativeRetryPolicy.canRetry(code,0));}
}
