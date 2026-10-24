package io.github.huleixin.tingyu;

import java.lang.reflect.Method;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/QishuiAudioHostTest.java
public class QishuiAudioHostTest {
    private Object invoke(String name, String value) throws Exception {
        Method method = LocalAudioServer.class.getDeclaredMethod(name, String.class);
        method.setAccessible(true);
        return method.invoke(null, value);
    }

    @Test public void allowsQishuiCdnWithoutAllowingSuffixLookalikes() throws Exception {
        for (String host : new String[] { "v3.douyinvod.com", "audio.365yg.com", "audio.douyinscdn.com", "audio.snssdk.com" }) {
            assertEquals(true, invoke("isRemoteAudioHostAllowed", host));
        }
        assertEquals(false, invoke("isRemoteAudioHostAllowed", "douyinvod.com.example.org"));
        assertEquals(false, invoke("isRemoteAudioHostAllowed", "evildouyinvod.com"));
    }

    @Test public void choosesProviderRefererWithoutChangingExistingProviders() throws Exception {
        assertEquals("https://music.douyin.com/", invoke("remoteAudioReferer", "https://audio.douyinvod.com/song"));
        assertEquals("https://music.163.com/", invoke("remoteAudioReferer", "https://m701.music.126.net/song"));
        assertEquals("https://www.kuwo.cn/", invoke("remoteAudioReferer", "https://audio.kuwo.cn/song"));
    }
}
