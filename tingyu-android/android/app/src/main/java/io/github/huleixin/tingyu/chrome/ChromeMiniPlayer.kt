package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.kyant.backdrop.Backdrop
import io.github.huleixin.tingyu.minimal.MinimalClockSource
import io.github.huleixin.tingyu.minimal.MinimalLyrics
import io.github.huleixin.tingyu.minimal.MinimalPlayback
import io.github.huleixin.tingyu.minimal.MinimalPlayerRuntime
import io.github.huleixin.tingyu.minimal.MinimalPlayerState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlin.math.abs

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeMiniPlayer.kt
@Composable internal fun ChromeMiniPlayer(s: ChromeSurface, timeline: ChromeTimeline?, backdrop: Backdrop, modifier: Modifier,
    minimal: MinimalPlayerRuntime? = null,
    onCoverBounds: (Rect)->Unit = {}, action: (String,Double)->Unit) {
    val playbackFlow=remember(minimal){minimal?.state?.map{it.playback}?.distinctUntilChanged()}
    val playback=playbackFlow?.collectAsState(initial=minimal!!.state.value.playback)?.value
    val currentPlayback=playback?.takeIf{it.track.key==s.trackKey&&s.trackKey.isNotBlank()&&it.source!=MinimalClockSource.NONE}
    val transportTimeline=currentPlayback?.let{ChromeTimeline(it.anchorPositionMs/1000.0,it.track.durationMs/1000.0,it.playing,it.anchorElapsedMs,it)}?:timeline
    val playing=currentPlayback?.playing?:s.playing
    val ink=chromeColor(s.ink);val accent=chromeColor(s.accent)
    val cover=pageImage(s.cover)
    // 与底栏同一份材质规范（vibrancy → blur → lens + 光学高光/内阴影），只在表面不透明度上
    // 按内容密度加厚一档（MiniFill）：歌名/歌手/播放键要压住模糊背景，但折射与高光逻辑一致。
    BoxWithConstraints(modifier.chromeGlass(backdrop,s.light,28.dp,ChromeGlassPresets.active(),ChromeGlassPresets.MiniFill)) {
    val spacing=miniPlayerSpacing(maxWidth.value)
    val pad=LocalPadWindow.current.expanded
    val padSeekWidth=(maxWidth*.34f).coerceIn(200.dp,420.dp)
    Row(Modifier.fillMaxSize().padding(horizontal=6.dp,vertical=3.dp),verticalAlignment=Alignment.CenterVertically) {
        val scope=rememberCoroutineScope();val offset=remember{Animatable(0f)}
        var dx by remember{mutableFloatStateOf(0f)};var width by remember{mutableFloatStateOf(1f)}
        val latestAction by rememberUpdatedState(action)
        val drag=Modifier.pointerInput(s.canNext,s.canPrevious,s.disabled,s.trackKey) {
            detectHorizontalDragGestures(onDragStart={dx=0f;width=size.width.toFloat();latestAction("interactionStart",0.0)},onDragCancel={scope.launch{offset.animateTo(0f)};latestAction("interactionEnd",0.0)},onDragEnd={
                val next=dx<0;val allowed=!s.disabled && if(next)s.canNext else s.canPrevious
                val commit=allowed && abs(dx)>minOf(width*.24f,72.dp.toPx())
                scope.launch {
                    if(commit && !s.reducedMotion)offset.animateTo(if(next)-width else width,spring(stiffness=900f))
                    if(commit)latestAction(if(next)"next" else "previous",0.0)
                    offset.snapTo(if(commit && !s.reducedMotion) if(next)width*.18f else -width*.18f else offset.value)
                    if(s.reducedMotion)offset.snapTo(0f) else offset.animateTo(0f,spring(stiffness=650f))
                    latestAction("interactionEnd",0.0)
                }
            }) { change,amount ->
                change.consume();val desired=dx+amount;val allowed=if(desired<0)s.canNext else s.canPrevious
                dx=desired.coerceIn(-width,width);scope.launch { offset.snapTo(if(allowed)dx else dx*.22f) }
            }
        }
        Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(18.dp)).then(drag)) {
            if(abs(offset.value)>8f)Text(s.label(if(offset.value<0)"next" else "previous",if(offset.value<0)"下一首" else "上一首"),color=if(s.light)ink else ink.copy(alpha=.7f),fontSize=12.sp,maxLines=1,
                modifier=Modifier.align(Alignment.Center).graphicsLayer{translationX=offset.value+(if(offset.value<0)width else -width)})
            Row(Modifier.fillMaxSize().graphicsLayer{translationX=offset.value}.chromeClickable(role=Role.Button,corner=18.dp){action("openStage",0.0)},verticalAlignment=Alignment.CenterVertically) {
                // 左内边距原本加在裁剪容器（18.dp 圆角）之外，封面在这一层里从 x=0 起画，
                // 左上角正好落进圆角被裁掉 —— 看起来就是「封面偏左、缺一角」。
                // 只给封面本体让出 10.dp，不动整条的高度/宽度、玻璃效果、按钮与圆角；
                // padding 放在 size 之前，34.dp 的封面尺寸与 10.dp 圆角保持不变。
                Box(Modifier.padding(start=10.dp).size(if(pad)48.dp else 34.dp).onGloballyPositioned { onCoverBounds(it.boundsInRoot()) }.clip(RoundedCornerShape(10.dp)).background(accent.copy(alpha=.2f)),contentAlignment=Alignment.Center) {
                    ChromeGlyph("music",if(s.light)ink else ink.copy(alpha=.7f))
                    if(s.cover.isNotBlank())AsyncImage(model=cover,contentDescription=null,modifier=Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
                }
                Spacer(Modifier.width(spacing.gap.dp))
                Column(Modifier.weight(1f)) {
                    Text(s.title,color=ink,fontSize=13.sp,fontWeight=FontWeight.SemiBold,maxLines=1,overflow=TextOverflow.Ellipsis)
                    MiniPlayerSubtitle(
                        s = s,
                        timeline = timeline,
                        minimal = minimal,
                        color = if(s.light)LocalInterfacePalette.current.muted else ink.copy(alpha=.65f),
                    )
                }
            }
        }
        if(pad)ChromeButton("喜欢 / 取消喜欢",enabled=!s.disabled,size=46.dp,onClick={action("padLike",0.0)}){PageIcon("heart",ink,Modifier.size(23.dp))}
        if(pad)ChromeButton("上一首",enabled=!s.disabled&&s.canPrevious,size=46.dp,onClick={action("previous",0.0)}){ChromeGlyph("previous",ink,Modifier.size(23.dp))}
        ChromeButton(s.label(if(playing)"pause" else "play",if(playing)"暂停" else "播放"),enabled=!s.disabled,size=42.dp,reduced=s.reducedMotion,onClick={action("toggle",0.0)}) {
            ChromeProgressRing(transportTimeline,Modifier.size(34.dp),ink);ChromeGlyph(if(playing)"pause" else "play",ink,Modifier.size(19.dp))
        }
        if(pad)ChromeButton("下一首",enabled=!s.disabled&&s.canNext,size=46.dp,onClick={action("next",0.0)}){ChromeGlyph("next",ink,Modifier.size(23.dp))}
        ChromeButton(s.label("queue","播放队列"),size=spacing.queue.dp,reduced=s.reducedMotion,onClick={action("queue",0.0)}) {ChromeGlyph("queue",ink,Modifier.size(24.dp))}
        if(pad)Box(Modifier.width(padSeekWidth).padding(horizontal=18.dp)){ChromeSeek(s,transportTimeline,accent,ink,action)}
    }
    }
}

