package io.github.huleixin.tingyu.feedback;
import org.junit.Test;
import static org.junit.Assert.*;

// Crash privacy regression: retain useful locations while dropping messages and secrets.
public class CrashPrivacyTest {
    @Test public void keepsLocationsWithoutPrivatePayload() {
        String result=CrashPrivacy.stack("java.lang.RuntimeException: password=private\n at com.example.Audio.play(Audio.java:42)\nCaused by: java.io.IOException: https://private.invalid/token\n at anonymous (app.js:2:3)");
        assertTrue(result.contains("Audio.java:42"));assertTrue(result.contains("java.io.IOException"));assertTrue(result.contains("app.js:2:3"));
        assertFalse(result.contains("private"));assertFalse(result.contains("password"));
    }
    @Test public void dropsCredentialAndPrivatePaths() {
        String result=CrashPrivacy.text("Cookie: abc\nhttps://private.invalid/a\n/storage/emulated/0/private\nperson@example.org");
        assertFalse(result.contains("abc"));assertFalse(result.contains("private.invalid"));assertFalse(result.contains("emulated"));assertFalse(result.contains("person@"));
    }
}
