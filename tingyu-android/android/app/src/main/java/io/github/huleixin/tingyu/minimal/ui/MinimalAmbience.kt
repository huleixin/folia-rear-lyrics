package io.github.huleixin.tingyu.minimal.ui

import android.graphics.Paint
import android.graphics.RuntimeShader
import android.os.Build
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.nativeCanvas
import io.github.huleixin.tingyu.minimal.Rgb
import io.github.huleixin.tingyu.minimal.argb
import io.github.huleixin.tingyu.minimal.hslToRgb
import io.github.huleixin.tingyu.minimal.rgbToHsl
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalAmbience.kt
//
// 封面取色的动态背景（第 18 轮：「液态流沙 + 轻柔光晕」）。
//
// 旧版为什么静止：三团大椭圆光斑用的是与底色明度几乎相同的 field 色，
// 位移幅度 ±13% 也被 6fps 的相位步进抹平 —— 同色软块挪动，肉眼看不见。
//
// 新版分两条路径：
//   · **API 33+（主流真机）**：AGSL 域扭曲流体着色器（double-fbm-warp）。
//     两层 fbm 互相扭曲，颜色像液体一样缓慢交融变形；一团低强度柔光绕场缓移。
//     GPU 上一次 fullscreen 片元着色，无 CPU 模糊，无图层平移。
//   · **API 33 以下**：保留旧的渐变光斑画法（能跑、流动感弱一些）。
//
// 节流与暂停：相位只在可见且播放时以 **30fps** 推进（慢速流动 30fps 足够顺滑），
// 后台 / 息屏 / 暂停时帧循环自然停摆，相位冻结 —— 恢复时从同一相位继续，无跳变。
// 换歌时颜色沿 760ms 淡入淡出（与 CSS 一致），不闪白不闪黑。
// 状态都是本组件私有的：歌词页不读这里的任何状态，背景动不重组歌词。

/** AGSL 液态流沙着色器。时间线性累计（无 mod 周期），没有循环接缝。 */
private const val LIQUID_AGSL = """
uniform float2 uRes;
uniform float uTime;
uniform float4 uC0;   // base
uniform float4 uC1;   // fieldPrimary
uniform float4 uC2;   // fieldSecondary
uniform float4 uC3;   // bloom
uniform float3 uGlow; // 柔光色（accent）
uniform float uGlowI; // 柔光强度
uniform float uShade; // 整体明度系数（浅色 1.0 / 深色 ~0.92）

float hash(float2 p) {
    p = fract(p * float2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

float noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(float2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.03 + 11.7;
        a *= 0.5;
    }
    return v;
}

half4 main(float2 fragCoord) {
    float2 uv = fragCoord / uRes;
    float t = uTime;
    float aspect = uRes.x / max(uRes.y, 1.0);
    float2 p = uv * float2(aspect, 1.0) * 1.55;

    // 双层域扭曲：q 扭曲 r，r 再扭曲采样点 —— 颜色边界像液体一样被拉伸交融。
    float2 q;
    q.x = fbm(p + float2(t * 0.048, t * 0.031));
    q.y = fbm(p + float2(5.2, 1.3) + float2(t * 0.041, -t * 0.027));
    float2 r;
    r.x = fbm(p + 2.4 * q + float2(1.7, 9.2) + float2(t * 0.052, 0.0));
    r.y = fbm(p + 2.2 * q + float2(8.3, 2.8) - float2(0.0, t * 0.038));
    float f = fbm(p + 2.6 * r);

    float3 col = mix(uC0.rgb, uC1.rgb, clamp(f * f * 2.4, 0.0, 1.0));
    col = mix(col, uC2.rgb, clamp(length(q), 0.0, 1.0) * 0.6);
    col = mix(col, uC3.rgb, clamp(r.y * r.y * 1.15, 0.0, 1.0) * 0.4);

    // 轻柔光：一团极淡的亮斑绕场漂移（周期 ~60s 与 ~75s，不成简单闭环）。
    float2 gc = float2(0.5 + 0.36 * sin(t * 0.105), 0.44 + 0.32 * cos(t * 0.083));
    float glow = exp(-4.5 * length((uv - gc) * float2(aspect, 1.0) * 0.9));
    col += uGlow * glow * uGlowI;

    // 暗角：边缘收一点，中心给文字留对比度。
    float vig = smoothstep(1.3, 0.35, length((uv - float2(0.5, 0.45)) * float2(aspect, 1.0) * 0.85));
    col *= mix(0.8, 1.0, vig);
    col *= uShade;
    return half4(col, 1.0);
}
"""

