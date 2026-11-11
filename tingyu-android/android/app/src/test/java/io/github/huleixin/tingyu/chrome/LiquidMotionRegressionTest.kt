package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/LiquidMotionRegressionTest.kt
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk=[34])
class LiquidMotionRegressionTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun sample(colors: List<Color>, at: Float): Color {
        val x = at * colors.lastIndex
        val i = x.toInt().coerceIn(0, colors.lastIndex)
        val a=colors[i];val b=colors[(i+1).coerceAtMost(colors.lastIndex)];val t=x-i
        return Color(a.red+(b.red-a.red)*t,a.green+(b.green-a.green)*t,
            a.blue+(b.blue-a.blue)*t,a.alpha+(b.alpha-a.alpha)*t)
    }
    @Test fun allThemeGradientPairsPreserveTheActualGradientAtBothEndpoints() {
        val themes = listOf(false, true).flatMap { light -> listOf("classic", "glacier").map { InterfacePalette(light, it) } }
        for (from in themes) for (to in themes) {
            val a = from.snapshotGradients(); val b = to.snapshotGradients()
            for (i in a.indices) {
                val start = blendGradient(a[i], b[i], 0f); val end = blendGradient(a[i], b[i], 1f)
                for (step in 0..24) {
                    val at = step/24f
                    val expected = sample(a[i],at); val actual = sample(start,at)
                    assertEquals(expected.red, actual.red, .005f); assertEquals(expected.green,actual.green,.005f)
                    assertEquals(expected.blue,actual.blue,.005f); assertEquals(expected.alpha,actual.alpha,.005f)
                    val target=sample(b[i],at);val reached=sample(end,at)
                    assertEquals(target.red,reached.red,.005f);assertEquals(target.green,reached.green,.005f)
                    assertEquals(target.blue,reached.blue,.005f);assertEquals(target.alpha,reached.alpha,.005f)
                }
                val visible = blendGradient(a[i], b[i], .37f)
                val reversed = blendGradient(visible, a[i], 0f)
                assertEquals(visible,reversed)
            }
        }
    }
    @Test fun rapidStyleChangesReadEveryAnimatedGradientWithoutCrashing() {
        val light=mutableStateOf(false);val style=mutableStateOf("classic");val reduced=mutableStateOf(false)
        lateinit var palette: InterfacePalette
        compose.mainClock.autoAdvance=false
        compose.setContent { palette=rememberLiquidPalette(light.value,style.value,reduced.value)
            // These are real draw-consumer reads, missing from the original surface-color-only test.
            palette.snapshotGradients().forEach { gradient -> gradient.forEach { assertTrue(it.red.isFinite()) } }
            Box{}
        }
        repeat(12) { index ->
            compose.runOnIdle { light.value=index%2==0;style.value=if(index%3==0)"glacier" else "classic" }
            compose.mainClock.advanceTimeBy(80);compose.waitForIdle()
            palette.snapshotGradients().forEach { assertTrue(it.size>=2) }
        }
        compose.runOnIdle { light.value=true;style.value="glacier";reduced.value=true }
        compose.mainClock.advanceTimeBy(100);compose.waitForIdle()
        assertEquals(InterfacePalette(true,"glacier").snapshotGradients(),palette.snapshotGradients())
    }
    @Test fun largeCoverStartsExactlyOnMiniCoverAndCanvasEndsFullSize() {
        val origin=Rect(22f,720f,56f,754f);val target=Rect(26f,135f,326f,435f);val size=Size(393f,852f)
        val start=playerTransform(origin,target,size,0f)
        val mapped=target.center*start.scale+start.translation
        assertEquals(origin.center.x,mapped.x,.001f);assertEquals(origin.center.y,mapped.y,.001f)
        assertEquals(origin.width,target.width*start.scale,.001f)
        val end=playerTransform(origin,target,size,1f)
        assertEquals(1f,end.scale,0f);assertEquals(0f,end.translation.x,0f);assertEquals(0f,end.translation.y,0f)
        val mid=playerTransform(origin,target,size,.4f)
        assertTrue(mid.scale>start.scale && mid.scale<end.scale)
        assertEquals(mid,playerTransform(origin,target,size,.4f))
        for (viewport in listOf(size,Size(852f,393f))) {
            assertTrue(playerTransform(origin,null,viewport,.3f).scale.isFinite())
        }
    }
    @Test fun interruptedCoverEntryReversesThroughTheSamePositions() {
        val origin=Rect(22f,720f,56f,754f);val target=Rect(26f,135f,326f,435f);val size=Size(393f,852f)
        val frozen=.43f
        val entry=playerTransform(origin,target,size,frozen)
        assertEquals(entry,playerTransform(origin,target,size,frozen*(1f-0f)))
        val later=playerTransform(origin,target,size,frozen*(1f-.4f))
        assertTrue(later.scale<entry.scale)
        assertEquals(playerTransform(origin,target,size,0f),playerTransform(origin,target,size,frozen*(1f-1f)))
    }
    @Test fun dropdownAvoidsScreenEdgesAndRespectsRightToLeft() {
        val position=LiquidMenuPosition(8)
        val window=androidx.compose.ui.unit.IntSize(393,852)
        val popup=androidx.compose.ui.unit.IntSize(180,240)
        val low=androidx.compose.ui.unit.IntRect(330,780,380,820)
        val ltr=position.calculatePosition(low,window,androidx.compose.ui.unit.LayoutDirection.Ltr,popup)
        assertTrue(ltr.x>=8 && ltr.x+popup.width<=window.width-8)
        assertTrue(ltr.y+popup.height<low.top)
        val high=androidx.compose.ui.unit.IntRect(160,20,250,60)
        val rtl=position.calculatePosition(high,window,androidx.compose.ui.unit.LayoutDirection.Rtl,popup)
        assertEquals(70,rtl.x);assertTrue(rtl.y>=high.bottom)
    }
    @Test fun popupRetainsExitAndReopenReversesInsteadOfDuplicating() {
        val open=mutableStateOf(true)
        compose.mainClock.autoAdvance=false
        compose.setContent { LiquidDropdown(open.value,{open.value=false}) { Text("retained-option") } }
        compose.mainClock.advanceTimeBy(500)
        compose.onNodeWithText("retained-option").assertExists()
        compose.runOnIdle {open.value=false}
        compose.mainClock.advanceTimeBy(32)
        compose.onNodeWithText("retained-option").assertExists()
        compose.runOnIdle {open.value=true}
        compose.mainClock.advanceTimeBy(500)
        compose.onAllNodesWithText("retained-option").assertCountEquals(1)
        compose.runOnIdle {open.value=false}
        compose.mainClock.advanceTimeBy(500)
        compose.onNodeWithText("retained-option").assertDoesNotExist()
    }
}
