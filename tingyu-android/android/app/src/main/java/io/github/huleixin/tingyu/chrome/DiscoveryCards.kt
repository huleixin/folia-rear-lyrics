package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/DiscoveryCards.kt
// 听屿漫游与专属雷达正式视觉资源：冰川轻透玻璃质感、统一光影语言、克制同调渐变。

private object DiscoveryArtPalette {
    // 听屿漫游：深海蓝、冰川蓝、浅青雾、柔和晨光
    val RoamDeep = Color(0xFF1C3F5A)
    val RoamMid = Color(0xFF3E7090)
    val RoamGlacier = Color(0xFF84B7CE)
    val RoamMist = Color(0xFFCDE8EF)
    val RoamSun = Color(0xFFEDE0C9)

    // 风格雷达：冷调雾紫冰蓝（同材质轻透渐变）
    val StyleDeep = Color(0xFF3B4272)
    val StyleMid = Color(0xFF5D669B)
    val StyleLight = Color(0xFFAAB2DF)
    val StyleHighlight = Color(0xFFE7EAFA)

    // 时光雷达：克制清冷暖灰雾金（去土黄棕橙卡通感，保持轻透怀旧氛围）
    val TimeDeep = Color(0xFF514E4B)
    val TimeMid = Color(0xFF7D776F)
    val TimeLight = Color(0xFFC8C0B4)
    val TimeHighlight = Color(0xFFF0EAE0)

