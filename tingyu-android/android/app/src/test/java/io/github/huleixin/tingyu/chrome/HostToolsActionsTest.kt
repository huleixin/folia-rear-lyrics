package io.github.huleixin.tingyu.chrome

import android.webkit.WebView
import androidx.activity.ComponentActivity
import io.github.huleixin.tingyu.minimal.MinimalToolActions
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// Exercise the actual host wiring without ever publishing a minimal-player bridge frame.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class HostToolsActionsTest {
    @Test fun toolsWorkWithoutMinimalSessionAndStopWhenHostSuspends() {
        val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup()
        val web = WebView(activity.get())
        val events = mutableListOf<String>()
        val host = ComposeChromeHost(web, ChromeActionListener { _, _, action, _ -> events.add(action) })
        try {
            fun actions(name: String) = ComposeChromeHost::class.java.getDeclaredField(name).let {
                it.isAccessible = true
                it.get(host) as MinimalToolActions
            }
            host.openNativeTools("quality")
            assertEquals(listOf("toolsOpen"), events)
            assertTrue(actions("toolActions").send("qualityPick", 1.0))
            assertEquals("qualityPick", events.last())
            assertTrue(actions("textToolActions").send("lxToggleSwitch", 0.0))
            host.setTextActionListener { _, _, action, _ -> events.add(action) }
            assertTrue(actions("textToolActions").sendText("lxUpdateUrl", "https://example.com/source.js"))
            host.closeNativeTools()
            assertEquals("toolsClose", events.last())
            host.suspend()
            val count = events.size
            assertFalse(actions("toolActions").send("qualityPick", 2.0))
            assertFalse(actions("textToolActions").sendText("lxUpdateUrl", ""))
            assertEquals(count, events.size)
        } finally {
            host.destroy()
            web.destroy()
            activity.pause().stop().destroy()
        }
    }
}
