package io.github.huleixin.tingyu.chrome

import androidx.activity.ComponentActivity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/SupportSheetLayerTest.kt
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-420dpi")
class SupportSheetLayerTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test fun supportPageFillsWindowBlocksUnderlyingTapAndClosesWithBack() {
        var pageTaps = 0
        var dismissals = 0
        compose.setContent {
            Box(Modifier.fillMaxSize().clickable { pageTaps++ })
            SupportSheetLayer("coffee", null, true) { dismissals++ }
        }
        compose.waitForIdle()
        compose.onNodeWithText("请作者喝杯咖啡").assertIsDisplayed()
        compose.onRoot().performTouchInput { click(Offset(8f, 8f)) }
        compose.waitForIdle()
        assertEquals(0, pageTaps)
        assertEquals(0, dismissals)
        compose.onNodeWithContentDescription("返回").performClick()
        assertEquals(1, dismissals)
    }
}
