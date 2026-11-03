package io.github.huleixin.tingyu.minimal

import android.graphics.Bitmap
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalPalette.kt
//
// 封面取色：`minimal-stage/minimalPalette.ts` 的逐条移植。
//
// 为什么不在 Kotlin 里"重新设计"一套取色：这套规则每一条都是为了修一个具体的观感缺陷
// （夕阳封面变橄榄绿、黑白封面变霓虹、金牌音质角标在白底上消失）。换一套规则就是换一套缺陷。
// 这里只做语言移植，常量、分级、阈值都与原文件一一对应；差异只有一处：
// 颜色用 ARGB Int 返回，由 UI 层转成 Compose 的 Color。

/** 听屿的墨色色相。188° 是偏蓝的青绿 —— 168° 会把暖色封面的琥珀雾混成橄榄色。 */
const val TINGYU_INK_HUE = 188f

/** sRGB → HSL。与原实现的 HSL 定义一致（l = (max+min)/2，s = delta/(1-|2l-1|)）。 */
data class Hsl(val h: Float, val s: Float, val l: Float)

data class Rgb(val r: Int, val g: Int, val b: Int)

private fun clamp(value: Float, low: Float, high: Float) = min(high, max(low, value))
private fun clampInt(value: Float) = clamp(value, 0f, 255f).roundToInt()
private fun clamp01(value: Double) = min(1.0, max(0.0, value))

fun rgbToHsl(rgb: Rgb): Hsl {
    val r = rgb.r / 255f
    val g = rgb.g / 255f
    val b = rgb.b / 255f
    val max = max(r, max(g, b))
    val min = min(r, min(g, b))
    val delta = max - min
    val l = (max + min) / 2f
    if (delta == 0f) return Hsl(0f, 0f, l)
    val s = delta / (1f - abs(2f * l - 1f))
    val h = when (max) {
        r -> ((g - b) / delta).mod(6f)
        g -> (b - r) / delta + 2f
        else -> (r - g) / delta + 4f
    }
    return Hsl((h * 60f + 360f) % 360f, clamp01(s.toDouble()).toFloat(), l)
}

fun hslToRgb(hsl: Hsl): Rgb {
    val chroma = (1f - abs(2f * hsl.l - 1f)) * hsl.s
    val sector = (((hsl.h % 360f) + 360f) % 360f) / 60f
    val second = chroma * (1f - abs((sector % 2f) - 1f))
    val offset = hsl.l - chroma / 2f
    val parts = when {
        sector < 1f -> floatArrayOf(chroma, second, 0f)
        sector < 2f -> floatArrayOf(second, chroma, 0f)
        sector < 3f -> floatArrayOf(0f, chroma, second)
        sector < 4f -> floatArrayOf(0f, second, chroma)
        sector < 5f -> floatArrayOf(second, 0f, chroma)
        else -> floatArrayOf(chroma, 0f, second)
    }
    return Rgb(
        clampInt((parts[0] + offset) * 255f),
        clampInt((parts[1] + offset) * 255f),
        clampInt((parts[2] + offset) * 255f),
    )
}

fun argb(rgb: Rgb, alpha: Int = 255): Int =
    (alpha shl 24) or (clampInt(rgb.r.toFloat()) shl 16) or
        (clampInt(rgb.g.toFloat()) shl 8) or clampInt(rgb.b.toFloat())

/** 色环上走最短路径；少了它会从青绿经红色绕到绿色。 */
fun blendHue(from: Float, to: Float, amount: Float): Float {
    val delta = ((to - from + 540f) % 360f) - 180f
    return (from + delta * amount + 360f) % 360f
}

private fun linearChannel(value: Int): Double {
    val channel = clamp01(value / 255.0)
    return if (channel <= 0.04045) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)
}

fun relativeLuminance(rgb: Rgb): Double =
    0.2126 * linearChannel(rgb.r) + 0.7152 * linearChannel(rgb.g) + 0.0722 * linearChannel(rgb.b)

fun contrastRatio(foreground: Rgb, background: Rgb): Double {
    val a = relativeLuminance(foreground)
    val b = relativeLuminance(background)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)
}

private data class Bounds(
    val hue: Float? = null,
    val huePull: Float = 0.4f,
    val s: ClosedFloatingPointRange<Float>,
    val l: ClosedFloatingPointRange<Float>,
)

private fun constrain(color: Hsl, bounds: Bounds): Hsl = Hsl(
    h = bounds.hue?.let { blendHue(color.h, it, bounds.huePull) } ?: color.h,
    s = clamp(color.s, bounds.s.start, bounds.s.endInclusive),
    l = clamp(color.l, bounds.l.start, bounds.l.endInclusive),
)

data class Bucket(val count: Int, val r: Float, val g: Float, val b: Float)

