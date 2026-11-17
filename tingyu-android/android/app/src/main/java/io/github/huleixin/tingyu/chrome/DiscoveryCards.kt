package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.cos
import kotlin.math.sin

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/DiscoveryCards.kt
// 听屿漫游与专属雷达正式矢量视觉资源：固定专属色板，2.5D 多层次构图，无持续动画、无主题灰化。

private object DiscoveryArtPalette {
    // 听屿漫游：深海蓝、冰川蓝、浅青蓝、日光暖金
    val RoamDeep = Color(0xFF193D59)
    val RoamGlacier = Color(0xFF76AFC9)
    val RoamMist = Color(0xFFC9EBEE)
    val RoamSun = Color(0xFFF5D6A0)

    // 风格雷达：深紫蓝、雾紫、浅薰衣草、冷白高光
    val StyleDeep = Color(0xFF35396F)
    val StyleMist = Color(0xFF777BC4)
    val StyleLavender = Color(0xFFC3C5F1)
    val StyleHighlight = Color(0xFFE8EAFE)

    // 时光雷达：暖棕、琥珀金、奶油色、暖灰
    val TimeBrown = Color(0xFF805A43)
    val TimeAmber = Color(0xFFD4A46B)
    val TimeCream = Color(0xFFF3DFC2)
    val TimeGray = Color(0xFFB9A38D)

    // 探索雷达：深青绿、海洋绿、薄荷青、浅暖黄
    val ExploreDeep = Color(0xFF245C61)
    val ExploreSea = Color(0xFF59A6A2)
    val ExploreMint = Color(0xFFACDDD0)
    val ExploreWarm = Color(0xFFF2DFB0)
}

@Composable
internal fun DiscoveryArtCanvas(kind: String, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        when (kind) {
            "roam" -> drawRoamArt()
            "style" -> drawStyleRadarArt()
            "time" -> drawTimeRadarArt()
            "explore" -> drawExploreRadarArt()
            else -> drawExploreRadarArt()
        }
    }
}

