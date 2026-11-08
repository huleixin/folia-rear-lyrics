package io.github.huleixin.tingyu.chrome

import android.graphics.Paint
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

// android/app/src/debug/java/io/github/huleixin/tingyu/chrome/GlassLabActivity.kt
//
// 液态玻璃诊断台（debug-only，Release 不包含）。
//
// 目的：把"折射到底有没有生效"从主观判断变成可切换、可放大、可读数的对照实验。
//
//   · 背景可选：高对比棋盘 / 斜线 / 文字 / 彩色条 —— 都是能暴露"线条有没有被弯折"的图案
//   · 同一块面板、同一位置，原地切换 Blur Only / Lens Only / Blur + Lens
//   · 装饰层（高光 / 内阴影 / 环境反射）、表面底色、depthEffect 独立开关
//   · 模糊 / 折射带 / 位移三个参数可实时拖，拖到"线条明显弯折"即为该机可辨识阈值
//   · 顶部实时打印 AGSL 是否可用、像素级参数，以及 visibleRim / rimToBlur
//
// 读数含义（与 Shaders.kt 的 circleMap 同构）：
//   visibleRim = 背景位移 ≥ 一倍模糊半径的环宽；rimToBlur < 1 时肉眼只会看到模糊。
class GlassLabActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContent { GlassLab() }
    }
}

private val Patterns = listOf("棋盘", "斜线", "文字", "彩色")
private val Modes = listOf("Blur Only", "Lens Only", "Blur + Lens")