    // 探索雷达：深海青雾、冰川青、薄荷雾
    val ExploreDeep = Color(0xFF215157)
    val ExploreMid = Color(0xFF478585)
    val ExploreLight = Color(0xFFA0CFCB)
    val ExploreHighlight = Color(0xFFE4F2EE)
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

/** 统一玻璃光泽与柔和左上→右下光影，保持三张雷达与漫游卡同一视觉语言。 */
private fun DrawScope.drawUnifiedGlassSheen(highlight: Color) {
    val w = size.width
    val h = size.height
    drawRect(
        Brush.linearGradient(
            colors = listOf(
                highlight.copy(alpha = 0.22f),
                highlight.copy(alpha = 0.04f),
                Color.Transparent
            ),
            start = Offset(0f, 0f),
            end = Offset(w * 0.85f, h * 0.85f)
        )
    )
}

private fun DrawScope.drawRoamArt() {
    val w = size.width
    val h = size.height
    drawRect(
        Brush.linearGradient(
            colors = listOf(DiscoveryArtPalette.RoamDeep, DiscoveryArtPalette.RoamMid, DiscoveryArtPalette.RoamGlacier),
            start = Offset(0f, 0f),
            end = Offset(w, h)
        )
    )
    // 右侧柔和晨光弥散光晕（无硬边实心大圆）
    val sunCenter = Offset(w * 0.80f, h * 0.28f)
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(
                DiscoveryArtPalette.RoamSun.copy(alpha = 0.62f),
                DiscoveryArtPalette.RoamMist.copy(alpha = 0.22f),
                Color.Transparent
            ),
            center = sunCenter,
            radius = h * 0.56f
        ),
        radius = h * 0.56f,
        center = sunCenter
    )
    drawCircle(
        color = DiscoveryArtPalette.RoamSun.copy(alpha = 0.72f),
        radius = h * 0.11f,
        center = sunCenter
    )

    // 远方海平线与柔和抽象岛屿（半透明雾感层叠）
    val islandFar = Path().apply {
        moveTo(w * 0.58f, h * 0.68f)
        cubicTo(w * 0.66f, h * 0.50f, w * 0.73f, h * 0.50f, w * 0.81f, h * 0.68f)
        close()
    }
    drawPath(islandFar, DiscoveryArtPalette.RoamDeep.copy(alpha = 0.34f))

    val islandNear = Path().apply {
        moveTo(w * 0.68f, h * 0.72f)
        cubicTo(w * 0.76f, h * 0.54f, w * 0.87f, h * 0.55f, w * 0.97f, h * 0.72f)
        close()
    }
    drawPath(islandNear, DiscoveryArtPalette.RoamDeep.copy(alpha = 0.50f))

    // 三层轻透海雾波浪
    val wave1 = Path().apply {
        moveTo(0f, h * 0.69f)
        cubicTo(w * 0.28f, h * 0.64f, w * 0.58f, h * 0.74f, w, h * 0.65f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(wave1, DiscoveryArtPalette.RoamMist.copy(alpha = 0.16f))

    val wave2 = Path().apply {
        moveTo(0f, h * 0.78f)
        cubicTo(w * 0.34f, h * 0.83f, w * 0.68f, h * 0.71f, w, h * 0.77f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(wave2, DiscoveryArtPalette.RoamMist.copy(alpha = 0.20f))

    val wave3 = Path().apply {
        moveTo(0f, h * 0.88f)
        cubicTo(w * 0.30f, h * 0.84f, w * 0.72f, h * 0.92f, w, h * 0.86f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(wave3, DiscoveryArtPalette.RoamDeep.copy(alpha = 0.32f))

    // 极细声波纹理
    repeat(3) { idx ->
        val radius = h * (0.24f + idx * 0.13f)
        drawArc(
            color = DiscoveryArtPalette.RoamMist.copy(alpha = 0.16f - idx * 0.04f),
            startAngle = 195f,
            sweepAngle = 140f,
            useCenter = false,
            topLeft = Offset(sunCenter.x - radius, sunCenter.y - radius),
            size = Size(radius * 2f, radius * 2f),
            style = Stroke(width = 1.dp.toPx(), cap = StrokeCap.Round)
        )
    }

    // 左侧文字对比度保护层（平滑溶入冰川海雾）
    drawRect(
        Brush.horizontalGradient(
            0.0f to DiscoveryArtPalette.RoamDeep.copy(alpha = 0.88f),
            0.48f to DiscoveryArtPalette.RoamDeep.copy(alpha = 0.56f),
            0.74f to Color.Transparent
        )
    )
    drawUnifiedGlassSheen(DiscoveryArtPalette.RoamMist)
}

private fun DrawScope.drawStyleRadarArt() {
    val w = size.width
    val h = size.height
    drawRect(
        Brush.linearGradient(
            listOf(DiscoveryArtPalette.StyleDeep, DiscoveryArtPalette.StyleMid, DiscoveryArtPalette.StyleLight),
            start = Offset(0f, 0f),
            end = Offset(w, h)
        )
    )
    drawCircle(
        brush = Brush.radialGradient(
            listOf(DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.24f), Color.Transparent),
            center = Offset(w * 0.26f, h * 0.24f),
            radius = w * 0.65f
        ),
        radius = w * 0.65f,
        center = Offset(w * 0.26f, h * 0.24f)
    )

    // 磨砂叠层唱片（轻透同色系，无硬黑块）
    val backCenter = Offset(w * 0.38f, h * 0.45f)
    val backRadius = w * 0.29f
    drawCircle(DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.14f), backRadius, backCenter)
    drawCircle(DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.26f), backRadius * 0.72f, backCenter, style = Stroke(1.dp.toPx()))

    val mainCenter = Offset(w * 0.56f, h * 0.52f)
    val mainRadius = w * 0.32f
    drawCircle(DiscoveryArtPalette.StyleDeep.copy(alpha = 0.62f), mainRadius, mainCenter)
    listOf(0.86f, 0.72f, 0.58f).forEachIndexed { idx, factor ->
        drawCircle(
            color = DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.24f - idx * 0.05f),
            radius = mainRadius * factor,
            center = mainCenter,
            style = Stroke(width = 1.dp.toPx())
        )
    }
    drawArc(
        color = DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.50f),
        startAngle = -55f,
        sweepAngle = 48f,
        useCenter = false,
        topLeft = Offset(mainCenter.x - mainRadius * 0.78f, mainCenter.y - mainRadius * 0.78f),
        size = Size(mainRadius * 1.56f, mainRadius * 1.56f),
        style = Stroke(width = 1.6.dp.toPx(), cap = StrokeCap.Round)
    )
    drawCircle(DiscoveryArtPalette.StyleLight.copy(alpha = 0.65f), mainRadius * 0.28f, mainCenter)
    drawCircle(DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.9f), mainRadius * 0.07f, mainCenter)

    val wave = Path().apply {
        moveTo(w * 0.08f, h * 0.83f)
        cubicTo(w * 0.30f, h * 0.73f, w * 0.56f, h * 0.91f, w * 0.92f, h * 0.78f)
    }
    drawPath(wave, DiscoveryArtPalette.StyleHighlight.copy(alpha = 0.32f), style = Stroke(1.2.dp.toPx(), cap = StrokeCap.Round))
    drawUnifiedGlassSheen(DiscoveryArtPalette.StyleHighlight)
}

