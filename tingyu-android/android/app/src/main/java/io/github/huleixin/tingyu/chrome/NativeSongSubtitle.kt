package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.layout.*
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.huleixin.tingyu.minimal.ui.MinimalCatalogBadge

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSongSubtitle.kt
internal fun catalogBadgeLimit(widthDp: Int, fontScale: Float) = if (widthDp < 360 || fontScale > 1.3f) 2 else 3

internal data class CatalogBadge(val spec: String, val label: String)

/** Pick the highest tier, then one independent version and permission; never infer playback quality. */
internal fun catalogBadges(specs: List<String>): List<CatalogBadge> {
    val known = specs.toSet()
    return listOfNotNull(
        listOf("master" to "母带", "hires" to "Hi-Res", "lossless" to "无损", "high" to "HQ")
            .firstOrNull { it.first in known },
        listOf("jyeffect" to "高清臻音", "sky" to "沉浸环绕", "dolby" to "杜比", "dts" to "DTS").firstOrNull { it.first in known },
        listOf("vip" to "VIP", "paid" to "付费").firstOrNull { it.first in known },
    ).map { CatalogBadge(it.first, it.second) }
}

/** Static catalog metadata; width budgeting reserves at least 40% of the subtitle for the artist. */
@Composable internal fun NativeSongSubtitle(item: NativePageItem, size: Int = 11, lineHeight: TextUnit = TextUnit.Unspecified, modifier: Modifier = Modifier) {
    val badges = catalogBadges(item.audioSpecs)
    if (badges.isEmpty()) {
        Text(item.subtitle, color = PageMuted, fontSize = size.sp, lineHeight = lineHeight, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)
        return
    }
    val density = LocalDensity.current
    val screenWidth = LocalConfiguration.current.screenWidthDp
    val measurer = rememberTextMeasurer()
    val badgeStyle = LocalTextStyle.current.copy(fontSize = 9.sp, fontWeight = FontWeight.Medium)
    BoxWithConstraints(modifier.fillMaxWidth().clearAndSetSemantics {
        contentDescription = listOf(item.subtitle, item.audioSpecsLabel.ifBlank { badges.joinToString(", ") { it.label } })
            .filter { it.isNotBlank() }.joinToString(", ")
    }) {
        val limit = catalogBadgeLimit(screenWidth, density.fontScale)
        val budget = with(density) { (maxWidth * 0.52f).toPx() }
        var used = 0f
        val visible = badges.take(limit).takeWhile { badge ->
            val width = measurer.measure(AnnotatedString(badge.label), badgeStyle).size.width
            used += width + with(density) { 9.dp.toPx() }
            used <= budget
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(item.subtitle, color = PageMuted, fontSize = size.sp, lineHeight = lineHeight, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false))
            visible.forEach { badge -> MinimalCatalogBadge(badge.spec, badge.label) }
        }
    }
}