/** 光斑几何：CSS `ellipse rx% ry% at cx% cy%`（含 `inset:-20%`）换算到视口的比例。 */
private data class Blob(
    val centerX: Float,
    val centerY: Float,
    val radiusX: Float,
    val radiusY: Float,
    val colorIndex: Int,
    val periodSec: Float,
    val phaseOffset: Float,
)

private val BLOBS = listOf(
    Blob(0.248f, 0.192f, 0.868f, 0.728f, 1, 20f, 0f),
    Blob(0.822f, 0.472f, 0.910f, 0.756f, 2, 24f, 0.33f),
    Blob(0.416f, 0.892f, 0.980f, 0.756f, 3, 28f, 0.66f),
)

@Composable
fun MinimalAmbience(
    colors: List<Color>,
    light: Boolean,
    paused: Boolean,
    still: Boolean,
    modifier: Modifier = Modifier,
) {
    var from by remember { mutableStateOf(colors) }
    var to by remember { mutableStateOf(colors) }
    val fade = remember { Animatable(1f) }
    // 换歌时 760ms 从旧配色过渡到新配色（CSS 的 transition），不重建任何图层。
    LaunchedEffect(colors) {
        if (to == colors) return@LaunchedEffect
        from = lerpPalette(from, to, fade.value)
        to = colors
        fade.snapTo(0f)
        fade.animateTo(1f, tween(760, easing = LinearEasing))
    }

    val animate = !still && !paused
    // 相位：连续累计秒（无 mod 周期 → 无循环接缝）。30fps 节流：慢速流动够顺滑，
    // GPU 片元着色量减半。后台/息屏/暂停时帧循环停摆，相位冻结，恢复无跳变。
    var phase by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        var lastFrame = 0L
        var lastStep = 0L
        while (true) {
            withFrameNanos { now ->
                if (lastFrame != 0L) {
                    val delta = (now - lastFrame) / 1_000_000_000f
                    // 30fps 节流：不足 33ms 只累计帧时间，不触发重绘。
                    if (now - lastStep >= 33_000_000L) {
                        phase = (phase + delta) % 3600f
                        lastStep = now
                    }
                }
                lastFrame = now
            }
        }
    }

    // RuntimeShader 编译失败（个别 ROM 的 AGSL 方言差异）自动退回光斑画法。
    val shader = remember {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                RuntimeShader(LIQUID_AGSL)
            } catch (_: Throwable) {
                null
            }
        } else null
    }
    val paint = remember { Paint() }

    val shade = if (light) Color(0xFF0C201A) else Color.Black
    val shadeAlpha = if (light) 0.3f else 1f
    val blobAlpha = if (light) 0.26f else 0.52f

    Box(modifier.fillMaxSize()) {
        if (shader != null) {
            // 液态流沙：一次 fullscreen 片元着色，颜色以 uniform 进（每帧 4 个 float4）。
            Box(
                Modifier.fillMaxSize().drawBehind {
                    try {
                        shader.setFloatUniform("uRes", size.width, size.height)
                        val c = lerpPalette(from, to, fade.value)
                        shader.setFloatUniform("uTime", phase)
                        shader.setFloatUniform("uC0", c[0].red, c[0].green, c[0].blue, 1f)
                        shader.setFloatUniform("uC1", c[1].red, c[1].green, c[1].blue, 1f)
                        shader.setFloatUniform("uC2", c[2].red, c[2].green, c[2].blue, 1f)
                        shader.setFloatUniform("uC3", c[3].red, c[3].green, c[3].blue, 1f)
                        val glow = c[4]
                        shader.setFloatUniform("uGlow", glow.red, glow.green, glow.blue)
                        shader.setFloatUniform("uGlowI", if (light) 0.10f else 0.15f)
                        shader.setFloatUniform("uShade", if (light) 1.0f else 0.92f)
                        paint.shader = shader
                        drawContext.canvas.nativeCanvas.drawRect(0f, 0f, size.width, size.height, paint)
                    } catch (_: Throwable) {
                        // 单帧 uniform 设置异常不该带垮整页：跳过这一帧的背景绘制。
                    }
                }
            )
        } else {
            // 回退路径（API < 33 或 shader 编译失败）：旧的洗色 + 三光斑。
            Box(
                Modifier.fillMaxSize().drawBehind {
                    val c = lerpPalette(from, to, fade.value)
                    drawRect(
                        Brush.linearGradient(
                            colors = listOf(c[1], c[0], c[2]),
                            start = Offset(0f, 0f),
                            end = Offset(size.width * 0.47f, size.height),
                        )
                    )
                }
            )
            Canvas(Modifier.fillMaxSize()) {
                val c = lerpPalette(from, to, fade.value)
                val t = if (animate) phase else 0f
                BLOBS.forEach { blob ->
                    val theta = 2f * PI.toFloat() * (t / (blob.periodSec * 10f) + blob.phaseOffset)
                    drawBlob(
                        palette = c,
                        blob = blob,
                        drift = Offset(
                            x = size.width * 0.13f * sin(theta),
                            y = size.height * 0.10f * cos(theta),
                        ),
                        alpha = blobAlpha,
                    )
                }
            }
            // 3. 压暗 + 暗角：整屏，不参与任何变换（shader 路径内置等价项）。
            Box(
                Modifier.fillMaxSize().drawBehind {
                    drawRect(
                        Brush.verticalGradient(
                            0f to shade.copy(alpha = 0.18f * shadeAlpha),
                            0.35f to Color.Transparent,
                            1f to shade.copy(alpha = 0.30f * shadeAlpha),
                        )
                    )
                    drawRect(
                        Brush.radialGradient(
                            colors = listOf(Color.Transparent, shade.copy(alpha = 0.30f * shadeAlpha)),
                            center = Offset(size.width * 0.5f, size.height * 0.42f),
                            radius = size.maxDimension * 0.78f,
                        )
                    )
                }
            )
        }
    }
}