private fun DrawScope.drawRoamArt() {
    val w = size.width
    val h = size.height
    drawRect(
        Brush.linearGradient(
            colors = listOf(DiscoveryArtPalette.RoamDeep, Color(0xFF215173), DiscoveryArtPalette.RoamGlacier),
            start = Offset(0f, 0f),
            end = Offset(w, h)
        )
    )
    // 右侧日光暖金光晕与太阳本体（保留左侧文字区干净）
    val sunCenter = Offset(w * 0.80f, h * 0.30f)
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(
                DiscoveryArtPalette.RoamSun.copy(alpha = 0.52f),
                DiscoveryArtPalette.RoamMist.copy(alpha = 0.16f),
                Color.Transparent
            ),
            center = sunCenter,
            radius = h * 0.62f
        ),
        radius = h * 0.62f,
        center = sunCenter
    )
    drawCircle(
        brush = Brush.linearGradient(listOf(DiscoveryArtPalette.RoamSun, Color(0xFFECC07D))),
        radius = h * 0.17f,
        center = sunCenter
    )
    // 远景抽象海岛剪影（右侧 40% 主视觉区）
    val islandFar = Path().apply {
        moveTo(w * 0.56f, h * 0.66f)
        cubicTo(w * 0.64f, h * 0.44f, w * 0.72f, h * 0.45f, w * 0.79f, h * 0.66f)
        close()
    }
    drawPath(islandFar, DiscoveryArtPalette.RoamDeep.copy(alpha = 0.58f))

    val islandNear = Path().apply {
        moveTo(w * 0.66f, h * 0.70f)
        cubicTo(w * 0.74f, h * 0.49f, w * 0.86f, h * 0.50f, w * 0.96f, h * 0.70f)
        close()
    }
    drawPath(
        islandNear,
        Brush.verticalGradient(
            listOf(Color(0xFF1F4C6C), DiscoveryArtPalette.RoamDeep),
            startY = h * 0.48f,
            endY = h * 0.72f
        )
    )

    // 至少三层海浪景深（底部与右侧递增层次）
    val wave1 = Path().apply {
        moveTo(0f, h * 0.68f)
        cubicTo(w * 0.28f, h * 0.62f, w * 0.55f, h * 0.74f, w, h * 0.62f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(wave1, DiscoveryArtPalette.RoamGlacier.copy(alpha = 0.34f))

    val wave2 = Path().apply {
        moveTo(0f, h * 0.78f)
        cubicTo(w * 0.34f, h * 0.84f, w * 0.68f, h * 0.68f, w, h * 0.77f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(wave2, DiscoveryArtPalette.RoamMist.copy(alpha = 0.24f))

    val wave3 = Path().apply {
        moveTo(0f, h * 0.88f)
        cubicTo(w * 0.30f, h * 0.82f, w * 0.72f, h * 0.94f, w, h * 0.85f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(wave3, DiscoveryArtPalette.RoamDeep.copy(alpha = 0.42f))

    // 右侧低透明度声波纹理（与海平面日光呼应）
    repeat(3) { idx ->
        val radius = h * (0.28f + idx * 0.13f)
        drawArc(
            color = DiscoveryArtPalette.RoamMist.copy(alpha = 0.20f - idx * 0.05f),
            startAngle = 195f,
            sweepAngle = 145f,
            useCenter = false,
            topLeft = Offset(sunCenter.x - radius, sunCenter.y - radius),
            size = Size(radius * 2f, radius * 2f),
            style = Stroke(width = 1.4.dp.toPx(), cap = StrokeCap.Round)
        )
    }

    // 左侧文字对比度保护层（平滑溶入右侧插画）
    drawRect(
        Brush.horizontalGradient(
            0.0f to DiscoveryArtPalette.RoamDeep.copy(alpha = 0.92f),
            0.46f to DiscoveryArtPalette.RoamDeep.copy(alpha = 0.74f),
            0.70f to DiscoveryArtPalette.RoamDeep.copy(alpha = 0.18f),
            1.0f to Color.Transparent
        )
    )
}

private fun DrawScope.drawStyleRadarArt() {
    val w = size.width
    val h = size.height
    drawRect(
        Brush.linearGradient(
            listOf(DiscoveryArtPalette.StyleDeep, Color(0xFF474C8C), DiscoveryArtPalette.StyleMist),
            start = Offset(0f, 0f),
            end = Offset(w, h)
        )
    )
    // 顶部柔和光晕
    drawCircle(
        brush = Brush.radialGradient(
            listOf(DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.28f), Color.Transparent),
            center = Offset(w * 0.24f, h * 0.22f),
            radius = w * 0.65f
        ),
        radius = w * 0.65f,
        center = Offset(w * 0.24f, h * 0.22f)
    )

    // 后层唱片（浅薰衣草半透明叠层）
    val backCenter = Offset(w * 0.37f, h * 0.45f)
    val backRadius = w * 0.30f
    drawCircle(DiscoveryArtPalette.StyleLavender.copy(alpha = 0.26f), backRadius, backCenter)
    drawCircle(DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.32f), backRadius * 0.74f, backCenter, style = Stroke(1.dp.toPx()))
    drawCircle(DiscoveryArtPalette.StyleMist.copy(alpha = 0.55f), backRadius * 0.34f, backCenter)

    // 前层主黑胶唱片与同心纹路
    val mainCenter = Offset(w * 0.56f, h * 0.52f)
    val mainRadius = w * 0.34f
    drawCircle(Color(0xFF232652), mainRadius, mainCenter)
    listOf(0.86f, 0.72f, 0.58f).forEachIndexed { idx, factor ->
        drawCircle(
            color = DiscoveryArtPalette.StyleLavender.copy(alpha = 0.26f - idx * 0.05f),
            radius = mainRadius * factor,
            center = mainCenter,
            style = Stroke(width = 1.dp.toPx())
        )
    }
    // 唱片冷白高光弧
    drawArc(
        color = DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.55f),
        startAngle = -55f,
        sweepAngle = 52f,
        useCenter = false,
        topLeft = Offset(mainCenter.x - mainRadius * 0.80f, mainCenter.y - mainRadius * 0.80f),
        size = Size(mainRadius * 1.60f, mainRadius * 1.60f),
        style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round)
    )
    // 中心唱片标签
    drawCircle(
        Brush.linearGradient(listOf(DiscoveryArtPalette.StyleLavender, DiscoveryArtPalette.StyleMist)),
        mainRadius * 0.32f,
        mainCenter
    )
    drawCircle(DiscoveryArtPalette.StyleHighlight, mainRadius * 0.08f, mainCenter)

    // 底部声波轨迹
    val wave = Path().apply {
        moveTo(w * 0.08f, h * 0.84f)
        cubicTo(w * 0.28f, h * 0.72f, w * 0.52f, h * 0.94f, w * 0.92f, h * 0.78f)
    }
    drawPath(wave, DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.42f), style = Stroke(1.6.dp.toPx(), cap = StrokeCap.Round))
}

