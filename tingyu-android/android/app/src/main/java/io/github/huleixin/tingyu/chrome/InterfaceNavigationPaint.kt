package io.github.huleixin.tingyu.chrome

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.lerp

// Central material policy preserves classic multicolor SVGs; registered palettes tint the same masks.
internal fun InterfacePalette.navigationPaint(accent: Color, weight: Float): ColorFilter =
    if(InterfaceThemes.resolve(style)=="classic") ColorFilter.lighting(
        Color(1f-weight,1f-weight,1f-weight),Color(accent.red*weight,accent.green*weight,accent.blue*weight))
    else ColorFilter.tint(lerp(icon,accent,weight))
