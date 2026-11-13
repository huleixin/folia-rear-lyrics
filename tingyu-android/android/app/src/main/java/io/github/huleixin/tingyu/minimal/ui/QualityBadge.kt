package io.github.huleixin.tingyu.minimal.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/QualityBadge.kt
//
// 全局音质标签（Compose 侧）。视觉参数与 `src/components/app/overlays/minimal-stage/qualityBadgeSpecs.ts`
// 逐字段一致（同一张《听屿音质标签视觉规范图》逐像素采样）：六枚标签、三种尺寸、无发光无渐变无玻璃。
// 规范图右侧的"石墨灰、雾蓝银"等是颜色说明，不是标签内容。
//
// 音柱图形**复用**现有 `PlayerControlIcon("audioBars")`（AUDIO_BARS 五柱描边），
// 不另画一套四柱；Hi-Res / 臻品母带 / 空间音频的图标无现成对应，Canvas 手绘。
//
// 几何从规范图按比例校正（pill 高 35px：文字 em≈14px、图标 14px、横向内边距≈7px、图标-文字间距≈6px），
// FULL 以 27/35 缩放落在播放页 28dp 槽位内。

/** 六枚标签的层级，与 TS 侧 `QualityLevel` 一一对应。 */
enum class QualityLevel { STANDARD, HQ, FLAC, HIRES, MASTER, SPATIAL;

    companion object {
        /** 桥上的字符串 → 层级。未知值返回 null（调用方隐藏标签，绝不回退旧 chip）。 */
        fun fromWire(value: String?): QualityLevel? = when (value) {
            "standard" -> STANDARD
            "hq" -> HQ
            "flac" -> FLAC
            "hires" -> HIRES
            "master" -> MASTER
            "spatial" -> SPATIAL
            else -> null
        }

        /**
         * 目录 spec 名（high/lossless/hires/master/dolby）→ 层级 —— 与
         * `resolveCatalogQualityLevel` 同一张映射表：high 是 HQ 档不是标准档。
         * dts 等不属于六枚的档位返回 null（不显示）。
         */
        fun fromCatalogSpec(spec: String?): QualityLevel? = when (spec) {
            "master" -> MASTER
            "hires" -> HIRES
            "lossless" -> FLAC
            "dolby" -> SPATIAL
            "high" -> HQ
            else -> null
        }
    }
}

/** 三种尺寸：播放页完整版 / 歌单与搜索紧凑版 / 最近播放等小卡片微型版。 */
enum class QualityBadgeSize(
    val heightDp: Int,
    val textSize: Int,
    val iconDp: Int,
    val padH: Int,
    val gap: Int,
    val useIcon: Boolean,
) {
    FULL(27, 10, 10, 6, 5, true),
    COMPACT(21, 10, 10, 7, 4, true),
    MICRO(17, 9, 0, 6, 0, false),
}

/** 图标种类，与 TS 的 `icon` 字段同名。 */
internal enum class QualityGlyph { NONE, BARS, SPARKLE, DISC, SWIRL }

private data class QualityBadgeVisual(
    val bg: Color,
    val border: Color,
    val text: Color,
    val iconColor: Color,
    val glyph: QualityGlyph,
    val fullLabel: String,
    val compactLabel: String,
    val microLabel: String,
)

