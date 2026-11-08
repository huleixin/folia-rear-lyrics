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
// 封面取色的动态背景（第 18 轮重做：「柔雾液态渐变 + 极轻微丝绸流动感」）。
//
// 上一版（域扭曲 fbm）的问题：fbm 的多倍频结构和 `f*f*2.4`、`length(q)`、`r.y*r.y`
// 这类非线性权重直接控制大面积颜色分区，屏幕上出现多边形/折叠纸片式的色块边界。
//
// 这一版从颜色场的生成方式上改：
//   · **稳定底**：base→fieldPrimary 的对角缓变是画面的根基，所有动态停了也是一张
//     柔和渐变壁纸；
//   · **三团超宽柔雾色域**（覆盖 70%~120% 屏宽）：色域是**平滑径向 falloff**
//     （smoothstep 过渡带横跨大半半径），互相大面积重叠 —— 没有直线、折角、封闭色块；
//   · **噪声只推位置不进颜色**：低频（约一屏一个特征）2 倍频噪声把色域中心推动
//     ±9%，色域像被水推着的颜料缓慢变形，而过渡带始终宽阔，不可能出现硬边；
//   · **异向异周期**：A 21s/26s 斜向、B 27s/30s 反向、C 35s/41s 缓升，柔光
//     37s/43s —— 各层不同方向不同相位，没有同步闭环，也没有循环接缝（时间线性累计）；
//   · **文字对比度**：暗角与上下轻压内建，色域强度 0.30~0.42 封顶，歌词背后不会
//     突然变亮。
//
// 调色整形（softenAmbience）：鲜艳封面把场色饱和度压到 ≤0.55、与底色的明度差收窄；
// 相近封面由 shader 的三团异位色域自然分层，不强行造色块。
//
// 两条路径：API 33+ 走 AGSL（一次全屏片元着色，零 CPU 模糊）；以下或编译失败回退
// 旧的渐变 + 光斑画法。节流与暂停：相位以 30fps 推进但按**完整间隔**累计（第 18 轮
// 修复：旧实现每步只加最近一帧的 delta，高刷屏上动画整体变慢数倍），后台/息屏/暂停
// 时帧循环停摆、相位冻结，恢复从同一相位继续；换歌颜色沿 760ms 过渡，不闪白黑。
// 状态全部组件私有：歌词页零重组零重绘。

