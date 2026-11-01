package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/InterfacePalette.kt
internal object LightInterfaceColors {
    val Ink=Color(0xFF213E34)
    val Muted=Color(0xFF496357)
    val Accent=Color(0xFF246E55)
    val Icon=Color(0xFF486153)
    val Surface=Color(0xFFE3EBE2)
    val Card=Color(0xCCE9F0E8)
    val Subtle=Color(0x18315D43)
    val Border=Color(0x38315D43)
    val Divider=Color(0x26315D43)
    val Selected=Color(0x20327856)
    val Focus=Color(0x88246E55)
    val SelectedBorder=Color(0x66327856)
    val Button=Color(0xFF9BD9BC)
    val SoftButton=Color(0xFFD2E6D7)
    val Floating=Color(0xE6E3EBE2)
    val Sheet=Color(0xFFF1F4ED)
    val Backgrounds=listOf(Color(0xFFE3EDE2),Color(0xFFF0F3EA),Color(0xFFF4F5EE))
}
// The dark branch returns the original literal unchanged, including its alpha.
@Immutable internal data class InterfacePalette(val light:Boolean=false) {
    fun color(dark:Color,lightColor:Color)=if(light)lightColor else dark
    val ink get()=color(Color(0xFFF4F7F5),LightInterfaceColors.Ink)
    val muted get()=color(Color(0xFFA2B6AC),LightInterfaceColors.Muted)
    val accent get()=color(Color(0xFF9FE0C4),LightInterfaceColors.Accent)
    val backgrounds get()=if(light)LightInterfaceColors.Backgrounds else PlaylistBackgroundColors
}
internal val LocalInterfacePalette=staticCompositionLocalOf {InterfacePalette()}
@Composable internal fun interfaceColor(dark:Color,light:Color)=LocalInterfacePalette.current.color(dark,light)
internal fun ChromeSurface.interfacePaint(light:Boolean):ChromeSurface =
    if(id=="stage"||!light&&!this.light)this else copy(light=light,ink=if(light)"#213e34"else ink,accent=if(light)"#246e55"else accent)