private fun DrawScope.drawTimeRadarArt() {
    val w = size.width
    val h = size.height
    drawRect(
        Brush.linearGradient(
            listOf(DiscoveryArtPalette.TimeBrown, Color(0xFF9C7250), DiscoveryArtPalette.TimeAmber),
            start = Offset(0f, 0f),
            end = Offset(w, h)
        )
    )
    // 暖光晕与时间圆弧轨迹
    drawCircle(
        brush = Brush.radialGradient(
            listOf(DiscoveryArtPalette.TimeCream.copy(alpha = 0.34f), Color.Transparent),
            center = Offset(w * 0.78f, h * 0.20f),
            radius = w * 0.65f
        ),
        radius = w * 0.65f,
        center = Offset(w * 0.78f, h * 0.20f)
    )
    drawArc(
        color = DiscoveryArtPalette.TimeCream.copy(alpha = 0.28f),
        startAngle = 150f,
        sweepAngle = 210f,
        useCenter = false,
        topLeft = Offset(w * 0.08f, h * 0.08f),
        size = Size(w * 0.84f, h * 0.84f),
        style = Stroke(width = 1.2.dp.toPx(), cap = StrokeCap.Round)
    )

    // 怀旧磁带倾斜主体
    rotate(-8f, pivot = Offset(w * 0.50f, h * 0.52f)) {
        val left = w * 0.16f
        val top = h * 0.30f
        val bodyW = w * 0.68f
        val bodyH = h * 0.44f
        drawRoundRect(
            brush = Brush.verticalGradient(listOf(Color(0xFF5D3F2D), Color(0xFF472F21))),
            topLeft = Offset(left, top),
            size = Size(bodyW, bodyH),
            cornerRadius = CornerRadius(10.dp.toPx(), 10.dp.toPx())
        )
        // 磁带奶油标签条
        drawRoundRect(
            color = DiscoveryArtPalette.TimeCream.copy(alpha = 0.92f),
            topLeft = Offset(left + bodyW * 0.09f, top + bodyH * 0.13f),
            size = Size(bodyW * 0.82f, bodyH * 0.42f),
            cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
        )
        drawLine(
            color = DiscoveryArtPalette.TimeAmber,
            start = Offset(left + bodyW * 0.15f, top + bodyH * 0.24f),
            end = Offset(left + bodyW * 0.85f, top + bodyH * 0.24f),
            strokeWidth = 2.dp.toPx()
        )
        // 磁带透明视窗与左右卷轴
        drawRoundRect(
            color = DiscoveryArtPalette.TimeBrown,
            topLeft = Offset(left + bodyW * 0.20f, top + bodyH * 0.34f),
            size = Size(bodyW * 0.60f, bodyH * 0.34f),
            cornerRadius = CornerRadius(6.dp.toPx(), 6.dp.toPx())
        )
        val reelY = top + bodyH * 0.51f
        val leftReel = Offset(left + bodyW * 0.34f, reelY)
        val rightReel = Offset(left + bodyW * 0.66f, reelY)
        listOf(leftReel, rightReel).forEach { c ->
            drawCircle(DiscoveryArtPalette.TimeCream, bodyH * 0.12f, c)
            drawCircle(DiscoveryArtPalette.TimeBrown, bodyH * 0.055f, c)
        }
        // 底部梯形凹槽
        val notch = Path().apply {
            moveTo(left + bodyW * 0.22f, top + bodyH)
            lineTo(left + bodyW * 0.28f, top + bodyH * 0.80f)
            lineTo(left + bodyW * 0.72f, top + bodyH * 0.80f)
            lineTo(left + bodyW * 0.78f, top + bodyH)
            close()
        }
        drawPath(notch, DiscoveryArtPalette.TimeGray.copy(alpha = 0.45f))
    }

    // 轻微怀旧颗粒感点缀
    val dots = listOf(
        0.14f to 0.18f, 0.24f to 0.86f, 0.82f to 0.24f,
        0.86f to 0.76f, 0.48f to 0.14f, 0.66f to 0.86f
    )
    dots.forEach { (dx, dy) ->
        drawCircle(DiscoveryArtPalette.TimeCream.copy(alpha = 0.28f), 1.5.dp.toPx(), Offset(w * dx, h * dy))
    }
}