/**
 * 4 bit/通道的粗直方图。够便宜（每张封面算一次），也够粗 —— JPEG 噪点不会把一个颜色拆成二十个"冠军"。
 */
fun quantizeSamples(samples: List<Rgb>): List<Bucket> {
    val buckets = HashMap<Int, FloatArray>(64)
    for (sample in samples) {
        val hsl = rgbToHsl(sample)
        // 近黑近白没有可用色相：它们是画框、反光或者纸。
        if (hsl.l < 0.08f || hsl.l > 0.94f || hsl.s < 0.04f) continue
        val key = ((sample.r shr 4) shl 8) or ((sample.g shr 4) shl 4) or (sample.b shr 4)
        val bucket = buckets[key]
        if (bucket == null) {
            buckets[key] = floatArrayOf(1f, sample.r.toFloat(), sample.g.toFloat(), sample.b.toFloat())
        } else {
            bucket[0] += 1f
            bucket[1] += sample.r
            bucket[2] += sample.g
            bucket[3] += sample.b
        }
    }
    return buckets.values
        .map { Bucket(it[0].toInt(), it[1] / it[0], it[2] / it[0], it[3] / it[0]) }
        .sortedByDescending { it.count }
}

private fun hueDistance(left: Float, right: Float) = abs(((left - right + 540f) % 360f) - 180f)

/** 五个页面颜色都从这四个里派生。平均色才是环境光，不是"最饱和的那桶"。 */
data class CoverColors(
    val primary: Hsl,
    val secondary: Hsl,
    val accent: Hsl,
    val average: Hsl,
)

/**
 * 从直方图里挑页面用色。
 *
 * 不是"出现最多的颜色"：夕阳封面的绝大部分是灰蓝天空，取最大桶会让每张这种封面都变成同一个青绿页。
 * 封面的环境色是它的**彩色部分**，所以先按最饱和的桶划一条线，把同主题的两三个相邻色相留下，
 * 再按"像素数 × 饱和度"加权平均。接近单色的封面退回整体均值 —— 黑白印刷品就该看起来是黑白的。
 */
fun pickCoverColors(buckets: List<Bucket>): CoverColors? {
    if (buckets.isEmpty()) return null
    val total = buckets.sumOf { it.count }
    if (total < 12) return null

    fun mean(list: List<Bucket>, weight: (Bucket) -> Double): Rgb {
        var sum = 0.0
        var r = 0.0
        var g = 0.0
        var b = 0.0
        for (bucket in list) {
            val w = weight(bucket)
            sum += w
            r += bucket.r * w
            g += bucket.g * w
            b += bucket.b * w
        }
        return if (sum > 0) Rgb((r / sum).roundToInt(), (g / sum).roundToInt(), (b / sum).roundToInt()) else Rgb(0, 0, 0)
    }

    fun saturationOf(bucket: Bucket) = rgbToHsl(Rgb(bucket.r.roundToInt(), bucket.g.roundToInt(), bucket.b.roundToInt())).s

    val maxSaturation = buckets.maxOf { saturationOf(it) }
    // 峰值的 55% 保住同一主体的两三个相邻色相，扔掉它周围的灰天气。0.12 以下"彩色"只是噪声。
    val threshold = max(0.12f, maxSaturation * 0.55f)
    val vivid = buckets.filter { saturationOf(it) >= threshold }
    val chromatic = rgbToHsl(mean(if (vivid.isNotEmpty()) vivid else buckets) { it.count * saturationOf(it).toDouble() })
    val average = rgbToHsl(mean(buckets) { it.count.toDouble() })

    val distinct = vivid.firstOrNull { hueDistance(rgbToHsl(Rgb(it.r.roundToInt(), it.g.roundToInt(), it.b.roundToInt())).h, chromatic.h) > 24f }
    val secondary = distinct?.let { rgbToHsl(Rgb(it.r.roundToInt(), it.g.roundToInt(), it.b.roundToInt())) }
        ?: chromatic.copy(h = (chromatic.h + 26f) % 360f, l = chromatic.l * 0.9f)
    val accentSource = (if (vivid.isNotEmpty()) vivid else buckets)
        .map { rgbToHsl(Rgb(it.r.roundToInt(), it.g.roundToInt(), it.b.roundToInt())) }
        .maxByOrNull { it.s * 0.6f + it.l * 0.4f }
        ?: chromatic

    return CoverColors(primary = chromatic, secondary = secondary, accent = accentSource, average = average)
}

private typealias FloatSpan = ClosedFloatingPointRange<Float>

private data class Scale(
    val base: Pair<FloatSpan, FloatSpan>,
    val primary: Pair<FloatSpan, FloatSpan>,
    val secondary: Pair<FloatSpan, FloatSpan>,
    val bloom: Pair<FloatSpan, FloatSpan>,
    val accent: Pair<FloatSpan, FloatSpan>,
)

