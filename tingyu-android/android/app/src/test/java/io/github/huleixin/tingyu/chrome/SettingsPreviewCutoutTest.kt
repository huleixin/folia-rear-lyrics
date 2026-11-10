package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SettingsPreviewCutoutTest.kt
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-160dpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SettingsPreviewCutoutTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @Test fun hazeSourcePreservesThePreviewHoleThroughClippingAndReturnToRest() {
        val holes = SettingsPreviewCutouts()
        var origin = Offset.Zero
        compose.setContent {
            val glass = rememberTyTopGlassState(84f)
            Box(Modifier.size(320.dp, 240.dp).onGloballyPositioned { origin = it.positionInWindow() }.background(Color.Red)) {
                TyTopGlassContentLayer(glass, listOf(Color.Green, Color.Green), null, null,
                    Modifier.fillMaxSize(), backgroundCutout = { holes.path(0f, 0f, 28f) }) {
                    Box(Modifier.offset(270.dp, 150.dp).size(16.dp).background(Color.White))
                }
            }
        }
        fun pixel(x: Int, y: Int): Color {
            var value = Color.Transparent
            compose.runOnIdle {
                val bitmap = android.graphics.Bitmap.createBitmap(393, 852, android.graphics.Bitmap.Config.ARGB_8888)
                compose.activity.window.decorView.draw(android.graphics.Canvas(bitmap))
                value = Color(bitmap.getPixel(x + origin.x.toInt(), y + origin.y.toInt()))
                bitmap.recycle()
            }
            return value
        }
        fun check(bounds: Rect, visible: Rect) {
            compose.runOnIdle { holes.update("preview", bounds, visible) }
            compose.waitForIdle()
            assertEquals(Color.Green, pixel(5, 5))
            assertEquals(Color.White, pixel(278, 158))
            if (visible.height > 0f) assertEquals(Color.Red, pixel(160, ((visible.top + visible.bottom) / 2).toInt()))
        }
        val bounds = Rect(20f, 40f, 300f, 200f)
        check(bounds, bounds)
        assertEquals(Color.Green, pixel(21, 41))
        for (i in 1..12) {
            val moved = bounds.translate(0f, -i * 10f)
            check(moved, moved.intersect(Rect(0f, 40f, 320f, 240f)))
        }
        // The cut edge is straight: a new rounded corner must not appear at the viewport edge.
        check(bounds.translate(0f, -80f), Rect(20f, 40f, 300f, 120f))
        assertEquals(Color.Red, pixel(21, 41))
        repeat(8) { check(bounds, bounds) }
        compose.runOnIdle { holes.remove("preview") }; compose.waitForIdle()
        assertEquals(Color.Green, pixel(160, 100))
    }
}