private fun DrawScope.drawExploreRadarArt() {
    val w = size.width
    val h = size.height
    drawRect(
        Brush.linearGradient(
            listOf(DiscoveryArtPalette.ExploreDeep, DiscoveryArtPalette.ExploreSea, DiscoveryArtPalette.ExploreMint.copy(alpha = 0.85f)),
            start = Offset(0f, 0f),
            end = Offset(w, h)
        )
    )
    // 星球与倾斜轨道
    val planetCenter = Offset(w * 0.66f, h * 0.32f)
    val planetRadius = w * 0.17f
    drawCircle(
        brush = Brush.radialGradient(
            listOf(DiscoveryArtPalette.ExploreWarm.copy(alpha = 0.42f), Color.Transparent),
            center = planetCenter,
            radius = planetRadius * 2.2f
        ),
        radius = planetRadius * 2.2f,
        center = planetCenter
    )
    drawCircle(
        brush = Brush.linearGradient(listOf(DiscoveryArtPalette.ExploreWarm, Color(0xFFE3C685))),
        radius = planetRadius,
        center = planetCenter
    )
    rotate(-22f, pivot = planetCenter) {
        drawOval(
            color = DiscoveryArtPalette.ExploreMint.copy(alpha = 0.72f),
            topLeft = Offset(planetCenter.x - planetRadius * 1.75f, planetCenter.y - planetRadius * 0.42f),
            size = Size(planetRadius * 3.50f, planetRadius * 0.84f),
            style = Stroke(width = 1.6.dp.toPx())
        )
    }

    // 远、中、近三层未知地平线景观
    val ridgeFar = Path().apply {
        moveTo(0f, h * 0.64f)
        cubicTo(w * 0.24f, h * 0.50f, w * 0.58f, h * 0.70f, w, h * 0.55f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(ridgeFar, DiscoveryArtPalette.ExploreSea.copy(alpha = 0.55f))

    val ridgeMid = Path().apply {
        moveTo(0f, h * 0.74f)
        cubicTo(w * 0.30f, h * 0.84f, w * 0.62f, h * 0.62f, w, h * 0.73f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(ridgeMid, DiscoveryArtPalette.ExploreDeep.copy(alpha = 0.65f))

    val ridgeNear = Path().apply {
        moveTo(0f, h * 0.84f)
        cubicTo(w * 0.35f, h * 0.78f, w * 0.70f, h * 0.92f, w, h * 0.82f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(ridgeNear, Color(0xFF194246))

    // 探索轨迹与星点
    val trail = Path().apply {
        moveTo(w * 0.14f, h * 0.78f)
        cubicTo(w * 0.28f, h * 0.52f, w * 0.42f, h * 0.40f, w * 0.56f, h * 0.34f)
    }
    drawPath(trail, DiscoveryArtPalette.ExploreWarm.copy(alpha = 0.50f), style = Stroke(1.3.dp.toPx(), cap = StrokeCap.Round))
    listOf(0.20f to 0.22f, 0.36f to 0.16f, 0.86f to 0.48f).forEach { (sx, sy) ->
        drawCircle(DiscoveryArtPalette.ExploreWarm.copy(alpha = 0.75f), 1.6.dp.toPx(), Offset(w * sx, h * sy))
    }
}

@Composable
internal fun DiscoveryHero(section: NativePageSection, modifier: Modifier = Modifier, action: PageAction) {
    val item = section.items.firstOrNull() ?: return
    Box(
        modifier
            .fillMaxWidth()
            .height(148.dp)
            .testTag("discovery-hero")
            .clip(RoundedCornerShape(20.dp))
            .clickable(enabled = !item.disabled) { action(item.action, "", 0.0) }
    ) {
        DiscoveryArtCanvas("roam", Modifier.matchParentSize())
        Column(
            Modifier
                .fillMaxSize()
                .padding(20.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column(Modifier.fillMaxWidth(0.64f)) {
                Text(
                    item.title,
                    color = Color.White,
                    fontSize = 23.sp,
                    lineHeight = 29.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    item.subtitle,
                    color = Color(0xFFE1F3F5),
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }
            Row(
                Modifier
                    .height(40.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(if (item.disabled) DiscoveryArtPalette.RoamMist.copy(alpha = 0.45f) else DiscoveryArtPalette.RoamSun)
                    .chromeClickable(enabled = !item.disabled, corner = 20.dp) { action(item.action, "", 0.0) }
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                PageIcon("play", DiscoveryArtPalette.RoamDeep, Modifier.size(18.dp))
                Text(
                    item.secondaryLabel,
                    color = DiscoveryArtPalette.RoamDeep,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
internal fun DiscoveryRadars(section: NativePageSection, modifier: Modifier = Modifier, action: PageAction) {
    val palette = LocalInterfacePalette.current
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        section.items.forEach { item ->
            Column(
                Modifier
                    .weight(1f)
                    .testTag("discovery-radar:" + item.id)
                    .chromeClickable(enabled = !item.disabled, corner = 14.dp) { action(item.action, "", 0.0) }
            ) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(14.dp))
                ) {
                    DiscoveryArtCanvas(item.id, Modifier.matchParentSize())
                    if (item.secondary.isNotBlank()) {
                        // 视觉 32dp 播放按钮（距右/底 8dp），实际 48dp 触区且拦截点击防止穿透跳转详情页
                        Box(
                            Modifier
                                .align(Alignment.BottomEnd)
                                .size(48.dp)
                                .semantics { contentDescription = "播放" + item.title }
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null,
                                    role = Role.Button,
                                    enabled = !item.disabled
                                ) { action(item.secondary, "", 0.0) }
                                .padding(end = 8.dp, bottom = 8.dp),
                            contentAlignment = Alignment.BottomEnd
                        ) {
                            Box(
                                Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xE6151C24)),
                                contentAlignment = Alignment.Center
                            ) {
                                PageIcon("play", Color.White, Modifier.size(15.dp))
                            }
                        }
                    }
                }
                Text(
                    item.title,
                    color = palette.ink,
                    fontSize = 14.sp,
                    lineHeight = 19.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 8.dp)
                )
                Text(
                    item.subtitle,
                    color = palette.muted,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}

@Composable
internal fun DiscoveryTextActions(section: NativePageSection, modifier: Modifier = Modifier, action: PageAction) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        section.items.forEach { item ->
            Row(
                Modifier
                    .heightIn(min = 48.dp)
                    .chromeClickable(enabled = !item.disabled) { action(item.action, "", 0.0) }
                    .padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                if (item.image.isNotBlank()) PageIcon(item.image, PageMuted, Modifier.size(15.dp))
                Text(item.title, color = PageMuted, fontSize = 12.sp)
                PageIcon("chevron-right", PageMuted, Modifier.size(13.dp))
            }
        }
    }
}
