package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.R

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/BrandLaunchSurface.kt
// Cold startup brand canvas: renders from Compose frame 1 so the user sees brand art
// immediately instead of waiting for WebView Chromium renderer initialization.
@Composable
internal fun BrandLaunchSurface(
    palette: InterfacePalette,
    reduced: Boolean,
    modifier: Modifier = Modifier
) {
    val progress = remember { Animatable(if (reduced) 1f else 0f) }
    LaunchedEffect(reduced) {
        if (!reduced) {
            progress.animateTo(1f, tween(750, easing = CubicBezierEasing(0.2f, 0.85f, 0.2f, 1f)))
        }
    }

    val p = progress.value
    val logoScale = if (reduced) 1f else (0.82f + 0.18f * p)
    val logoAlpha = if (reduced) 1f else (p / 0.6f).coerceIn(0f, 1f)
    val textAlpha = if (reduced) 1f else ((p - 0.2f) / 0.6f).coerceIn(0f, 1f)
    val textOffsetY = if (reduced) 0f else (14f * (1f - p))
    val subAlpha = if (reduced) 1f else ((p - 0.35f) / 0.5f).coerceIn(0f, 1f)
    val waveAlpha = if (reduced) 0f else (if (p < 0.5f) p * 1.6f else (1f - p) * 1.6f).coerceIn(0f, 0.75f)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(palette.launch)
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val centerOffset = Offset(size.width * 0.5f, size.height * 0.38f)
            val haloRadius = size.width * 0.65f
            val haloColor = palette.accent.copy(alpha = if (palette.light) 0.08f else 0.16f)
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(haloColor, Color.Transparent),
                    center = centerOffset,
                    radius = haloRadius
                ),
                radius = haloRadius,
                center = centerOffset
            )
        }

        if (!reduced && waveAlpha > 0f) {
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(140.dp)
                    .align(Alignment.Center)
                    .offset(y = (-60).dp)
                    .graphicsLayer { alpha = waveAlpha }
            ) {
                val w = size.width
                val h = size.height
                val path = Path().apply {
                    moveTo(-0.03f * w, 0.54f * h)
                    cubicTo(
                        0.14f * w, 0.16f * h,
                        0.29f * w, 0.90f * h,
                        0.48f * w, 0.52f * h
                    )
                    cubicTo(
                        0.67f * w, 0.14f * h,
                        0.80f * w, 0.15f * h,
                        1.03f * w, 0.43f * h
                    )
                }
                drawPath(
                    path = path,
                    color = palette.accent.copy(alpha = 0.55f),
                    style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round)
                )
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(112.dp)
                    .graphicsLayer {
                        scaleX = logoScale
                        scaleY = logoScale
                        alpha = logoAlpha
                    }
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ic_brand_logo),
                    contentDescription = "听屿海浪品牌 Logo",
                    modifier = Modifier.fillMaxSize()
                )
            }

            Spacer(Modifier.height(18.dp))

            Text(
                text = "听屿",
                fontSize = 36.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 7.sp,
                color = palette.ink,
                modifier = Modifier.graphicsLayer {
                    alpha = textAlpha
                    translationY = textOffsetY
                }
            )

            Spacer(Modifier.height(4.dp))

            Text(
                text = "T I N G Y U",
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
                letterSpacing = 4.sp,
                color = palette.muted,
                modifier = Modifier.graphicsLayer {
                    alpha = textAlpha
                    translationY = textOffsetY
                }
            )

            Spacer(Modifier.height(52.dp))

            Text(
                text = "以声为海，以乐为屿。",
                fontSize = 17.sp,
                fontWeight = FontWeight.Normal,
                letterSpacing = 1.9.sp,
                color = palette.ink,
                modifier = Modifier.graphicsLayer {
                    alpha = subAlpha
                    translationY = textOffsetY * 0.7f
                }
            )

            Spacer(Modifier.height(12.dp))

            Text(
                text = "让每一段旋律，都有栖息之处。",
                fontSize = 11.sp,
                letterSpacing = 0.6.sp,
                color = palette.muted,
                modifier = Modifier.graphicsLayer {
                    alpha = subAlpha
                    translationY = textOffsetY * 0.5f
                }
            )
        }

        Text(
            text = "TINGYU · MUSIC ISLAND",
            fontSize = 9.sp,
            letterSpacing = 3.sp,
            color = palette.muted.copy(alpha = 0.7f),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 36.dp)
                .graphicsLayer { alpha = subAlpha }
        )
    }
}

