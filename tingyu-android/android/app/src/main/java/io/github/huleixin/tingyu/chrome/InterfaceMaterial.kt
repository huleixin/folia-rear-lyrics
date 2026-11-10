package io.github.huleixin.tingyu.chrome

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/InterfaceMaterial.kt
// Preserve classic Material defaults; all additional palettes supply semantic roles.
internal fun interfaceMaterialScheme(p: InterfacePalette, inherited: ColorScheme): ColorScheme {
    if(p.style == "classic" && !p.light) return inherited
    val base = if(p.light) lightColorScheme() else darkColorScheme()
    return base.copy(primary=p.accent,surface=p.sheet,onSurface=p.ink,
        onSurfaceVariant=p.muted,surfaceContainer=p.surface)
}
