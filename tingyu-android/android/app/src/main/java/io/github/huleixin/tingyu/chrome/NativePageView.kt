package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.unit.Density

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageView.kt
// Each surface follows its existing web design; only its renderer changes.
internal typealias PageAction = (String, String, Double) -> Unit

/** 页面背景渐变色板的单一来源：NativePageView 画背景与 Top Scroll Scrim 融合取色共用。
 *  浅色优先于页面类型（与 1.3.182 基线行为一致），数值全部收编在 DarkInterfaceColors。 */
@Composable internal fun NativePage.surfaceColors(): List<Color> = when {
    LocalInterfacePalette.current.light -> LocalInterfacePalette.current.backgrounds
    id == "settings" -> DarkInterfaceColors.SettingsBackgrounds
    id == "search" -> DarkInterfaceColors.SearchBackgrounds
    home -> DarkInterfaceColors.HomeBackgrounds
    else -> DarkInterfaceColors.Backgrounds
}

@Composable fun NativePageView(page: NativePage, modifier: Modifier, cssScale: Float? = null, onAction: PageAction) {
    val density = LocalDensity.current
    val focus = LocalFocusManager.current
    val action: PageAction = { id, text, value ->
        if (!page.keepsEditing(id)) focus.clearFocus()
        onAction(id, text, value)
    }
    val colors = page.surfaceColors()
    // 页面根度量（Top Scroll Scrim 用）：band 的窗口位置要映射回页面渐变的取色位置。
    val surface = remember { PageSurfaceMetrics() }
    Box(if(page.document!=null)modifier else modifier.background(Brush.verticalGradient(colors))
        .onGloballyPositioned { coords ->
            surface.originY = coords.positionInWindow().y
            surface.heightPx = coords.size.height.toFloat()
        }) {
        // Match CSS viewport pixels, independent of Android system text magnification.
        val scheme=if(LocalInterfacePalette.current.light)lightColorScheme(
            primary=LightInterfaceColors.Accent,surface=LightInterfaceColors.Sheet,onSurface=LightInterfaceColors.Ink,
            onSurfaceVariant=LightInterfaceColors.Muted,surfaceContainer=LightInterfaceColors.Surface)else MaterialTheme.colorScheme
        MaterialTheme(colorScheme=scheme) {
        CompositionLocalProvider(LocalDensity provides Density(cssScale ?: density.density, 1f), LocalPageSurface provides surface) {
            when {
                page.document!=null -> NativeSettingsDocumentView(page.document,Modifier.fillMaxSize(),action)
                page.id=="settings"&&page.key.startsWith("settings:rear:")->NativeRearControlPage(page,Modifier.fillMaxSize(),density.fontScale,action)
                page.id == "settings" -> NativeSettingsPage(page, Modifier.fillMaxSize(), action)
                page.id == "search" -> NativeSearchPage(page, Modifier.fillMaxSize(), action)
                page.id == "home" && !page.key.startsWith("library:") -> NativeHomePage(page, Modifier.fillMaxSize(), action)
                // 集合详情按页面语义路由，不按 intro/playlistIntro 分流标记（阶段 E）：
                // 歌手保留独立结构（NativeDirectoryPage artist 分支），其余集合走统一 MediaDetailScaffold。
                page.id == "collection"&&page.key.startsWith("collection:artist:") -> NativeDirectoryPage(page, Modifier.fillMaxSize(), action)
                page.id == "collection" -> MediaDetailScaffold(page,Modifier.fillMaxSize(),action)
                else -> NativeDirectoryPage(page, Modifier.fillMaxSize(), action)
            }
        }
        }
    }
}
internal fun NativePage.keepsEditing(action:String)=action.startsWith("scroll:")||sections.any{it.action==action||it.request==action}
    ||document?.controls?.any{it.id==action&&it.kind!="click"}==true
