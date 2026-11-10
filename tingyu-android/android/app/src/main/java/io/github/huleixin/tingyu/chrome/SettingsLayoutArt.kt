package io.github.huleixin.tingyu.chrome

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsLayoutArt.kt
// Only the existing, explicitly marked choice-card illustration is a vector asset.
// Its bounds come from Compose; no page or form geometry is serialized from the browser.
@Composable internal fun SettingsLayoutArt(node:SettingsLayoutNode,theme:TyPanelTheme,modifier:Modifier) {
    val color=String.format("#%06x",theme.text.toArgb() and 0xffffff)
    val art=remember(node.svg,color){NativeSettingsSvg(node.svg,color)}
    val paint=remember{Paint(Paint.ANTI_ALIAS_FLAG)}
    Canvas(modifier){drawIntoCanvas { canvas->art.draw(canvas.nativeCanvas,SettingRect(0f,0f,size.width,size.height),1f,paint) }}
}
