package io.github.huleixin.tingyu;

import java.net.InetAddress;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/LxAudioProxyTest.java
public class LxAudioProxyTest {
    @Test public void acceptsCustomPublicDomainsOutsideThePlatformList() throws Exception {
        assertEquals("yinyue.haitangw.net", LxAudioProxy.validate("https://yinyue.haitangw.net/wy/wy.php?id=186016").host());
    }
    @Test public void rejectsPrivateLiteralDestinationsAndCredentials() throws Exception {
        for (String value : new String[]{"http://127.0.0.1/a", "http://10.1.2.3/a", "http://192.168.1.1/a", "http://100.64.0.1/a", "http://[::1]/a", "http://[fc00::1]/a", "http://localhost/a", "https://user:pass@example.com/a", "file:///tmp/audio"}) {
            try { LxAudioProxy.validate(value); fail(value); } catch (java.io.IOException expected) { }
        }
    }
    @Test public void validatesResolvedAddressesForEveryRedirect() throws Exception {
        for (String address : new String[]{"127.0.0.1","10.0.0.1","172.20.0.1","169.254.0.1","100.64.0.1","198.18.0.1","::1","fc00::1","fe80::1"}) assertFalse(address,LxAudioProxy.isPublicAddress(InetAddress.getByName(address)));
        assertTrue(LxAudioProxy.isPublicAddress(InetAddress.getByName("8.8.8.8")));
        assertTrue(LxAudioProxy.isPublicAddress(InetAddress.getByName("2606:4700:4700::1111")));
    }
}
