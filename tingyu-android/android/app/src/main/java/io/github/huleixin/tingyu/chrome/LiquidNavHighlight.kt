package io.github.huleixin.tingyu.chrome

import android.os.Build
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/LiquidNavHighlight.kt
// Adapted from Kyant0/AndroidLiquidGlass InteractiveHighlight, Apache-2.0.
// Copyright (c) Kyant0. Changes: reuse the nav's gesture owner and normalized pointer;
// one cached AGSL shader/brush per mounted bar, no competing pointerInput handler.
internal class LiquidNavHighlight {
    private val shader = if (Build.VERSION.SDK_INT >= 33) android.graphics.RuntimeShader("""
        uniform half4 color;
        uniform float radius;
        uniform float2 position;
        half4 main(float2 coord) {
            float intensity = smoothstep(radius, radius * 0.5, distance(coord, position));
            return color * intensity;
        }
    """) else null
    private val brush = shader?.let { ShaderBrush(it) }
    fun modifier(motion: LiquidNavMotion, vertical: Boolean) = Modifier.drawWithContent {
        drawContent()
        val progress = motion.pressProgress
        val p = motion.pointer
        if (progress > .001f && p != null) {
            val center = if (vertical) Offset(p.x * size.width, (p.y * 4f - motion.value) * size.height)
                else Offset((p.x * 4f - motion.value) * size.width, p.y * size.height)
            if (Build.VERSION.SDK_INT >= 33 && shader != null && brush != null) {
                val alpha = .15f * progress
                // Premultiplied white needs no color-space conversion or Android-only layout qualifier.
                shader.setFloatUniform("color", alpha, alpha, alpha, alpha)
                shader.setFloatUniform("radius", size.minDimension * 1.5f)
                shader.setFloatUniform("position", center.x.coerceIn(0f, size.width), center.y.coerceIn(0f, size.height))
                drawRect(brush, blendMode = BlendMode.Plus)
            } else drawRect(Color.White.copy(alpha = .08f * progress), blendMode = BlendMode.Plus)
        }
    }
}
