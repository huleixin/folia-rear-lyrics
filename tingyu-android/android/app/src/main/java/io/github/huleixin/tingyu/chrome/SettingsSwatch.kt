package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsSwatch.kt
// Palette samples retain the original colors; the page chrome still uses the shared theme.
internal fun Modifier.settingsSwatch(value: String, radius: Float): Modifier {
    if(value.isBlank())return this
    val shape=RoundedCornerShape(radius.dp)
    val colors=Regex("#[0-9a-fA-F]{3,8}\\b|rgba?\\([^)]*\\)").findAll(value).map { Color(settingColor(it.value)) }.toList()
    return if(value.contains("gradient")&&colors.size>=2)clip(shape).background(Brush.linearGradient(colors))
        else clip(shape).background(Color(settingColor(value)))
}