/** AGSL 柔雾液态着色器。时间线性累计（无 mod 周期），没有循环接缝。 */
private const val SOFT_FOG_AGSL = """
uniform float2 uRes;
uniform float uTime;
uniform float4 uC0;   // base（不动，页面对比度的锚）
uniform float4 uC1;   // fieldPrimary（柔雾主色）
uniform float4 uC2;   // fieldSecondary
uniform float4 uC3;   // bloom
uniform float3 uGlow; // 柔光色（accent，已整形）
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

half4 main(float2 fragCoord) {
    float2 uv = fragCoord / uRes;
    float t = uTime;
    float aspect = uRes.x / max(uRes.y, 1.0);
    // 屏幕空间（短边 = 1），所有半径/幅度都以屏为单位。
    float2 p = float2(uv.x * aspect, uv.y);
    float span = max(aspect, 1.0);

    // 稳定底：对角缓变。动态全停也是一张柔和渐变壁纸。
    float3 col = mix(uC0.rgb, uC1.rgb, smoothstep(0.12, 0.96, uv.y * 0.72 + uv.x * 0.28));

    // 弱形变场：低频噪声（~一屏一个特征）只负责推动色域中心，幅度 ±9% 屏。
    // 噪声不进颜色权重 —— 没有可辨的纹理，只有色域在缓慢变形流动。
    float w1 = noise(p * 1.1 + float2(t * 0.021, -t * 0.017)) - 0.5;
    float w2 = noise(p * 0.9 + float2(7.3, 2.9) - float2(t * 0.019, t * 0.023)) - 0.5;
    float w3 = noise(p * 1.0 + float2(3.7, 8.1) + float2(-t * 0.016, t * 0.020)) - 0.5;
    float2 warpA = float2(w1, w2) * 0.18;
    float2 warpB = float2(w2, w3) * 0.18;
    float2 warpC = float2(w3, w1) * 0.16;

    // 色域 A（21s / 26s，斜向）：半径 ~86% 屏宽，过渡带横跨大半半径 —— 无边可寻。
    float2 cA = float2(0.30 + 0.16 * sin(t * 0.299) + warpA.x,
                       0.34 + 0.14 * cos(t * 0.241) + warpA.y) * float2(aspect, 1.0);
    float mA = smoothstep(1.0, 0.10, length(p - cA) / (0.86 * span));
    col = mix(col, uC1.rgb, mA * 0.42);

    // 色域 B（27s / 30s，反向漂移），半径 ~95%。
    float2 cB = float2(0.74 + 0.15 * sin(t * 0.232 + 2.1) + warpB.x,
                       0.60 + 0.15 * sin(t * 0.209 + 0.8) + warpB.y) * float2(aspect, 1.0);
    float mB = smoothstep(1.0, 0.05, length(p - cB) / (0.95 * span));
    col = mix(col, uC2.rgb, mB * 0.38);

    // 色域 C（35s / 41s，缓升），半径 ~105% —— 最宽最淡，垫在最深处。
    float2 cC = float2(0.50 + 0.20 * sin(t * 0.181 + 4.2) + warpC.x,
                       0.88 + 0.12 * cos(t * 0.153 + 1.4) + warpC.y) * float2(aspect, 1.0);
    float mC = smoothstep(1.0, 0.0, length(p - cC) / (1.05 * span));
    col = mix(col, uC3.rgb, mC * 0.30);

    // 柔光：一团极淡亮晕以 37s/43s 不可公度周期绕场，比色域更慢更淡。
    float2 gc = float2(0.5 + 0.34 * sin(t * 0.170), 0.42 + 0.30 * cos(t * 0.145));
    float glow = exp(-3.2 * length((uv - gc) * float2(aspect, 1.0)));
    col += uGlow * glow * uGlowI;

    // 暗角 + 整体明度系数：歌词区域的对比度不随色域移动而变化。
    float vig = smoothstep(1.35, 0.4, length((uv - float2(0.5, 0.46)) * float2(aspect, 1.0) * 0.9));
    col *= mix(0.86, 1.0, vig);
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

private fun toRgb255(color: Color): Rgb = Rgb(
    (color.red * 255f).roundToInt().coerceIn(0, 255),
    (color.green * 255f).roundToInt().coerceIn(0, 255),
    (color.blue * 255f).roundToInt().coerceIn(0, 255),
)

/**
 * 场色明度的允许区间：以 base 为锚上下收窄，再整体夹进主题的绝对区间。
 *
 * `baseL` 来自桥上的配色（`buildMinimalPalette`：浅色 base 带 0.95~0.972、深色 0.09~0.12），
 * 主题却来自另一个字段。两者不同源时（浅色配色配深色主题，或桥断线时沿用的旧配色配默认主题），
 * `baseL ± Δ` 会和主题区间**互斥**。旧实现把这两个端点原样交给 `coerceIn(min, max)`，
 * Kotlin 在 min > max 时抛 `IllegalArgumentException: Cannot coerce value to an empty range`
 * —— 而它发生在组合期间，于是整页连带进程一起结束（1.3.182 的启动闪退）。
 *
 * 这里先把两个端点**单调**收敛进主题区间，端点顺序天然成立；配色越界时退化为主题上限，
 * 场色仍然压在背景深处，不会因为配色错位把整页刷白。
 */
private fun fieldLightness(lightness: Float, baseL: Float, light: Boolean): Float {
    val floor = if (light) 0.10f else 0.05f
    val ceiling = if (light) 0.92f else 0.60f
    val start = (if (light) baseL - 0.20f else baseL - 0.02f).coerceIn(floor, ceiling)
    val end = (if (light) baseL + 0.06f else baseL + 0.20f).coerceIn(floor, ceiling)
    // start <= end：coerceIn 单调，所以这两个端点是排好序的，不会再构成空区间。
    return lightness.coerceIn(start, end)
}

/**
 * 柔雾配色整形（第 18 轮）：只整**场色与柔光**，不碰 base —— 页面文字对比度锚在
 * base 上。鲜艳封面：场色饱和度压到 ≤0.55；明度差（浅色主题向下、深色主题向上）
 * 收窄到 ≤0.20 —— 色域再亮也压在背景深处。相近封面：shader 的三团异位色域自然
 * 分层，不强行造色块。
 */
internal fun softenAmbience(colors: List<Color>, light: Boolean): List<Color> {
    if (colors.size < 5) return colors
    val baseL = rgbToHsl(toRgb255(colors[0])).l
    fun softenField(color: Color): Color {
        val hsl = rgbToHsl(toRgb255(color))
        val s = hsl.s.coerceAtMost(0.55f)
        val l = fieldLightness(hsl.l, baseL, light)
        return Color(argb(hslToRgb(hsl.copy(s = s, l = l))))
    }
    val glowHsl = rgbToHsl(toRgb255(colors[4]))
    val glow = Color(
        argb(
            hslToRgb(
                glowHsl.copy(s = glowHsl.s.coerceAtMost(0.50f), l = 0.66f)
            )
        )
    )
    return listOf(colors[0], softenField(colors[1]), softenField(colors[2]), softenField(colors[3]), glow)
        .plus(colors.drop(5))
}

@Composable
fun MinimalAmbience(
    colors: List<Color>,
    light: Boolean,
    paused: Boolean,
    still: Boolean,
    modifier: Modifier = Modifier,
) {
    // 调色整形在过渡边界之前：换歌的 760ms 渐变 lerp 的是整形后的值，不会中途变色。
    val softened = remember(colors, light) { softenAmbience(colors, light) }
    var from by remember { mutableStateOf(softened) }
    var to by remember { mutableStateOf(softened) }
    val fade = remember { Animatable(1f) }
    // 换歌时 760ms 从旧配色过渡到新配色（CSS 的 transition），不重建任何图层。
    LaunchedEffect(softened) {
        if (to == softened) return@LaunchedEffect
        from = lerpPalette(from, to, fade.value)
        to = softened
        fade.snapTo(0f)
        fade.animateTo(1f, tween(760, easing = LinearEasing))
    }

    val animate = !still && !paused
    // 相位：连续累计秒（无 mod 周期 → 无循环接缝）。30fps 节流，但按**完整间隔**
    // 累计：从上次实际推进到本次跨过门槛的整段时间都算上 —— 旧实现每步只加最近
    // 一帧的 delta，120Hz 屏上动画只有真实速度的 1/4。后台/息屏/暂停时帧循环停摆，
    // 相位冻结；恢复时新循环从当前相位继续，不补后台经过的时间，无跳变。
    var phase by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        var lastStep = 0L
        while (true) {
            withFrameNanos { now ->
                if (lastStep == 0L) {
                    lastStep = now
                    return@withFrameNanos
                }
                val elapsed = now - lastStep
                if (elapsed >= 33_000_000L) {
                    phase += elapsed / 1_000_000_000f
                    lastStep = now
                }
            }
        }
    }

    // RuntimeShader 编译失败（个别 ROM 的 AGSL 方言差异）自动退回光斑画法。
    val shader = remember {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                RuntimeShader(SOFT_FOG_AGSL)
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
            // 柔雾液态：一次全屏片元着色，颜色以 uniform 进（每帧 4 个 float4 + 时间）。
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
                        shader.setFloatUniform("uGlowI", if (light) 0.06f else 0.09f)
                        shader.setFloatUniform("uShade", if (light) 1.0f else 0.92f)
                        paint.shader = shader
                        drawContext.canvas.nativeCanvas.drawRect(0f, 0f, size.width, size.height, paint)
                    } catch (_: Throwable) {
                        // 单帧 uniform 设置异常不该带垮整页：跳过这一帧的背景绘制。
                    }
                }
            )
        } else {
            // 回退路径（API < 33 或 shader 编译失败）：渐变底 + 三光斑（同样是纯柔边）。
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
    val channels = rgbToHsl(toRgb255(color))
    val glow = channels.copy(
        s = (channels.s * 1.2f).coerceIn(0.42f, 0.72f),
        l = 0.62f,
    )
    return Color(argb(hslToRgb(glow)))
}
