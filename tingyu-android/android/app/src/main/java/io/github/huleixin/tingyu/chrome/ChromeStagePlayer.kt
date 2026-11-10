package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kyant.backdrop.Backdrop
import io.github.huleixin.tingyu.minimal.ui.mintActive
import io.github.huleixin.tingyu.minimal.ui.modeIsActive

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeStagePlayer.kt
//
// 歌词舞台底部播放胶囊（1.3.188 舞台专项）。
//
// 形态唯一：一条横向悬浮的液态玻璃胶囊，两行 —— 五个控制 + 一条进度（时间在轨道下方两端）。
// 没有展开态/收起态，没有二级面板，不放封面/歌名（顶部已有）。
//
// 与首页迷你播放器同一套材质：都走 chromeGlass() → Kyant0 drawBackdrop（vibrancy + blur + lens
// + Highlight 光学高光 + 下缘 InnerShadow + 顶部环境反射），只是表面不透明度按内容密度微调。
// 舞台背景是 WebView 歌词页，采样源由 ComposeChromeHost 的 stageBackdrop 提供，玻璃随背景实时变化。
//
// 尺寸契约：外框 96dp（NativeFooterLayout.rect("stage")），左右各 10dp 安全边距，
// 内部 padding 14/7；第一行 46dp（侧键 44dp 触控、中心 46dp 圆片），第二行 18dp 轨道 + 12dp 时间。
private val StageFill = 1.06f   // 舞台背景更花，表面比底栏厚 6%，仍属同一材质规范

@Composable fun ChromeStagePlayer(s: ChromeSurface, timeline: ChromeTimeline?, backdrop: Backdrop, modifier: Modifier, action: (String,Double)->Unit) {
    val ink=chromeColor(s.ink);val accent=chromeColor(s.accent)
    Column(
        modifier.chromeGlass(backdrop,s.light,28.dp,ChromeGlassPresets.active(),StageFill, interfaceTheme = false)
            .padding(horizontal=14.dp,vertical=7.dp),
        verticalArrangement=Arrangement.SpaceBetween,
    ) {
        Row(
            Modifier.fillMaxWidth().height(46.dp),
            verticalAlignment=Alignment.CenterVertically,
            horizontalArrangement=Arrangement.SpaceBetween,
        ) {
            // 播放模式 / 上一首 / 播放暂停 / 下一首 / 队列 —— 五个都保留，均不含文字标签。
            ChromeButton(s.label("loop","播放模式"),enabled=!s.disabled,size=44.dp,reduced=s.reducedMotion,onClick={action("loop",0.0)}) {
                ChromeGlyph(s.loop,if(modeIsActive(s.loop))mintActive(s.light)else ink,Modifier.size(22.dp))
            }
            ChromeButton(s.label("previous","上一首"),enabled=!s.disabled&&s.canPrevious,size=44.dp,reduced=s.reducedMotion,onClick={action("previous",0.0)}) {
                ChromeGlyph("previous",ink,Modifier.size(24.dp))
            }
            StagePlayButton(s,ink,accent,onToggle={action("toggle",0.0)})
            ChromeButton(s.label("next","下一首"),enabled=!s.disabled&&s.canNext,size=44.dp,reduced=s.reducedMotion,onClick={action("next",0.0)}) {
                ChromeGlyph("next",ink,Modifier.size(24.dp))
            }
            ChromeButton(s.label("queue","播放队列"),size=44.dp,reduced=s.reducedMotion,onClick={action("queue",0.0)}) {
                ChromeGlyph("queue",ink,Modifier.size(22.dp))
            }
        }
        ChromeSeek(s,timeline,accent,ink,action)
    }
}

/**
 * 中央播放键：46dp 圆形液态玻璃片。
 *
 * 不用第二块 backdrop —— 舞台上 backdrop 是每帧重录的 WebView，若再采样会有一帧滞后。
 * 这里用「基膜 + 左上镜面 + 下缘微暗」三层叠出玻璃片的体积，不画描边（避免白硬边）。
 * 按压缩放 0.90、spring damping 0.38，抬手有轻微回弹。
 */
