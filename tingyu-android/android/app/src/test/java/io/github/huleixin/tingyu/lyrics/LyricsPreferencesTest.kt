package io.github.huleixin.tingyu.lyrics

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// Imported style data must remain bounded and never grant permissions or enable a feature.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LyricsPreferencesTest {
    @Test fun defaultsKeepBothFeaturesDisabled() { val s = LyricsPreferencesState.from(JSONObject()); assertFalse(s.desktop); assertFalse(s.bluetooth) }
    @Test fun normalizesUntrustedStyleAndCoordinates() {
        val s = LyricsPreferencesState.from(JSONObject().put("x", 9).put("y", -8).put("style", JSONObject().put("fontSize", 100).put("font", "bad").put("opacity", 7).put("outline", -2).put("color", "javascript:")))
        assertEquals(1f, s.x); assertEquals(0f, s.y); assertEquals(40f, s.style.fontSize); assertEquals("sans", s.style.font); assertEquals(1f, s.style.opacity); assertEquals(0f, s.style.outline); assertEquals("#FFFFFF", s.style.color)
    }
    @Test fun styleExportRoundTripsWithoutDeviceOrEnablement() { val s = DesktopLyricsStyle(font = "mono", fontSize = 28f, doubleLine = false, splitLines = true); assertEquals(s, DesktopLyricsStyle.from(JSONObject(s.json().toString()))); assertFalse(s.json().has("desktop")); assertFalse(s.json().has("device")) }
}
