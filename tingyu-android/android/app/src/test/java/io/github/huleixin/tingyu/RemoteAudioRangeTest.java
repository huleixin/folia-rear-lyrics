package io.github.huleixin.tingyu;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RemoteAudioRangeTest.java
public class RemoteAudioRangeTest {
 @Test public void countsThePartialBodyRatherThanTheTotalFile(){assertEquals(1,RemoteAudioRange.bodyLength("bytes 0-0/4317292"));assertEquals(400,RemoteAudioRange.bodyLength("bytes 600-999/1000"));assertEquals(20,RemoteAudioRange.bodyLength("bytes 10-29/*"));}
 @Test public void rejectsMalformedUnknownAndOverflowedLengths(){for(String value:new String[]{null,"bytes */100","bytes 20-10/100","bytes 0-9223372036854775807/*","broken"})assertEquals(-1,RemoteAudioRange.bodyLength(value));}
}