private fun range(a: Float, b: Float): FloatSpan = a..b

/* 深色：地板是墨绿（207°，不是 168°），被封面染一点。亮度低、饱和度中等，
   这才是"一张强封面不变成亮海报"的来源。 */
private val DARK = Scale(
    base = range(0.30f, 0.44f) to range(0.09f, 0.12f),
    primary = range(0.36f, 0.56f) to range(0.15f, 0.235f),
    secondary = range(0.34f, 0.52f) to range(0.13f, 0.20f),
    bloom = range(0.42f, 0.62f) to range(0.22f, 0.32f),
    accent = range(0.34f, 0.58f) to range(0.63f, 0.75f),
)

/* 浅色：同样的色相当纸面，两个主题才像同一个设计。 */
private val LIGHT = Scale(
    base = range(0.12f, 0.26f) to range(0.95f, 0.972f),
    primary = range(0.20f, 0.42f) to range(0.82f, 0.89f),
    secondary = range(0.16f, 0.36f) to range(0.86f, 0.93f),
    bloom = range(0.24f, 0.50f) to range(0.70f, 0.82f),
    accent = range(0.40f, 0.62f) to range(0.33f, 0.44f),
)

/**
 * 琥珀是唯一不能原样使用的色带：金色雾在 20% 亮度上压在墨青地板上会平均成橄榄色 ——
 * 不是"脏封面"，是"脏页面"。18°–100° 的色相按距离向余烬（红橙）旋转 90%。
 */
fun emberShift(hue: Float): Float {
    val from = 18f
    val to = 100f
    if (hue <= from || hue >= to) return hue
    return hue - (hue - from) * 0.9f
}

/**
 * 逐字高亮色：从封面代表色里取一个柔和高光，再按保守包络校验对比度。
 *
 * 动态背景会露出一块发光的渐变色斑，所以"和深色地板对比够"并不够；这里对一组亮灰包络取最小对比度，
 * 不够就一点点提亮（深色）/压暗（浅色），直到达标或走完范围。
 */
fun buildLyricAccent(
    primary: Hsl,
    accentSource: Hsl,
    light: Boolean,
    derived: Boolean,
    average: Hsl?,
): Hsl {
    val coverHasUsableHue = derived && primary.s >= 0.14f && (average?.s ?: primary.s) >= 0.10f
    val sampledButNeutral = derived && !coverHasUsableHue
    val hue = when {
        coverHasUsableHue -> blendHue(primary.h, accentSource.h, 0.12f)
        sampledButNeutral -> 36f
        else -> accentSource.h
    }
    val saturation = when {
        coverHasUsableHue -> clamp(primary.s * 0.68f + accentSource.s * 0.08f, 0.30f, 0.62f)
        sampledButNeutral -> if (light) 0.20f else 0.16f
        else -> clamp(accentSource.s * 0.52f, 0.18f, 0.38f)
    }
    val target = when {
        sampledButNeutral -> if (light) 0.32f else 0.79f
        light -> 0.34f
        else -> 0.74f
    }
    val step = if (light) -0.01f else 0.01f
    val minimumContrast = if (light) 4.5 else 3.0
    val envelope = if (light) listOf(Rgb(230, 230, 230), Rgb(246, 246, 246))
    else listOf(Rgb(96, 96, 96), Rgb(112, 112, 112))

    var lightness = target
    var candidate = hslToRgb(Hsl(hue, saturation, lightness))
    while (lightness > 0.22f && lightness < 0.96f &&
        envelope.minOf { contrastRatio(candidate, it) } < minimumContrast
    ) {
        lightness += step
        candidate = hslToRgb(Hsl(hue, saturation, lightness))
    }
    return Hsl(hue, saturation, lightness)
}

/** 页面直接可用的五个颜色（ARGB）。 */
data class MinimalPalette(
    val base: Int,
    val fieldPrimary: Int,
    val fieldSecondary: Int,
    val bloom: Int,
    val accent: Int,
    val lyricAccent: Int,
    val derived: Boolean,
)

/**
 * 五个颜色。
 *
 * 深色保留听屿的墨绿地基、让封面作为叠加上色；浅色用同样的色相当纸面。
 * `colors` 允许为 null：封面读不出来时仍要能画，此时用主题色并把 derived 标成 false。
 */
