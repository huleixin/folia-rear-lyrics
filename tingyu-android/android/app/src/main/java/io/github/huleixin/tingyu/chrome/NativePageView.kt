package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
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
        LocalInterfacePalette.current.light -> LocalInterfacePalette.current.backgrounds
        page.id == "settings" -> DarkInterfaceColors.SettingsBackgrounds
        page.id == "search" -> DarkInterfaceColors.SearchBackgrounds
        page.home -> DarkInterfaceColors.HomeBackgrounds
        else -> DarkInterfaceColors.Backgrounds
    }
    Box(if(page.document!=null)modifier else modifier.background(Brush.verticalGradient(colors))) {
        // Match CSS viewport pixels, independent of Android system text magnification.
        val scheme=if(LocalInterfacePalette.current.light)lightColorScheme(
            primary=LightInterfaceColors.Accent,surface=LightInterfaceColors.Sheet,onSurface=LightInterfaceColors.Ink,
            onSurfaceVariant=LightInterfaceColors.Muted,surfaceContainer=LightInterfaceColors.Surface)else MaterialTheme.colorScheme
        MaterialTheme(colorScheme=scheme) {
        CompositionLocalProvider(LocalDensity provides Density(cssScale ?: density.density, 1f)) {
            when {
                page.document!=null -> NativeSettingsDocumentView(page.document,Modifier.fillMaxSize(),action)
                page.id=="settings"&&page.key.startsWith("settings:rear:")->NativeRearControlPage(page,Modifier.fillMaxSize(),density.fontScale,action)
                page.id == "settings" -> NativeSettingsPage(page, Modifier.fillMaxSize(), action)
                page.id == "search" -> NativeSearchPage(page, Modifier.fillMaxSize(), action)
                page.id == "home" && !page.key.startsWith("library:") -> NativeHomePage(page, Modifier.fillMaxSize(), action)
                page.sections.any{it.id=="playlistIntro"} -> NativePlaylistPage(page,Modifier.fillMaxSize(),action)
                else -> NativeDirectoryPage(page, Modifier.fillMaxSize(), action)
            }
        }
        }
    }
}
internal fun NativePage.keepsEditing(action:String)=action.startsWith("scroll:")||sections.any{it.action==action||it.request==action}
    ||document?.controls?.any{it.id==action&&it.kind!="click"}==true
