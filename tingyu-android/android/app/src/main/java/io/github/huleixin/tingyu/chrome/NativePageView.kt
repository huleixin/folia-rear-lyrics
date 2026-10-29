package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.unit.Density

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageView.kt
// Each surface follows its existing web design; only its renderer changes.
internal typealias PageAction = (String, String, Double) -> Unit
@Composable fun NativePageView(page: NativePage, modifier: Modifier, cssScale: Float? = null, onAction: PageAction) {
    val density = LocalDensity.current
    val focus = LocalFocusManager.current
    val action: PageAction = { id, text, value ->
        if (!page.keepsEditing(id)) focus.clearFocus()
        onAction(id, text, value)
    }
    val colors = when {
        page.id == "settings" -> listOf(Color(0xFF061D16), Color(0xFF02120E), Color(0xFF041A13))
        page.id == "search" -> listOf(Color(0xFF05170F), Color(0xFF03110C))
        page.home -> listOf(Color(0xFF102D25), Color(0xFF010E0D), Color(0xFF010D0C))
        else -> PlaylistBackgroundColors
    }
    Box(if(page.document!=null)modifier else modifier.background(Brush.verticalGradient(colors))) {
        // Match CSS viewport pixels, independent of Android system text magnification.
        CompositionLocalProvider(LocalDensity provides Density(cssScale ?: density.density, 1f)) {
            when {
                page.document!=null -> NativeSettingsDocumentView(page.document,Modifier.fillMaxSize(),action)
                page.id == "settings" -> NativeSettingsPage(page, Modifier.fillMaxSize(), action)
                page.id == "search" -> NativeSearchPage(page, Modifier.fillMaxSize(), action)
                page.id == "home" && !page.key.startsWith("library:") -> NativeHomePage(page, Modifier.fillMaxSize(), action)
                page.sections.any{it.id=="playlistIntro"} -> NativePlaylistPage(page,Modifier.fillMaxSize(),action)
                else -> NativeDirectoryPage(page, Modifier.fillMaxSize(), action)
            }
        }
    }
}
internal fun NativePage.keepsEditing(action:String)=action.startsWith("scroll:")||sections.any{it.action==action||it.request==action}
    ||document?.controls?.any{it.id==action&&it.kind!="click"}==true