fun buildMinimalPalette(colors: CoverColors?, light: Boolean): MinimalPalette {
    val scale = if (light) LIGHT else DARK
    if (colors == null) {
        // 读不出封面：用极简页的初始值，不发明色相。
        val base = if (light) Hsl(188f, 0.16f, 0.96f) else Hsl(188f, 0.38f, 0.10f)
        val fieldA = if (light) Hsl(168f, 0.30f, 0.86f) else Hsl(188f, 0.45f, 0.19f)
        val fieldB = if (light) Hsl(196f, 0.26f, 0.89f) else Hsl(196f, 0.42f, 0.16f)
        val bloomC = if (light) Hsl(36f, 0.35f, 0.76f) else Hsl(188f, 0.50f, 0.27f)
        val accentC = if (light) Hsl(188f, 0.50f, 0.38f) else Hsl(168f, 0.46f, 0.69f)
        val lyricC = if (light) Hsl(188f, 0.45f, 0.34f) else Hsl(168f, 0.42f, 0.74f)
        return MinimalPalette(
            base = argb(hslToRgb(base)),
            fieldPrimary = argb(hslToRgb(fieldA)),
            fieldSecondary = argb(hslToRgb(fieldB)),
            bloom = argb(hslToRgb(bloomC)),
            accent = argb(hslToRgb(accentC)),
            lyricAccent = argb(hslToRgb(lyricC)),
            derived = false,
        )
    }
    val primary = colors.primary
    val secondary = colors.secondary
    val accentSource = colors.accent

    // 地板是墨色加一点封面，不是反过来：把橙色色相往 168° 拉 55% 会穿过黄绿落到橄榄色，
    // 那正是"夕阳封面产出沼泽绿页面"的成因。
    val base = constrain(
        Hsl(blendHue(TINGYU_INK_HUE, primary.h, 0.05f), primary.s * 0.5f + 0.16f, primary.l),
        Bounds(s = scale.base.first, l = scale.base.second),
    )
    val fieldPrimary = constrain(
        primary.copy(h = emberShift(primary.h)),
        Bounds(hue = TINGYU_INK_HUE, huePull = 0.02f, s = scale.primary.first, l = scale.primary.second),
    )
    val fieldSecondary = constrain(
        secondary.copy(h = emberShift(secondary.h)),
        Bounds(hue = TINGYU_INK_HUE, huePull = 0.02f, s = scale.secondary.first, l = scale.secondary.second),
    )
    // 接近灰的平均色在 HSL 里色相是 0，把饱和度拉起来会在一块黑白封面后面画一团红光。
    val averageHasHue = colors.average.s > 0.07f
    val bloomSource = if (averageHasHue) colors.average
    else Hsl(TINGYU_INK_HUE, colors.average.s, colors.average.l)
    val bloom = constrain(
        bloomSource.copy(h = emberShift(bloomSource.h)),
        Bounds(hue = TINGYU_INK_HUE, huePull = 0.02f, s = scale.bloom.first, l = scale.bloom.second),
    )
    val accent = constrain(
        accentSource,
        Bounds(hue = TINGYU_INK_HUE, huePull = 0.88f, s = scale.accent.first, l = scale.accent.second),
    )
    val lyricAccent = buildLyricAccent(primary, accentSource, light, true, colors.average)

    return MinimalPalette(
        base = argb(hslToRgb(base)),
        fieldPrimary = argb(hslToRgb(fieldPrimary)),
        fieldSecondary = argb(hslToRgb(fieldSecondary)),
        bloom = argb(hslToRgb(bloom)),
        accent = argb(hslToRgb(accent)),
        lyricAccent = argb(hslToRgb(lyricAccent)),
        derived = true,
    )
}

/** 28×28 采样，与原实现同尺寸、同跳采样（每两个像素取一个）、同透明度门槛。 */
fun sampleBitmap(bitmap: Bitmap, size: Int = 28): List<Rgb> {
    val scaled = if (bitmap.width == size && bitmap.height == size) bitmap
    else Bitmap.createScaledBitmap(bitmap, size, size, true)
    val pixels = IntArray(size * size)
    scaled.getPixels(pixels, 0, size, 0, 0, size, size)
    if (scaled !== bitmap) scaled.recycle()
    val samples = ArrayList<Rgb>(size * size / 2)
    var index = 0
    while (index < pixels.size) {
        val pixel = pixels[index]
        val alpha = (pixel ushr 24) and 0xFF
        if (alpha >= 160) {
            samples += Rgb((pixel shr 16) and 0xFF, (pixel shr 8) and 0xFF, pixel and 0xFF)
        }
        index += 2
    }
    return samples
}

/** 一步到位：位图 → 封面配色。失败返回 null（调用方保留主题色）。 */
fun coverColorsOf(bitmap: Bitmap?): CoverColors? {
    if (bitmap == null || bitmap.isRecycled) return null
    return try {
        pickCoverColors(quantizeSamples(sampleBitmap(bitmap)))
    } catch (_: Throwable) {
        null
    }
}