internal data class MiniLyricProjection(
    val playback: MinimalPlayback = MinimalPlayback(),
    val lyrics: MinimalLyrics = MinimalLyrics(),
)

internal fun Flow<MinimalPlayerState>.miniLyricProjections(): Flow<MiniLyricProjection> =
    map { MiniLyricProjection(it.playback, it.lyrics) }.distinctUntilChanged()

/**
 * 计算迷你播放条长句歌词的横向跟随滚动位移（px，>= 0）。
 * 短句（未超出容器宽度）固定返回 0；长句在唱过阅读锚点后平滑左移，句尾贴齐右边界后停止。
 */
internal fun miniLyricScrollOffsetPx(
    textWidthPx: Int,
    containerWidthPx: Int,
    sungFraction: Float,
    anchorFraction: Float = 0.36f,
): Float {
    if (textWidthPx <= 0 || containerWidthPx <= 0 || textWidthPx <= containerWidthPx) return 0f
    val overflow = (textWidthPx - containerWidthPx).toFloat()
    val progress = sungFraction.coerceIn(0f, 1f)
    val sungX = progress * textWidthPx.toFloat()
    val anchorX = containerWidthPx.toFloat() * anchorFraction.coerceIn(0.1f, 0.9f)
    return (sungX - anchorX).coerceIn(0f, overflow)
}

/**
 * 迷你播放条第二行：有实时歌词时显示当前唱到的那句歌词（长句按演唱进度平滑横向滚动），
 * 前奏、加载中或无歌词时回退显示歌手名，切歌立即复位。
 */
