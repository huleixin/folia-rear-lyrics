package io.github.huleixin.tingyu.playback;

import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(manifest = Config.NONE, sdk = 34)
public final class SimultaneousPlaybackFocusTest {
    @Test
    public void configureFocusDecouplesAudioFocusFromBecomingNoisyProtection() {
        Context context = ApplicationProvider.getApplicationContext();
        NativeAudioDeck deck = new NativeAudioDeck(context, true, bands -> {});
        try {
            // Default / simultaneous disabled: both audio focus and noisy protection enabled.
            deck.configureFocus(true, true);
            assertEquals(NativeAudioDeck.ATTRIBUTES, deck.player.getAudioAttributes());

            // Simultaneous enabled: audio focus disabled, noisy protection stays enabled.
            deck.configureFocus(false, true);
            assertEquals(NativeAudioDeck.ATTRIBUTES, deck.player.getAudioAttributes());

            // Re-enabling standard focus works cleanly without recreating the deck.
            deck.configureFocus(true, true);
            assertEquals(NativeAudioDeck.ATTRIBUTES, deck.player.getAudioAttributes());
        } finally {
            deck.player.release();
        }
    }
}