@Composable
private fun GlassLab() {
    var pattern by remember { mutableIntStateOf(0) }
    var mode by remember { mutableIntStateOf(2) }
    var decorations by remember { mutableStateOf(false) }
    var tint by remember { mutableStateOf(false) }
    var dark by remember { mutableStateOf(false) }
    var depth by remember { mutableStateOf(false) }
    var blur by remember { mutableFloatStateOf(5f) }
    var lensHeight by remember { mutableFloatStateOf(24f) }
    var lensAmount by remember { mutableFloatStateOf(24f) }
    var drift by remember { mutableFloatStateOf(0f) }
    // 设备端自检：关/开 lens 各抓一帧，直接算像素差，把"折射有没有跑"变成数字。
    var lensEnabled by remember { mutableStateOf(true) }
    var report by remember { mutableStateOf("自检：未运行") }
    var checking by remember { mutableStateOf(false) }
    val capture = rememberGraphicsLayer()
    val scope = rememberCoroutineScope()

    val bg = rememberLayerBackdrop()
    val density = LocalDensity.current.density
    val live = ChromeGlassPresets.Default.copy(
        blur = blur.dp,
        lensHeight = lensHeight.dp,
        lensAmount = lensAmount.dp,
        depthEffect = depth,
    )
    val spec = when (mode) {
        0 -> live.copy(lensHeight = 0.dp, lensAmount = 0.dp)
        1 -> live.copy(blur = 0.dp)
        else -> live
    }.let { if (lensEnabled) it else it.copy(lensHeight = 0.dp, lensAmount = 0.dp) }
    val ink = if (dark) Color(0xFFF2F6F4) else Color(0xFF15211C)
    val warn = if (live.rimToBlur >= 1f) ink.copy(alpha = .70f) else Color(0xFFD0532F)

    Box(
        Modifier
            .fillMaxSize()
            .background(if (dark) Color(0xFF06100D) else Color(0xFFEDF0EC))
            .drawWithContent {
                // 整屏录进一个 GraphicsLayer：自检时 toImageBitmap() 取像素。
                capture.record(
                    density = this,
                    layoutDirection = layoutDirection,
                    size = androidx.compose.ui.unit.IntSize(size.width.roundToInt(), size.height.roundToInt()),
                ) { this@drawWithContent.drawContent() }
                drawLayer(capture)
            },
    ) {
        // 背景层：先录进 backdrop，供面板采样（与生产代码同一套结构）。
        Box(Modifier.fillMaxSize().layerBackdrop(bg)) { PatternCanvas(pattern, dark, drift) }
        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp).padding(top = 52.dp, bottom = 16.dp)) {
            Text(
                "AGSL " + if (Build.VERSION.SDK_INT >= 33) "可用 (API ${Build.VERSION.SDK_INT})" else "不可用 (API ${Build.VERSION.SDK_INT} < 33)",
                color = ink, fontSize = 12.sp, fontWeight = FontWeight.Medium,
            )
            Text(
                "模糊 ${fmt(spec.blur.value)}dp　折射带 ${fmt(spec.lensHeight.value)}dp　位移 ${fmt(spec.lensAmount.value)}dp　密度 ${"%.2f".format(density)}x",
                color = ink.copy(alpha = .70f), fontSize = 12.sp,
            )
            Text(
                "visibleRim ${fmt(live.visibleRim)}dp　rimToBlur ${fmt(live.rimToBlur)}　边缘位移 ${fmt(spec.displacementAt(0f))}dp",
                color = warn, fontSize = 12.sp,
            )
            Text(report, color = if (report.startsWith("自检：Δ")) Color(0xFF1C7A52) else ink.copy(alpha = .62f), fontSize = 12.sp)
            Spacer(Modifier.height(26.dp))
            // 对照面板：同一位置、同一背景，切换模式即换效果。
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .chromeGlass(
                        backdrop = bg,
                        light = !dark,
                        radius = 32.dp,
                        spec = spec,
                        surfaceFill = if (tint) ChromeGlassPresets.NavFill else 0f,
                        decorations = decorations,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(Modes[mode], color = ink, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Modes.forEachIndexed { index, label -> LabChip(label, index == mode, ink) { mode = index } }
            }
            Spacer(Modifier.weight(1f))
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(if (dark) Color(0xF00A1512) else Color(0xF2FFFFFF), RoundedCornerShape(20.dp))
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Patterns.forEachIndexed { index, label -> LabChip(label, index == pattern, ink) { pattern = index } }
                }
                LabChip(if (checking) "自检中…" else "运行折射自检（关/开 lens 抓帧求差）", false, ink) {
                    if (!checking) scope.launch {
                        checking = true
                        mode = 2
                        lensEnabled = false
                        report = "自检：采集 lens OFF…"
                        withFrameNanos { }
                        withFrameNanos { }
                        val off = capture.toImageBitmap().asAndroidBitmap()
                        report = "自检：采集 lens ON…"
                        lensEnabled = true
                        withFrameNanos { }
                        withFrameNanos { }
                        val on = capture.toImageBitmap().asAndroidBitmap()
                        report = diffReport(off, on)
                        checking = false
                    }
                }
                LabToggle("装饰层（高光 / 内阴影 / 环境反射）", decorations, ink) { decorations = it }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LabToggle("表面底色", tint, ink) { tint = it }
                    LabToggle("depthEffect", depth, ink) { depth = it }
                    LabToggle("深色", dark, ink) { dark = it }
                }
                LabSlider("模糊半径", blur, 0f..12f, ink) { blur = it }
                LabSlider("折射带（镜片厚度）", lensHeight, 0f..40f, ink) { lensHeight = it }
                LabSlider("折射位移", lensAmount, 0f..40f, ink) { lensAmount = it }
                LabSlider("背景平移（看折射是否跟随）", drift, 0f..240f, ink) { drift = it }
                Text(
                    "判定：Lens Only 下背景线条必须被明显弯折/压缩；若 Blur Only 与 Blur+Lens 看不出差别，" +
                        "把模糊拖小、位移拖大再看。rimToBlur < 1 时基本只剩模糊。",
                    color = ink.copy(alpha = .52f), fontSize = 11.sp,
                )
            }
        }
    }
}

private fun fmt(v: Float) = if (abs(v - v.roundToInt()) < .01f) v.roundToInt().toString() else "%.1f".format(v)

/**
 * 关/开 lens 两帧的逐像素差。
 * 均值 <0.8/255 或受影响像素 <2% 时，说明折射在该机上没有产生可观测位移
 * （可能被跳过、被模糊吃掉，或参数太小）—— 这时不允许认为"折射已生效"。
 */
private fun diffReport(a: android.graphics.Bitmap, b: android.graphics.Bitmap): String {
    val w = minOf(a.width, b.width)
    val h = minOf(a.height, b.height)
    val step = 3
    var sum = 0L
    var hit = 0L
    var total = 0L
    var max = 0
    var y = 0
    while (y < h) {
        var x = 0
        while (x < w) {
            val p = a.getPixel(x, y)
            val q = b.getPixel(x, y)
            val d = (abs((p shr 16 and 0xFF) - (q shr 16 and 0xFF)) +
                abs((p shr 8 and 0xFF) - (q shr 8 and 0xFF)) +
                abs((p and 0xFF) - (q and 0xFF))) / 3
            sum += d
            if (d > 3) hit++
            if (d > max) max = d
            total++
            x += step
        }
        y += step
    }
    if (total == 0L) return "自检：抓帧失败"
    val mean = sum.toDouble() / total
    val ratio = hit.toDouble() / total
    val verdict = if (mean >= 0.8 && ratio >= 0.02) "Lens 生效" else "差异过小，折射未观测到"
    return "自检：Δ均值 %.2f/255 · 受影响 %.1f%% · 峰值 %d · %s".format(mean, ratio * 100, max, verdict)
}

