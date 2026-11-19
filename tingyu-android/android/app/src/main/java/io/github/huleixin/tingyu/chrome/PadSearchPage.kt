package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Retain the original query editor, source menu, tabs, row windows and pagination actions.
@Composable internal fun PadSearchPage(page: NativePage, modifier: Modifier, action: PageAction) {
    val window = LocalPadWindow.current
    val header = page.sections.filter { it.id in setOf("query", "sources", "tabs") }
    val body = page.sections.filter { it !in header }
    val browsing = header.none { it.id == "tabs" }
    val left = if (browsing) body.filter { it.id == "history" } else body.filter { it.id == "songs" || it.id == "songsEmpty" }
    val right = body.filter { it !in left }
    val startInset = if (window.expanded) 112.dp else window.pageHorizontalMargin.dp
    val endInset = window.pageHorizontalMargin.dp
    val gap = window.cardSpacing.dp

    Box(modifier.padding(start = startInset, end = endInset), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.fillMaxSize().widthIn(max = window.homeMaxWidth.dp)) {
            Text(
                page.title,
                color = PageInk,
                fontSize = if (window.shortWindow) 26.sp else 32.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = (page.safeTop + if (window.shortWindow) 12 else 24).dp, bottom = 12.dp),
            )
            NativeSearchPage(
                page.copy(sections = header, safeTop = 0f, bottomClearance = 0f),
                Modifier.fillMaxWidth().height((if (header.any { it.id == "tabs" }) 120 else 74).dp),
                action,
                headerOnly = true,
            )
            if (left.isNotEmpty() && right.isNotEmpty()) {
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(gap)) {
                    NativeSearchPage(
                        page.copy(sections = left, safeTop = 0f, bottomClearance = 100f),
                        Modifier.weight(if (browsing) 1f else 1.4f).fillMaxHeight(),
                        action,
                        pane = true,
                    )
                    NativeSearchPage(
                        page.copy(sections = right, safeTop = 0f, bottomClearance = 100f),
                        Modifier.weight(1f).fillMaxHeight(),
                        action,
                        pane = true,
                    )
                }
            } else {
                NativeSearchPage(
                    page.copy(sections = body, safeTop = 0f, bottomClearance = 100f),
                    Modifier.weight(1f).fillMaxWidth(),
                    action,
                    pane = true,
                )
            }
        }
    }
}