private fun DrawScope.drawTimeRadarArt() {
    val w = size.width
    val h = size.height
    // 克制清冷暖灰雾金渐变，保持高级怀旧氛围
    drawRect(
        Brush.linearGradient(
            listOf(DiscoveryArtPalette.TimeDeep, DiscoveryArtPalette.TimeMid, DiscoveryArtPalette.TimeLight),
            start = Offset(0f, 0f),
            end = Offset(w, h)
        )
    )
    drawCircle(
        brush = Brush.radialGradient(
            listOf(DiscoveryArtPalette.TimeHighlight.copy(alpha = 0.26f), Color.Transparent),
            center = Offset(w * 0.26f, h * 0.24f),
            radius = w * 0.65f
        ),
        radius = w * 0.65f,
        center = Offset(w * 0.26f, h * 0.24f)
    )

    // 极简时间轨迹光环
    drawArc(
        color = DiscoveryArtPalette.TimeHighlight.copy(alpha = 0.24f),
        startAngle = 155f,
        sweepAngle = 215f,
        useCenter = false,
        topLeft = Offset(w * 0.12f, h * 0.12f),
        size = Size(w * 0.76f, h * 0.76f),
        style = Stroke(width = 1.dp.toPx(), cap = StrokeCap.Round)
    )

    // 半透明磨砂磁带轮廓（克制同调，不堆砌卡通棕色块）
    rotate(-7f, pivot = Offset(w * 0.50f, h * 0.52f)) {
        val left = w * 0.18f
        val top = h * 0.33f
        val bodyW = w * 0.64f
        val bodyH = h * 0.40f
        drawRoundRect(
            color = DiscoveryArtPalette.TimeDeep.copy(alpha = 0.58f),
            topLeft = Offset(left, top),
            size = Size(bodyW, bodyH),
            cornerRadius = CornerRadius(10.dp.toPx(), 10.dp.toPx())
        )
        drawRoundRect(
            color = DiscoveryArtPalette.TimeHighlight.copy(alpha = 0.36f),
            topLeft = Offset(left, top),
            size = Size(bodyW, bodyH),
            cornerRadius = CornerRadius(10.dp.toPx(), 10.dp.toPx()),
            style = Stroke(width = 1.dp.toPx())
        )
        // 顶部柔和标签线
        drawLine(
            color = DiscoveryArtPalette.TimeHighlight.copy(alpha = 0.55f),
            start = Offset(left + bodyW * 0.14f, top + bodyH * 0.22f),
            end = Offset(left + bodyW * 0.86f, top + bodyH * 0.22f),
            strokeWidth = 1.4.dp.toPx(),
            cap = StrokeCap.Round
        )
        // 透明磁带窗与双卷轴
        drawRoundRect(
            color = DiscoveryArtPalette.TimeHighlight.copy(alpha = 0.18f),
            topLeft = Offset(left + bodyW * 0.20f, top + bodyH * 0.36f),
            size = Size(bodyW * 0.60f, bodyH * 0.34f),
            cornerRadius = CornerRadius(6.dp.toPx(), 6.dp.toPx())
        )
        val reelY = top + bodyH * 0.53f
        listOf(left + bodyW * 0.35f, left + bodyW * 0.65f).forEach { rx ->
            val center = Offset(rx, reelY)
            drawCircle(DiscoveryArtPalette.TimeHighlight.copy(alpha = 0.78f), bodyH * 0.11f, center)
            drawCircle(DiscoveryArtPalette.TimeDeep.copy(alpha = 0.80f), bodyH * 0.048f, center)
        }
    }
    drawUnifiedGlassSheen(DiscoveryArtPalette.TimeHighlight)
}