@Composable
private fun LabChip(label: String, selected: Boolean, ink: Color, onClick: () -> Unit) {
    Box(
        Modifier
            .background(if (selected) ink.copy(alpha = .16f) else ink.copy(alpha = .06f), RoundedCornerShape(10.dp))
            .clickable(interactionSource = null, indication = null, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Text(label, color = ink, fontSize = 12.sp)
    }
}

@Composable
private fun LabToggle(label: String, checked: Boolean, ink: Color, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = ink.copy(alpha = .78f), fontSize = 11.sp)
        Spacer(Modifier.width(4.dp))
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = ink.copy(alpha = .48f)),
        )
    }
}

@Composable
private fun LabSlider(label: String, value: Float, range: ClosedFloatingPointRange<Float>, ink: Color, onChange: (Float) -> Unit) {
    Column {
        Row(Modifier.fillMaxWidth()) {
            Text(label, color = ink.copy(alpha = .78f), fontSize = 11.sp)
            Spacer(Modifier.weight(1f))
            Text("${fmt(value)}dp", color = ink.copy(alpha = .52f), fontSize = 11.sp)
        }
        Slider(
            value = value,
            onValueChange = onChange,
            valueRange = range,
            colors = SliderDefaults.colors(thumbColor = ink, activeTrackColor = ink.copy(alpha = .52f)),
        )
    }
}

@Composable
private fun PatternCanvas(pattern: Int, dark: Boolean, drift: Float) {
    val textPaint = remember {
        Paint().apply {
            isAntiAlias = true
            textSize = 42f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
    }
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        val shift = drift.dp.toPx()
        drawRect(if (dark) Color(0xFF0B1512) else Color(0xFFF6F7F4))
        when (pattern) {
            0 -> { // 棋盘：15dp 格，黑白高对比
                val cell = 15.dp.toPx()
                var y = -shift % (cell * 2)
                var row = 0
                while (y < h) {
                    var x = 0f
                    var col = 0
                    while (x < w) {
                        if ((row + col) % 2 == 0) {
                            drawRect(
                                if (dark) Color(0xFF122019) else Color(0xFF0F1512),
                                Offset(x, y), Size(cell, cell),
                            )
                        }
                        x += cell; col++
                    }
                    y += cell; row++
                }
            }
            1 -> { // 斜线：3dp 线宽，12dp 间距
                val gap = 12.dp.toPx()
                val stroke = 3.dp.toPx()
                var x = -h - gap * 4 + shift % (gap * 2)
                while (x < w + h) {
                    drawLine(
                        if (dark) Color(0xFF6FE3BC) else Color(0xFF0E2318),
                        Offset(x, 0f), Offset(x + h, h), stroke,
                    )
                    x += gap
                }
            }
            2 -> { // 文字：模拟列表页，检验字形有没有被弯折
                val line = 46.dp.toPx()
                var y = 70.dp.toPx() - shift % line
                var i = 0
                drawIntoCanvas { canvas ->
                    textPaint.color = (if (dark) 0xFFE9F4EF else 0xFF101512).toInt()
                    while (y < h) {
                        canvas.nativeCanvas.drawText("听屿 Liquid Glass 玻璃 ${i % 7}　边缘折射检验 0123", 20.dp.toPx(), y, textPaint)
                        y += line; i++
                    }
                }
            }
            else -> { // 彩色条：看色散
                val colors = listOf(
                    Color(0xFFE4572E), Color(0xFFF3A712), Color(0xFF2E9E6B),
                    Color(0xFF2D7DD2), Color(0xFF8C54C7), Color(0xFFD6377A),
                )
                val band = w / colors.size
                var x = -shift % band
                while (x < w) {
                    colors.forEachIndexed { index, color -> drawRect(color, Offset(x + index * band, 0f), Size(band, h)) }
                    x += band * colors.size
                }
            }
        }
    }
}
