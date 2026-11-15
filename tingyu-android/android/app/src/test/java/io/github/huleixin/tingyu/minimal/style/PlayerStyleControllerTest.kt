package io.github.huleixin.tingyu.minimal.style

import android.content.Context
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

// Exercise the shared workflow and persisted state, independent of payment or playback.
@RunWith(RobolectricTestRunner::class) @Config(sdk = [34])
class PlayerStyleControllerTest {
    private val prefs get() = RuntimeEnvironment.getApplication().getSharedPreferences("style-test", Context.MODE_PRIVATE)
    @Before fun reset() { prefs.edit().clear().commit() }
    @Test fun defaultAndDismissKeepClassicAndDoNotAcknowledge() {
        val controller = PlayerStyleController(prefs)
        assertEquals(PlayerStyle.CLASSIC, controller.style.value)
        repeat(3) {
            controller.open(); assertEquals(PlayerStylePanel.INTRODUCTION, controller.panel.value)
            controller.close(); assertFalse(prefs.getBoolean(PlayerStyleController.INTRO_KEY, false))
        }
        controller.select(PlayerStyle.IMMERSIVE)
        assertEquals(PlayerStyle.CLASSIC, controller.style.value)
    }
    @Test fun directExperienceOpensPickerWithoutSwitchingThenPersistsSelection() {
        val c = PlayerStyleController(prefs)
        c.open(); c.experience()
        assertEquals(PlayerStylePanel.SELECTION, c.panel.value)
        assertEquals(PlayerStyle.CLASSIC, c.style.value)
        c.select(PlayerStyle.IMMERSIVE)
        val restored = PlayerStyleController(prefs)
        assertEquals(PlayerStyle.IMMERSIVE, restored.style.value)
        restored.open(); assertEquals(PlayerStylePanel.SELECTION, restored.panel.value)
        assertFalse(prefs.all.keys.any { it.contains("donat", true) || it.contains("pay", true) })
    }
    @Test fun coffeeBackDoesNotAcknowledgeAndReturnExperienceDoes() {
        val c = PlayerStyleController(prefs)
        c.open(); c.openCoffee(); c.back()
        assertEquals(PlayerStylePanel.INTRODUCTION, c.panel.value)
        assertFalse(prefs.getBoolean(PlayerStyleController.INTRO_KEY, false))
        c.openCoffee(); c.experience()
        assertEquals(PlayerStylePanel.SELECTION, c.panel.value)
        assertEquals(PlayerStyle.CLASSIC, c.style.value)
        c.close(); c.open(); assertEquals(PlayerStylePanel.SELECTION, c.panel.value)
    }
    @Test fun appearanceImportAndUnknownStyleDoNotAcknowledgeIntroduction() {
        val c = PlayerStyleController(prefs)
        c.restoreStyle("immersive"); c.open()
        assertEquals(PlayerStylePanel.INTRODUCTION, c.panel.value)
        c.restoreStyle("future"); assertEquals(PlayerStyle.CLASSIC, c.style.value)
        assertFalse(prefs.getBoolean(PlayerStyleController.INTRO_KEY, false))
        c.close(); c.experience()
        assertFalse(prefs.getBoolean(PlayerStyleController.INTRO_KEY, false))
    }
}
