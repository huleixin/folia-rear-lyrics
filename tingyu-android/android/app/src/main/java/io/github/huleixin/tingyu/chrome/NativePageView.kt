package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.unit.Density

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageView.kt
// Each surface follows its existing web design; only its renderer changes.
internal typealias PageAction = (String, String, Double) -> Unit

/** 页面背景渐变色板的单一来源：NativePageView 画背景与沉浸式毛玻璃顶栏（TopGlassBar）取色共用。
 *  浅色优先于页面类型（与 1.3.182 基线行为一致），数值全部收编在 DarkInterfaceColors。 */
@Composable internal fun NativePage.surfaceColors(): List<Color> = when {
    LocalInterfacePalette.current.light -> LocalInterfacePalette.current.backgrounds
    id == "settings" -> LocalInterfacePalette.current.settingsBackgrounds
    id == "search" -> LocalInterfacePalette.current.searchBackgrounds
    home -> LocalInterfacePalette.current.homeBackgrounds
    else -> LocalInterfacePalette.current.backgrounds
}

@Composable fun NativePageView(page: NativePage, modifier: Modifier, cssScale: Float? = null, libraryPage:NativePage?=null, libraryAction:PageAction={_,_,_->}, settingsRootPage:NativePage?=null, settingsActiveAction:String="", splitLyricsMode:String?=null, onCloseSplitLyrics:()->Unit={}, onSettingsSelect:PageAction?=null, onAction: PageAction) {
    val density = LocalDensity.current
    val focus = LocalFocusManager.current
    val action: PageAction = { id, text, value ->
        if (!page.keepsEditing(id)) focus.clearFocus()
        onAction(id, text, value)
    }
    val settingsSelect: PageAction = onSettingsSelect ?: action
    val colors = page.surfaceColors()
    Box(if(page.document!=null)modifier else modifier.background(Brush.verticalGradient(colors))) {
        // Match CSS viewport pixels, independent of Android system text magnification.
        val scheme = interfaceMaterialScheme(LocalInterfacePalette.current, MaterialTheme.colorScheme)
        MaterialTheme(colorScheme=scheme) {
        CompositionLocalProvider(LocalDensity provides Density(cssScale ?: density.density, 1f)) {
            val padWindow = LocalPadWindow.current
            val libraryPaneWidth = when {
                padWindow.contentWidth >= 1200f -> 340.dp
                padWindow.contentWidth >= 960f -> 320.dp
                else -> 280.dp
            }
            when {
                padWindow.splitPlayer&&page.key.startsWith("library:") -> Row(Modifier.fillMaxSize().padding(start=104.dp)){
                    NativeDirectoryPage(page.copy(bottomClearance=100f),Modifier.width(libraryPaneWidth).fillMaxHeight(),action)
                    Box(Modifier.weight(1f).fillMaxHeight(),contentAlignment=androidx.compose.ui.Alignment.Center){Text("选择歌单、专辑或电台查看内容",color=PageMuted)}
                }
                padWindow.splitPlayer&&page.id=="collection"&&!page.key.startsWith("collection:artist:")&&libraryPage!=null -> Row(Modifier.fillMaxSize().padding(start=104.dp)){
                    NativeDirectoryPage(libraryPage.copy(bottomClearance=100f),Modifier.width(libraryPaneWidth).fillMaxHeight(),libraryAction)
                    Box(Modifier.weight(1f).fillMaxHeight()){
                        if (page.key == "collection:local-music") {
                            NativeLocalMusicPage(page, Modifier.fillMaxSize(), splitPane = true, action = action)
                        } else {
                            MediaDetailScaffold(page,Modifier.fillMaxSize(),splitPane=true,action=action)
                        }
                    }
                }
                // Fullscreen stage / theme editors remain standalone exceptions on tablet.
                padWindow.settingsDualPane && page.id == "settings" && page.isFullscreenSettingsEditor() -> {
                    when {
                        page.document?.flow != null -> SettingsFlowPage(page.document.flow, page, Modifier.fillMaxSize(), action = action)
                        page.document != null -> NativeSettingsDocumentView(page.document, Modifier.fillMaxSize(), action)
                        else -> NativeRearControlPage(page, Modifier.fillMaxSize(), density.fontScale, action = action)
                    }
                }
                padWindow.settingsDualPane && page.id == "settings" && splitLyricsMode != null && settingsRootPage != null -> {
                    val activity = LocalContext.current as? android.app.Activity
                    PadSettingsPage(
                        settingsRootPage,
                        Modifier.fillMaxSize(),
                        settingsSelect,
                        activeAction = settingsActiveAction,
                        detailContent = {
                            if (activity != null) {
                                LyricsSettingsSheet(
                                    activity = activity,
                                    mode = splitLyricsMode,
                                    splitPane = true,
                                    showBack = false,
                                    onClose = onCloseSplitLyrics,
                                )
                            }
                        },
                    )
                }
                padWindow.settingsDualPane && page.id == "settings" && settingsRootPage != null && (page.document != null || page.key.startsWith("settings:rear:")) -> {
                    val isDeeper = page.isDeeperSettingsSubpage()
                    PadSettingsPage(
                        settingsRootPage,
                        Modifier.fillMaxSize(),
                        settingsSelect,
                        activeAction = settingsActiveAction,
                        detailContent = {
                            when {
                                page.document?.flow != null ->
                                    SettingsFlowPage(page.document.flow, page, Modifier.fillMaxSize(), splitPane = true, showBack = isDeeper, action = action)
                                page.document != null ->
                                    NativeSettingsDocumentView(page.document, Modifier.fillMaxSize(), action)
                                else ->
                                    NativeRearControlPage(page, Modifier.fillMaxSize(), density.fontScale, splitPane = true, showBack = isDeeper, action = action)
                            }
                        },
                    )
                }
                padWindow.settingsDualPane && page.id == "settings" ->
                    PadSettingsPage(
                        settingsRootPage ?: page,
                        Modifier.fillMaxSize(),
                        settingsSelect,
                        activeAction = settingsActiveAction,
                    )
                page.document?.flow!=null -> SettingsFlowPage(page.document.flow,page,Modifier.fillMaxSize(),action=action)
                page.document!=null -> NativeSettingsDocumentView(page.document,Modifier.fillMaxSize(),action)
                page.id=="settings"&&page.key.startsWith("settings:rear:")->NativeRearControlPage(page,Modifier.fillMaxSize(),density.fontScale,action=action)
                page.id == "settings" -> NativeSettingsPage(page, Modifier.fillMaxSize(), action)
                page.id == "search" -> NativeSearchPage(page, Modifier.fillMaxSize(), action)
                page.id == "home" && !page.key.startsWith("library:") -> NativeHomePage(page, Modifier.fillMaxSize(), action)
                // 集合详情按页面语义路由，不按 intro/playlistIntro 分流标记（阶段 E）：
                // 歌手保留独立结构（NativeDirectoryPage artist 分支），本地音乐使用独立二级页，其余集合走统一 MediaDetailScaffold。
                page.id == "collection" && page.key == "collection:local-music" -> NativeLocalMusicPage(page, Modifier.fillMaxSize().then(if(LocalPadWindow.current.expanded)Modifier.padding(start=104.dp)else Modifier), action = action)
                page.id == "collection"&&page.key.startsWith("collection:artist:") -> NativeDirectoryPage(page, Modifier.fillMaxSize(), action)
                page.id == "collection" -> MediaDetailScaffold(page,Modifier.fillMaxSize().then(if(LocalPadWindow.current.expanded)Modifier.padding(start=104.dp)else Modifier),action=action)
                else -> NativeDirectoryPage(page, Modifier.fillMaxSize(), action)
            }
        }
        }
    }
}
internal fun NativePage.isFullscreenSettingsEditor(): Boolean {
    if (key.startsWith("settings:document:rear-appearance-editor") ||
        key.startsWith("settings:document:rear-appearance-theme")) {
        return true
    }
    if (key.startsWith("settings:document:options:") || key.startsWith("settings:document:help:")) {
        val parts = key.removePrefix("settings:document:").split(':')
        val visPlayground = parts.getOrNull(2) == "true"
        val stageTheme = parts.getOrNull(3) == "true"
        val themePark = parts.getOrNull(4) == "true"
        return visPlayground || stageTheme || themePark
    }
    return false
}

internal fun NativePage.isDeeperSettingsSubpage(): Boolean {
    if (key.startsWith("settings:rear:") && key != "settings:rear:control") return true
    if (key.startsWith("settings:document:rear-")) return true
    if (key.startsWith("settings:document:accounts:")) return true
    if (document?.flow?.modal != null) return true
    if (key.startsWith("settings:document:options:") || key.startsWith("settings:document:help:")) {
        val parts = key.removePrefix("settings:document:").split(':')
        return parts.drop(2).any { it == "true" }
    }
    return false
}

internal fun NativePage.keepsEditing(action:String)=action.startsWith("scroll:")||action.startsWith("preview:")||action.startsWith("preview-tap:")||action.startsWith("submit:")||action.startsWith("focus:")||sections.any{it.action==action||it.request==action}
    ||document?.controls?.any{it.id==action&&it.kind!="click"}==true