private fun DrawScope.drawExploreRadarArt() {
    val w = size.width
    val h = size.height
    drawRect(
        Brush.linearGradient(
            listOf(DiscoveryArtPalette.ExploreDeep, DiscoveryArtPalette.ExploreMid, DiscoveryArtPalette.ExploreLight),
            start = Offset(0f, 0f),
            end = Offset(w, h)
        )
    )
    drawCircle(
        brush = Brush.radialGradient(
            listOf(DiscoveryArtPalette.ExploreHighlight.copy(alpha = 0.26f), Color.Transparent),
            center = Offset(w * 0.26f, h * 0.24f),
            radius = w * 0.65f
        ),
        radius = w * 0.65f,
        center = Offset(w * 0.26f, h * 0.24f)
    )

    val planetCenter = Offset(w * 0.62f, h * 0.36f)
    val planetRadius = w * 0.15f
    drawCircle(
        brush = Brush.radialGradient(
            listOf(DiscoveryArtPalette.ExploreHighlight.copy(alpha = 0.42f), Color.Transparent),
            center = planetCenter,
            radius = planetRadius * 2.1f
        ),
        radius = planetRadius * 2.1f,
        center = planetCenter
    )
    drawCircle(DiscoveryArtPalette.ExploreHighlight.copy(alpha = 0.72f), planetRadius, planetCenter)
    rotate(-20f, pivot = planetCenter) {
        drawOval(
            color = DiscoveryArtPalette.ExploreHighlight.copy(alpha = 0.55f),
            topLeft = Offset(planetCenter.x - planetRadius * 1.72f, planetCenter.y - planetRadius * 0.40f),
            size = Size(planetRadius * 3.44f, planetRadius * 0.80f),
            style = Stroke(width = 1.2.dp.toPx())
        )
    }

    // 三层轻透地平线远山雾层
    val ridgeFar = Path().apply {
        moveTo(0f, h * 0.66f)
        cubicTo(w * 0.25f, h * 0.54f, w * 0.58f, h * 0.72f, w, h * 0.58f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(ridgeFar, DiscoveryArtPalette.ExploreHighlight.copy(alpha = 0.16f))

    val ridgeMid = Path().apply {
        moveTo(0f, h * 0.76f)
        cubicTo(w * 0.32f, h * 0.84f, w * 0.64f, h * 0.66f, w, h * 0.75f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(ridgeMid, DiscoveryArtPalette.ExploreDeep.copy(alpha = 0.42f))

    val ridgeNear = Path().apply {
        moveTo(0f, h * 0.86f)
        cubicTo(w * 0.35f, h * 0.81f, w * 0.70f, h * 0.92f, w, h * 0.84f)
        lineTo(w, h)
        lineTo(0f, h)
        close()
    }
    drawPath(ridgeNear, DiscoveryArtPalette.ExploreDeep.copy(alpha = 0.68f))

    val trail = Path().apply {
        moveTo(w * 0.16f, h * 0.78f)
        cubicTo(w * 0.30f, h * 0.54f, w * 0.42f, h * 0.42f, w * 0.54f, h * 0.37f)
    }
    drawPath(trail, DiscoveryArtPalette.ExploreHighlight.copy(alpha = 0.38f), style = Stroke(1.1.dp.toPx(), cap = StrokeCap.Round))
    drawUnifiedGlassSheen(DiscoveryArtPalette.ExploreHighlight)
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
                    color = Color(0xFFE1F1F5),
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }
            // 轻透磨砂玻璃播放胶囊（与听屿冰川主题一致，不再使用亮黄实心块）
            Row(
                Modifier
                    .height(40.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Color.White.copy(alpha = if (item.disabled) 0.35f else 0.88f))
                    .border(0.8.dp, Color.White.copy(alpha = 0.55f), RoundedCornerShape(20.dp))
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
            val canPlay = item.secondary.isNotBlank() && !item.disabled
            Column(
                Modifier
                    .weight(1f)
                    .testTag("discovery-radar:" + item.id)
                    .chromeClickable(enabled = !item.disabled, role = Role.Button, corner = 14.dp) { action(item.action, "", 0.0) }
            ) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f)
                        .clip(RoundedCornerShape(14.dp))
                ) {
                    DiscoveryArtCanvas(item.id, Modifier.matchParentSize())
                    // 视觉 32dp 播放按钮（距右/底 8dp），仅在有可播歌曲时拦截点击；无数据时保持不可用状态且不拦截卡片详情跳转
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .size(48.dp)
                            .then(
                                if (canPlay) {
                                    Modifier
                                        .semantics { contentDescription = "播放" + item.title }
                                        .clickable(
                                            interactionSource = remember { MutableInteractionSource() },
                                            indication = null,
                                            role = Role.Button
                                        ) { action(item.secondary, "", 0.0) }
                                } else Modifier
                            )
                            .padding(end = 8.dp, bottom = 8.dp),
                        contentAlignment = Alignment.BottomEnd
                    ) {
                        Box(
                            Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(alpha = if (canPlay) 0.56f else 0.24f))
                                .border(0.6.dp, Color.White.copy(alpha = if (canPlay) 0.28f else 0.14f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            PageIcon("play", Color.White.copy(alpha = if (canPlay) 1f else 0.45f), Modifier.size(14.dp))
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
