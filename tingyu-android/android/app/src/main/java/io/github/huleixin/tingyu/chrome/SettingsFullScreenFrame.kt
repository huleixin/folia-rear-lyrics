package io.github.huleixin.tingyu.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// SettingsFullScreenFrame.kt: existing top-glass page chrome for native lyrics and support.
@Composable internal fun SettingsFullScreenFrame(theme:TyPanelTheme,title:String,subtitle:String,onClose:()->Unit,content:@Composable ColumnScope.()->Unit){
    BackHandler{onClose()}
    val colors=LocalInterfacePalette.current.settingsBackgrounds
    val density=LocalDensity.current
    val safe=LocalSettingsSafeInsets.current
    val top=safe?.top?:WindowInsets.safeDrawing.getTop(density)/density.density
    val bottom=safe?.bottom?:WindowInsets.safeDrawing.getBottom(density)/density.density
    val glass=rememberTyTopGlassState(estimateHeaderBottomDp=top+96f)
    Box(Modifier.fillMaxSize().testTag("native-settings-fullscreen").pointerInput(Unit){detectTapGestures(onTap={})}){
        TyTopGlassContentLayer(glass,colors,null,null,Modifier.fillMaxSize()){
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()){
                Spacer(Modifier.height(glass.contentTop))
                Box(Modifier.fillMaxWidth(),contentAlignment=Alignment.TopCenter){
                    Column(Modifier.widthIn(max=1040.dp).fillMaxWidth().padding(horizontal=22.dp,vertical=12.dp),content=content)
                }
                Spacer(Modifier.height((bottom+24).dp))
            }
        }
        TyTopGlassSurface(glass,colors)
        TyTopGlassForeground{
            Row(Modifier.fillMaxWidth().padding(start=16.dp,end=16.dp,top=(top+16).dp,bottom=16.dp)
                .onGloballyPositioned{glass.reportHeader(it.positionInWindow().y,it.size.height)},verticalAlignment=Alignment.CenterVertically){
                ChromeButton("返回",onClick=onClose){PageIcon("chevron-left",theme.text,Modifier.size(24.dp))}
                Column(Modifier.weight(1f).padding(horizontal=10.dp)){
                    Text(title,color=theme.text,fontSize=22.sp)
                    if(subtitle.isNotBlank())Text(subtitle,color=theme.muted,fontSize=12.sp,modifier=Modifier.padding(top=5.dp))
                }
            }
        }
    }
}
