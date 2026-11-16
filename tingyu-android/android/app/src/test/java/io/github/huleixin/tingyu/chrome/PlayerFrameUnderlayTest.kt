package io.github.huleixin.tingyu.chrome

import android.graphics.Bitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/PlayerFrameUnderlayTest.kt
// Deliberately reuse a dirty draw buffer; this verifies clearing, not a device GPU driver.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class PlayerFrameUnderlayTest {
    @Test fun everyFrameReplacesOldTranslucentBoundsWithAnOpaqueUnderlay() {
        val bitmap = Bitmap.createBitmap(120, 240, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap.asImageBitmap())
        for (y in listOf(0, 30, 80, 160, 110, 30, 190)) {
            CanvasDrawScope().draw(Density(1f), LayoutDirection.Ltr, canvas, Size(120f, 240f)) {
                drawPlayerFrameUnderlay(Color(0x408899AA))
                drawRect(Color.White.copy(alpha = .5f), Offset(10f, y.toFloat()), Size(100f, 20f))
            }
            for (row in 0 until 240) if (row !in y until y + 20)
                assertEquals("stale row $row after frame $y", 0xFF8899AA.toInt(), bitmap.getPixel(60, row))
        }
        bitmap.recycle()
    }
}