// 颜色逐字段对齐 qualityBadgeSpecs.ts（规范图逐像素采样值）。
private fun visualOf(level: QualityLevel): QualityBadgeVisual = when (level) {
    QualityLevel.STANDARD -> QualityBadgeVisual(
        bg = Color(0xFF34383D), border = Color(0xFF747B82), text = Color(0xFFE6E8E9),
        iconColor = Color(0xFFE6E8E9), glyph = QualityGlyph.NONE,
        fullLabel = "标准音质", compactLabel = "标准", microLabel = "标准",
    )
    QualityLevel.HQ -> QualityBadgeVisual(
        bg = Color(0xFF222E3C), border = Color(0xFF7092B4), text = Color(0xFF98AEC5),
        iconColor = Color(0xFF98AEC5), glyph = QualityGlyph.BARS,
        fullLabel = "HQ · 高品质", compactLabel = "HQ", microLabel = "HQ",
    )
    QualityLevel.FLAC -> QualityBadgeVisual(
        bg = Color(0xFF282428), border = Color(0xFFB99A66), text = Color(0xFFE1BE85),
        iconColor = Color(0xFFE1BE85), glyph = QualityGlyph.BARS,
        fullLabel = "FLAC · 无损", compactLabel = "FLAC", microLabel = "FLAC",
    )
    QualityLevel.HIRES -> QualityBadgeVisual(
        bg = Color(0xFF27273F), border = Color(0xFF47476D), text = Color(0xFFDBDAF1),
        iconColor = Color(0xFFBCB9FF), glyph = QualityGlyph.SPARKLE,
        fullLabel = "Hi-Res", compactLabel = "Hi-Res", microLabel = "Hi-Res",
    )
    QualityLevel.MASTER -> QualityBadgeVisual(
        bg = Color(0xFF38252D), border = Color(0xFFBE8B8E), text = Color(0xFFF7F0F0),
        iconColor = Color(0xFFD2B0B2), glyph = QualityGlyph.DISC,
        fullLabel = "臻品母带", compactLabel = "母带", microLabel = "母带",
    )
    QualityLevel.SPATIAL -> QualityBadgeVisual(
        bg = Color(0xFF1C3436), border = Color(0xFF6EA9A7), text = Color(0xFFECF3F3),
        iconColor = Color(0xFF9AD4CB), glyph = QualityGlyph.SWIRL,
        fullLabel = "空间音频", compactLabel = "空间", microLabel = "空间",
    )
}

/**
 * 全局音质标签。
 *
 * @param level 六档层级（来自桥的 `qualityLevel`，或队列条目的 `q`）
 * @param size  FULL 播放页 / COMPACT 歌单与搜索行 / MICRO 小卡片
 * @param labelOverride 真实格式文案（Media3 确认了 APE/WAV/DSD/ALAC 等非 FLAC 无损时），
 *                      只在无损层级生效 —— 不把所有无损都冒充 FLAC
 */