@Composable private fun StagePlayButton(s: ChromeSurface, ink: Color, accent: Color, onToggle: ()->Unit) {
    val interaction=remember{MutableInteractionSource()}
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue=if(pressed&&!s.reducedMotion).90f else 1f,
        animationSpec=spring(dampingRatio=.38f,stiffness=620f),
        label="stage-play",
    )
    val label=s.label(if(s.playing)"pause" else "play",if(s.playing)"暂停" else "播放")
    Box(
        Modifier.size(46.dp)
            .graphicsLayer{scaleX=scale;scaleY=scale;alpha=if(s.disabled).4f else 1f}
            .semantics{contentDescription=label}
            .clickable(interactionSource=interaction,indication=null,enabled=!s.disabled,role=Role.Button,onClick=onToggle),
        contentAlignment=Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val r=size.minDimension/2f
            val center=Offset(size.width/2f,size.height/2f)
            // ① 玻璃基膜
            drawCircle(if(s.light)Color.White.copy(alpha=.34f) else Color.White.copy(alpha=.15f),r,center)
            // ② 左上镜面：光从左上打过来
            drawCircle(
                brush=Brush.linearGradient(
                    0f to Color.White.copy(alpha=if(s.light).30f else .18f),
                    .55f to Color.Transparent,
                    start=Offset(0f,0f),
                    end=Offset(size.width,size.height),
                ),
                radius=r,center=center,
            )
            // ③ 下缘微暗，给圆片一点厚度（不是描边）
            drawCircle(
                brush=Brush.linearGradient(
                    0f to Color.Transparent,
                    .62f to Color.Transparent,
                    1f to (if(s.light)Color.Black else Color.White).copy(alpha=.07f),
                    start=Offset(0f,0f),
                    end=Offset(size.width,size.height),
                ),
                radius=r,center=center,
            )
        }
        ChromeGlyph(if(s.playing)"pause" else "play",ink,Modifier.size(21.dp))
    }
}

@Composable private fun ChromeSeek(s: ChromeSurface, timeline: ChromeTimeline?, accent: Color, ink: Color, action: (String,Double)->Unit) {
    val now=rememberChromeNow(timeline);var dragged by remember(s.trackKey){mutableStateOf<Double?>(null)}
    val current by remember(timeline) { derivedStateOf { chromeTime(timeline?.at(now.value)?:0.0) } }
    val enabled=!s.disabled&&s.duration>0
    Column {
        Canvas(Modifier.fillMaxWidth().height(18.dp).semantics {
            contentDescription=s.label("seek","播放进度")
            progressBarRangeInfo=ProgressBarRangeInfo((timeline?.position?:0.0).toFloat(),0f..s.duration.toFloat().coerceAtLeast(1f))
            setProgress {if(enabled){action("seek",it.toDouble().coerceIn(0.0,s.duration));true}else false}
        }.pointerInput(enabled,s.duration,s.trackKey) {
            if(enabled)detectDragGestures(onDragStart={dragged=(it.x/size.width*s.duration).coerceIn(0.0,s.duration);action("interactionStart",0.0)},onDragEnd={dragged?.let{action("seek",it)};dragged=null;action("interactionEnd",0.0)},onDragCancel={dragged=null;action("interactionEnd",0.0)}) {change,_->change.consume();dragged=(change.position.x/size.width*s.duration).coerceIn(0.0,s.duration)}
        }.pointerInput(enabled,s.duration) {if(enabled)detectTapGestures{action("seek",(it.x/size.width*s.duration).coerceIn(0.0,s.duration))}}) {
            val position=dragged?:timeline?.at(now.value)?:0.0
            val fraction=if(s.duration>0)(position/s.duration).toFloat().coerceIn(0f,1f)else 0f
            val y=size.height/2
            val track=3.dp.toPx()
            val thumbX=size.width*fraction
            drawLine(ink.copy(alpha=.20f),Offset(0f,y),Offset(size.width,y),track,StrokeCap.Round)
            drawLine(accent,Offset(0f,y),Offset(thumbX,y),track,StrokeCap.Round)
            // 拖动态给小圆点一圈柔光，静止时只留实心点（不画描边）。
            if(dragged!=null)drawCircle(accent.copy(alpha=.22f),8.dp.toPx(),Offset(thumbX,y))
            drawCircle(accent,4.5.dp.toPx(),Offset(thumbX,y))
        }
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
            Text(dragged?.let{chromeTime(it)}?:current,color=ink.copy(alpha=.62f),fontSize=10.sp,lineHeight=12.sp)
            Text(chromeTime(s.duration),color=ink.copy(alpha=.62f),fontSize=10.sp,lineHeight=12.sp)
        }
    }
}
