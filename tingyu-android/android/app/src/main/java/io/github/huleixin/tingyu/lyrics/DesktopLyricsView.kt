package io.github.huleixin.tingyu.lyrics

import android.graphics.Paint
import android.graphics.Typeface
import android.text.TextUtils
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalConfiguration
import io.github.huleixin.tingyu.minimal.MinimalLyricLine
import io.github.huleixin.tingyu.minimal.graphemeTimeline
import kotlinx.coroutines.isActive

// Only visible karaoke drawing reads frames; all consumers use the same immutable playback anchor.
@Composable
internal fun DesktopLyricsView(projection: LyricsProjection, settings: LyricsPreferencesState,
    drag: (Float, Float) -> Unit, savePosition: () -> Unit, close: () -> Unit, lock: () -> Unit) {
    val style = settings.style
    val zh = LocalConfiguration.current.locales[0].language == "zh"
    Column(Modifier.fillMaxWidth().background(Color.Black.copy(alpha = .22f), RoundedCornerShape(12.dp))
        .then(if (!settings.locked) Modifier.pointerInput(Unit) {
            detectDragGestures(onDragEnd = savePosition, onDragCancel = savePosition) { change, amount ->
                change.consume(); drag(amount.x, amount.y)
            }
        } else Modifier).padding(horizontal = 12.dp, vertical = 6.dp)) {
        if (!settings.locked) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                androidx.compose.material3.TextButton(onClick = lock) { Text(if (zh) "锁定" else "Lock", fontSize = 12.sp, color = Color.White) }
                androidx.compose.material3.TextButton(onClick = close) { Text(if (zh) "关闭" else "Close", fontSize = 12.sp, color = Color.White) }
            }
        }
        // Key by epoch so song changes cannot fade out the previous song. Same-song lines crossfade.
        key(projection.songKey, projection.epoch) {
            Crossfade(targetState = projection.index, animationSpec = tween(180), label = "desktop-line") { index ->
                Column {
                    val line = projection.lineAt(index)
                    KaraokeLine(line, projection, style, fallback = projection.state.playback.track.title.ifEmpty { if (zh) "听屿 · 暂无歌词" else "Tingyu · No lyrics" })
                    if (style.doubleLine) {
                        val next = projection.lineAt(index + 1)
                        KaraokeLine(next, projection, style.copy(fontSize = style.fontSize * .82f), active = false, fallback = "")
                    }
                }
            }
        }
    }
}

/** Native text drawing preserves outline and clips each measured grapheme for a smooth sweep. */
@Composable
private fun KaraokeLine(line: MinimalLyricLine?, projection: LyricsProjection, style: DesktopLyricsStyle,
    active: Boolean = true, fallback: String) {
    val now = remember { mutableLongStateOf(android.os.SystemClock.elapsedRealtime()) }
    val playback = projection.state.playback
    val timeline = remember(line) { line?.graphemeTimeline }
    LaunchedEffect(playback, active, style.wordHighlight, line) {
        now.longValue = android.os.SystemClock.elapsedRealtime()
        if (active && style.wordHighlight && line != null && playback.playing && !playback.buffering) {
            while (isActive) {
                withFrameNanos { now.longValue = android.os.SystemClock.elapsedRealtime() }
                if (playback.lyricSecAt(now.longValue) >= line.endSec ||
                    now.longValue - playback.anchorElapsedMs >= playback.maxExtrapolationMs) break
            }
        }
    }
    val text = line?.text ?: fallback
    val lineHeight = with(LocalDensity.current) { (style.fontSize * 1.6f).sp.toDp() }
    val paint = remember { Paint(Paint.ANTI_ALIAS_FLAG) }
    Canvas(Modifier.fillMaxWidth().height(lineHeight).semantics { contentDescription = text }) {
        paint.apply {
            alpha = 255
            textSize = style.fontSize.sp.toPx()
            typeface = when (style.font) { "serif" -> Typeface.SERIF; "mono" -> Typeface.MONOSPACE; else -> Typeface.DEFAULT_BOLD }
        }
        val display = TextUtils.ellipsize(text, android.text.TextPaint(paint), size.width, TextUtils.TruncateAt.END).toString()
        val width = paint.measureText(display)
        val x = ((size.width - width) / 2).coerceAtLeast(0f)
        val baseline = (size.height - paint.fontMetrics.ascent - paint.fontMetrics.descent) / 2
        val canvas = drawContext.canvas.nativeCanvas
        if (style.outline > 0) {
            paint.style = Paint.Style.STROKE; paint.strokeWidth = style.outline.dp.toPx()
            paint.color = android.graphics.Color.BLACK; canvas.drawText(display, x, baseline, paint)
        }
        paint.style = Paint.Style.FILL
        paint.color = android.graphics.Color.parseColor(if (active && !style.wordHighlight) style.highlight else style.color)
        paint.alpha = if (active) 255 else 175
        canvas.drawText(display, x, baseline, paint)
        if (active && style.wordHighlight && timeline != null) {
            val sung = timeline.sungPosition(playback.lyricSecAt(now.longValue))
            var measured = 0f
            timeline.graphemes.forEachIndexed { index, glyph ->
                measured += paint.measureText(glyph.text) * (sung - index).coerceIn(0f, 1f)
            }
            val checkpoint = canvas.save()
            canvas.clipRect(x, 0f, (x + measured).coerceAtMost(size.width), size.height)
            paint.color = android.graphics.Color.parseColor(style.highlight); paint.alpha = 255
            canvas.drawText(display, x, baseline, paint); canvas.restoreToCount(checkpoint)
        }
    }
}