@Composable
fun MinimalQualityBadge(
    level: QualityLevel,
    size: QualityBadgeSize = QualityBadgeSize.FULL,
    modifier: Modifier = Modifier,
    labelOverride: String? = null,
) {
    val visual = visualOf(level)
    // 胶囊：RoundedCornerShape 的 Int 重载是"百分比"（0..100），999 会直接崩 —— 用 50%。
    val shape = remember(size) { RoundedCornerShape(50) }
    val specLabel = when (size) {
        QualityBadgeSize.FULL -> visual.fullLabel
        QualityBadgeSize.COMPACT -> visual.compactLabel
        QualityBadgeSize.MICRO -> visual.microLabel
    }
    // 文案覆盖只用于无损层级（真实格式替换 "FLAC · 无损"），其余层级一律用规范文案。
    val label = if (level == QualityLevel.FLAC && !labelOverride.isNullOrBlank()) labelOverride else specLabel
    Row(
        modifier
            .height(size.heightDp.dp)
            .background(visual.bg, shape)
            .border(1.dp, visual.border, shape)
            .padding(horizontal = size.padH.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (size.useIcon && size.iconDp > 0 && visual.glyph != QualityGlyph.NONE) {
            if (visual.glyph == QualityGlyph.BARS) {
                // 音柱：沿用 AUDIO_BARS 的对称五柱节奏，但**垂直居中**（参考图是居中小音浪，
                // PlayerControlIcon 的 24dp 网格是底对齐的，直接缩放会偏大偏沉）。
                QualityBadgeGlyph(QualityGlyph.BARS, visual.iconColor, Modifier.size(size.iconDp.dp))
            } else {
                QualityBadgeGlyph(visual.glyph, visual.iconColor, Modifier.size(size.iconDp.dp))
            }
            Spacer(Modifier.width(size.gap.dp))
        }
        Text(
            text = label,
            color = visual.text,
            fontSize = size.textSize.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
        )
    }
}

/** Small catalog-only chips; use the interface palette so light and dark lists remain readable. */
@Composable
internal fun MinimalCatalogBadge(spec: String, label: String, modifier: Modifier = Modifier) {
    val palette = io.github.huleixin.tingyu.chrome.LocalInterfacePalette.current
    val tint = when (spec) {
        "jyeffect", "sky", "dolby", "dts" -> visualOf(QualityLevel.SPATIAL).iconColor
        "vip", "paid" -> visualOf(QualityLevel.FLAC).iconColor
        else -> visualOf(QualityLevel.fromCatalogSpec(spec) ?: QualityLevel.HQ).iconColor
    }
    val ink = androidx.compose.ui.graphics.lerp(tint, palette.ink, if (palette.light) 0.72f else 0.3f)
    val shape = RoundedCornerShape(3.dp)
    Text(
        text = label,
        color = ink,
        fontSize = 10.sp,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        softWrap = false,
        modifier = modifier
            .background(ink.copy(alpha = 0.07f), shape)
            .border(0.5.dp, ink.copy(alpha = 0.4f), shape)
            .padding(horizontal = 5.dp, vertical = 1.dp),
    )
}

/**
 * 歌单页轻量**文字**标签（用户指定的克制样式）：
 * 无底色、无边框、无图标；层级色相与页面墨色（muted）做 50% 低饱和混合，
 * 浅色模式得到深色可读文字、深色模式自动适配；高度=字号行高，不增加行高。
 */
@Composable
fun MinimalQualityBadgeText(level: QualityLevel, modifier: Modifier = Modifier) {
    val visual = visualOf(level)
    val muted = io.github.huleixin.tingyu.chrome.LocalInterfacePalette.current.muted
    Text(
        text = textLabel(level),
        color = androidx.compose.ui.graphics.lerp(visual.iconColor, muted, 0.5f),
        fontSize = 9.sp,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        modifier = modifier,
    )
}

private fun textLabel(level: QualityLevel): String = when (level) {
    QualityLevel.STANDARD -> "标准"
    QualityLevel.HQ -> "HQ"
    QualityLevel.FLAC -> "无损"
    QualityLevel.HIRES -> "Hi-Res"
    QualityLevel.MASTER -> "母带"
    QualityLevel.SPATIAL -> "空间"
}

@Composable
private fun QualityBadgeGlyph(glyph: QualityGlyph, color: Color, modifier: Modifier) {
    if (glyph == QualityGlyph.NONE) return
    androidx.compose.foundation.Canvas(modifier) {
        val u = size.minDimension / 16f
        when (glyph) {
            // 音柱（HQ / FLAC）：AUDIO_BARS 的对称五柱节奏（3.2/8/14.2/8/3.2），
            // 垂直居中绘制 —— 参考图是居中小音浪，不是底对齐的高柱。
            QualityGlyph.BARS -> {
                // AUDIO_BARS 的对称五柱节奏（3.2/8/14.2/8/3.2，x=3.7..20.3），垂直居中；
                // 柱群整体向内收 20%（不满铺图标框），右侧留出与文字的呼吸空隙。
                val heights = listOf(3.2f, 8f, 14.2f, 8f, 3.2f)
                val columns = listOf(3.7f, 7.85f, 12.0f, 16.15f, 20.3f)
                columns.forEachIndexed { index, cx ->
                    val x = 12f * u + (cx - 12f) * u * 0.8f
                    val half = heights[index] / 2f * u
                    drawLine(
                        color,
                        Offset(x, 8f * u - half),
                        Offset(x, 8f * u + half),
                        1.9f * u,
                        StrokeCap.Round,
                    )
                }
            }
            QualityGlyph.SPARKLE -> {
                val path = Path().apply {
                    moveTo(8f * u, 1.4f * u)
                    cubicTo(8.8f * u, 4.6f * u, 9.9f * u, 5.8f * u, 14.4f * u, 8f * u)
                    cubicTo(9.9f * u, 10.2f * u, 8.8f * u, 11.4f * u, 8f * u, 14.6f * u)
                    cubicTo(7.2f * u, 11.4f * u, 6.1f * u, 10.2f * u, 1.6f * u, 8f * u)
                    cubicTo(6.1f * u, 5.8f * u, 7.2f * u, 4.6f * u, 8f * u, 1.4f * u)
                    close()
                }
                drawPath(path, color)
            }
            // 圆环 + 内芯（臻品母带）
            QualityGlyph.DISC -> {
                drawCircle(color, 5.9f * u, style = Stroke(1.5f * u))
                drawCircle(color, 2.2f * u)
            }
            // 同心弧 + 中点（空间音频）
            QualityGlyph.SWIRL -> {
                drawCircle(color, 5.9f * u, style = Stroke(1.4f * u))
                drawCircle(color.copy(alpha = 0.55f), 3.1f * u, style = Stroke(1.4f * u))
                drawCircle(color, 1.15f * u)
            }
            QualityGlyph.NONE, QualityGlyph.BARS -> Unit // BARS 走 PlayerControlIcon("audioBars")
        }
    }
}