/** 一片椭圆光斑。`scale(1, ry/rx)` 把圆压成椭圆，比自定义 shader 便宜，也还是纯渐变。 */
private fun DrawScope.drawBlob(
    palette: List<Color>,
    blob: Blob,
    drift: Offset,
    alpha: Float,
) {
    val color = auroraGlow(palette[blob.colorIndex]).copy(alpha = alpha)
    val center = Offset(size.width * blob.centerX, size.height * blob.centerY) + drift
    val rx = size.width * blob.radiusX
    val ry = size.height * blob.radiusY
    val brush = Brush.radialGradient(
        colorStops = arrayOf(0f to color, 0.76f to Color.Transparent),
        center = center,
        radius = rx,
    )
    withTransform({ scale(1f, ry / rx, pivot = center) }) {
        drawCircle(brush = brush, radius = rx, center = center)
    }
}

/**
 * `minimalAuroraGlow`：把封面派生色提亮到 `l = .62`、饱和度夹在 `.42..72` 再画光斑。
 *
 * 少了这一步，深色主题下光斑用的是 field 原色（l ≈ .2），叠在同样是 .1 的底色上等于没画。
 */
private fun auroraGlow(color: Color): Color {
    val channels = rgbToHsl(
        Rgb(
            (color.red * 255f).roundToInt().coerceIn(0, 255),
            (color.green * 255f).roundToInt().coerceIn(0, 255),
            (color.blue * 255f).roundToInt().coerceIn(0, 255),
        )
    )
    val glow = channels.copy(
        s = (channels.s * 1.2f).coerceIn(0.42f, 0.72f),
        l = 0.62f,
    )
    return Color(argb(hslToRgb(glow)))
}
