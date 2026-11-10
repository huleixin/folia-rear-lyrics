package io.github.huleixin.tingyu.chrome

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/InterfaceMaterial.kt
// Preserve classic Material defaults; all additional palettes supply semantic roles.
internal fun interfaceMaterialScheme(p: InterfacePalette, inherited: ColorScheme): ColorScheme {
    if(InterfaceThemes.resolve(p.style) == "classic" && !p.light) return inherited
    val base = if(p.light) lightColorScheme() else darkColorScheme()
    if(InterfaceThemes.resolve(p.style) != "classic") return base.copy(primary=p.accent,onPrimary=p.onAccent,
        primaryContainer=p.softButton,onPrimaryContainer=p.ink,inversePrimary=p.accent,
        secondary=p.accent,onSecondary=p.onAccent,secondaryContainer=p.surface,onSecondaryContainer=p.ink,
        tertiary=p.accent,onTertiary=p.onAccent,tertiaryContainer=p.surface,onTertiaryContainer=p.ink,
        background=p.backgrounds.first(),onBackground=p.ink,surface=p.sheet,onSurface=p.ink,
        surfaceVariant=p.surface,onSurfaceVariant=p.muted,surfaceTint=p.accent,
        surfaceBright=p.surface,surfaceDim=p.sheet,surfaceContainer=p.surface,
        surfaceContainerHigh=p.surface,surfaceContainerHighest=p.surface,
        surfaceContainerLow=p.sheet,surfaceContainerLowest=p.backgrounds.last(),
        inverseSurface=p.ink,inverseOnSurface=p.sheet,outline=p.muted,outlineVariant=p.border,
        error=p.panelDanger,onError=p.onAccent,errorContainer=p.sheet,onErrorContainer=p.panelDanger,scrim=p.scrim)
    return base.copy(primary=p.accent,surface=p.sheet,onSurface=p.ink,
        onSurfaceVariant=p.muted,surfaceContainer=p.surface)
}