@Composable
private fun MiniPlayerSubtitle(
    s: ChromeSurface,
    timeline: ChromeTimeline?,
    minimal: MinimalPlayerRuntime?,
    color: Color,
) {
    if (minimal == null) {
        Text(s.artist, color = color, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        return
    }
    val projectionFlow = remember(minimal) { minimal.state.miniLyricProjections() }
    val projection by projectionFlow.collectAsState(
        initial = MiniLyricProjection(minimal.state.value.playback, minimal.state.value.lyrics),
    )
    val lyrics = projection.lyrics
    val playback = projection.playback
    val hasReadyLyrics = s.trackKey.isNotEmpty() && lyrics.songKey == s.trackKey && lyrics.ready
    val rendering = LocalChromeRendering.current && !s.reducedMotion && !LocalLiquidReduced.current
    val clockActive = hasReadyLyrics && rendering && (s.playing || playback.playing)
    val now = remember { mutableLongStateOf(android.os.SystemClock.elapsedRealtime()) }
    LaunchedEffect(
        clockActive,
        s.trackKey,
        playback.anchorElapsedMs,
        playback.anchorPositionMs,
        timeline,
    ) {
        now.longValue = android.os.SystemClock.elapsedRealtime()
        if (clockActive) {
            while (true) {
                withFrameNanos { now.longValue = android.os.SystemClock.elapsedRealtime() }
            }
        }
    }
    fun resolveSec(elapsedMs: Long): Double = when {
        playback.track.key == s.trackKey && playback.source != MinimalClockSource.NONE -> playback.lyricSecAt(elapsedMs)
        timeline != null -> timeline.at(elapsedMs)
        else -> 0.0
    }
    val activeLineIndex by remember(hasReadyLyrics, lyrics, playback, timeline, s.trackKey) {
        derivedStateOf {
            if (!hasReadyLyrics) -1 else lyrics.activeIndex(resolveSec(now.longValue))
        }
    }
    val activeLine = if (activeLineIndex >= 0) lyrics.lines.getOrNull(activeLineIndex) else null
    val lyricText = activeLine?.text?.trim().orEmpty()
    val showingLyric = activeLine != null && lyricText.isNotEmpty()
    val displayText = if (showingLyric) lyricText else s.artist

    var lastLineIndex by remember(s.trackKey) { mutableIntStateOf(activeLineIndex) }
    val lineProgress = remember(s.trackKey) { Animatable(1f) }
    LaunchedEffect(s.trackKey, activeLineIndex, s.reducedMotion) {
        if (activeLineIndex != lastLineIndex) {
            lastLineIndex = activeLineIndex
            if (!s.reducedMotion) {
                lineProgress.snapTo(0f)
                lineProgress.animateTo(1f, tween(180))
            } else {
                lineProgress.snapTo(1f)
            }
        }
    }

    var containerWidthPx by remember { mutableIntStateOf(0) }
    var textWidthPx by remember(s.trackKey, activeLineIndex, displayText) { mutableIntStateOf(0) }
    val currentLine = activeLine
    val overflows = currentLine != null && lyricText.isNotEmpty() && textWidthPx > containerWidthPx && containerWidthPx > 0

    Box(
        Modifier
            .fillMaxWidth()
            .clipToBounds()
            .onSizeChanged { containerWidthPx = it.width }
            .then(
                if (overflows) {
                    Modifier
                        .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                        .drawWithContent {
                            drawContent()
                            val scrollPx = miniLyricScrollOffsetPx(
                                textWidthPx,
                                containerWidthPx,
                                currentLine.sungFraction(resolveSec(now.longValue)),
                            )
                            val fadePx = 10.dp.toPx().coerceAtMost(size.width * 0.22f)
                            if (fadePx > 1f) {
                                if (scrollPx > 1f) {
                                    drawRect(
                                        brush = Brush.horizontalGradient(
                                            0f to Color.Transparent,
                                            1f to Color.Black,
                                            startX = 0f,
                                            endX = fadePx,
                                        ),
                                        topLeft = Offset.Zero,
                                        size = Size(fadePx, size.height),
                                        blendMode = BlendMode.DstIn,
                                    )
                                }
                                val maxScroll = (textWidthPx - containerWidthPx).toFloat()
                                if (scrollPx < maxScroll - 1f) {
                                    drawRect(
                                        brush = Brush.horizontalGradient(
                                            0f to Color.Black,
                                            1f to Color.Transparent,
                                            startX = size.width - fadePx,
                                            endX = size.width,
                                        ),
                                        topLeft = Offset(size.width - fadePx, 0f),
                                        size = Size(fadePx, size.height),
                                        blendMode = BlendMode.DstIn,
                                    )
                                }
                            }
                        }
                } else Modifier,
            ),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (currentLine != null && lyricText.isNotEmpty()) {
            Text(
                text = displayText,
                color = color,
                fontSize = 10.sp,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Clip,
                onTextLayout = { textWidthPx = it.size.width },
                modifier = Modifier
                    .wrapContentWidth(unbounded = true, align = Alignment.Start)
                    .graphicsLayer {
                        val scrollPx = if (textWidthPx > containerWidthPx && containerWidthPx > 0) {
                            miniLyricScrollOffsetPx(
                                textWidthPx,
                                containerWidthPx,
                                currentLine.sungFraction(resolveSec(now.longValue)),
                            )
                        } else 0f
                        translationX = -scrollPx
                        alpha = lineProgress.value
                        translationY = 3.dp.toPx() * (1f - lineProgress.value)
                    },
            )
        } else {
            Text(
                text = displayText,
                color = color,
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .fillMaxWidth()
                    .graphicsLayer {
                        alpha = lineProgress.value
                        translationY = 3.dp.toPx() * (1f - lineProgress.value)
                    },
            )
        }
    }
}
