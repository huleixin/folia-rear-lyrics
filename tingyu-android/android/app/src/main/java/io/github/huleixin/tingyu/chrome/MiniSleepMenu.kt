package io.github.huleixin.tingyu.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MiniSleepMenu.kt
internal class SleepMenuColors(private val palette:InterfacePalette) {
    constructor(light:Boolean):this(InterfacePalette(light))
    val ink get()=palette.ink
    val muted get()=palette.muted
    val accent get()=palette.accent
    // The same neutral glass tint as chromeGlass, with a modest readability veil for a larger panel.
    val tint get()=palette.sleepTint
    val arrowTint get()=palette.sleepArrow
    val line get()=palette.sleepLine
    val control get()=ink.copy(alpha=.045f)
    val selected get()=accent.copy(alpha=.14f)

}
@Composable internal fun SleepAlarm(color:Color,modifier:Modifier=Modifier) {
    Canvas(modifier.size(22.dp)) {
        val u=size.minDimension/24f
        val stroke=Stroke(1.8f*u,cap=StrokeCap.Round)
        drawCircle(color,8f*u,Offset(12f*u,13f*u),style=stroke)
        val path=Path().apply {
            moveTo(12f*u,8f*u);lineTo(12f*u,13f*u);lineTo(15f*u,15f*u)
            moveTo(3f*u,5f*u);lineTo(6f*u,2f*u)
            moveTo(18f*u,2f*u);lineTo(21f*u,5f*u)
            moveTo(6f*u,20f*u);lineTo(4f*u,22f*u)
            moveTo(18f*u,20f*u);lineTo(20f*u,22f*u)
        }
        drawPath(path,color,style=stroke)
    }
}
@Composable internal fun MiniSleepButton(ui:MiniSleepUi,light:Boolean,width:Float,reduced:Boolean,action:()->Unit,modifier:Modifier=Modifier) {
    val snapshot=ui.snapshot
    val now=sleepDisplayNow(snapshot,LocalChromeRendering.current,false)
    val palette=LocalInterfacePalette.current
    val colors=remember(palette){SleepMenuColors(palette)}
    val color=if(snapshot.active)colors.accent else colors.ink.copy(alpha=.85f)
    val label=if(snapshot.active)"定时关闭：${if(snapshot.waiting)"本曲结束"else snapshot.clockAt(now)}，点击修改或取消"else"定时关闭"
    ChromeButton(label,modifier=modifier,size=width.dp,reduced=reduced,onClick=action) {
        Column(Modifier.background(if(snapshot.active)colors.accent.copy(alpha=.10f)else Color.Transparent,RoundedCornerShape(14.dp))
            .padding(horizontal=4.dp,vertical=2.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
            SleepAlarm(color,Modifier.size(if(snapshot.active&&!snapshot.waiting)17.dp else 21.dp))
            if(snapshot.active&&!snapshot.waiting)Text(snapshot.minutesAt(now),color=color,fontSize=8.sp,lineHeight=10.sp,maxLines=1)
        }
    }
}

/** 与队列共用面板底色和动效，短屏内容滚动；定时状态仍由原生服务持有。 */
@Composable internal fun MiniSleepMenu(ui:MiniSleepUi,safeTop:Float,safeBottom:Float,light:Boolean,
    preferredMinutes:Int=30,reduced:Boolean=false,onDismiss:()->Unit) {
    val palette=LocalInterfacePalette.current
    val colors=remember(palette){SleepMenuColors(palette)}
    val theme=TyPanelTheme.from(palette)
    val snapshot=ui.snapshot
    val now=sleepDisplayNow(snapshot,LocalChromeRendering.current,true)
    var advanced by rememberSaveable { mutableStateOf(false) }
    var mode by rememberSaveable { mutableStateOf(snapshot.mode) }
    val initial=if(snapshot.active&&snapshot.duration>0)(snapshot.duration/60000).toInt()else preferredMinutes.takeIf{it in 1..1440}?:30
    var hours by rememberSaveable {mutableIntStateOf(initial/60)}
    var minutes by rememberSaveable {mutableIntStateOf(initial%60)}
    val scroll=rememberScrollState()
    LaunchedEffect(ui.error){if(ui.error.isNotBlank()){withFrameNanos{};if(reduced)scroll.scrollTo(scroll.maxValue)else scroll.animateScrollTo(scroll.maxValue)}}
    BackHandler {onDismiss()}
    DisposableEffect(ui){ui.clearError();onDispose{ui.clearError()}}
    fun start(nextMode:String,duration:Long){if(ui.start(nextMode,duration))onDismiss()}
    val density=LocalDensity.current
    val dismiss by rememberUpdatedState(onDismiss)
    var drag by remember { mutableFloatStateOf(0f) }
    val handle=Modifier.pointerInput(Unit) {
        detectVerticalDragGestures(onDragStart={drag=0f},onDragCancel={drag=0f},
            onDragEnd={if(drag>with(density){56.dp.toPx()})dismiss();drag=0f}) {change,amount->change.consume();drag+=amount}
    }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth()
            .heightIn(max=(maxHeight-safeTop.dp).coerceAtLeast(0.dp))
            .clip(RoundedCornerShape(topStart=TyPanelDims.TopRadius.dp,topEnd=TyPanelDims.TopRadius.dp))
            .background(theme.surface).pointerInput(Unit){detectTapGestures{}}
            .semantics{paneTitle="定时关闭"}) {
            Box(Modifier.fillMaxWidth().height(28.dp).then(handle),contentAlignment=Alignment.Center) {
                Box(Modifier.size(36.dp,4.dp).background(theme.muted.copy(alpha=.35f),RoundedCornerShape(99.dp)))
            }
            Row(Modifier.fillMaxWidth().padding(horizontal=20.dp).then(handle),verticalAlignment=Alignment.CenterVertically) {
                SleepAlarm(colors.ink,Modifier.size(22.dp))
                Text("定时关闭",color=theme.text,fontSize=17.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f).padding(start=10.dp))
                ChromeButton("关闭定时菜单",size=44.dp,onClick=onDismiss){
                    Canvas(Modifier.size(22.dp)) {
                        val u=size.minDimension/22f
                        drawLine(theme.text,Offset(5f*u,5f*u),Offset(17f*u,17f*u),1.8f*u,StrokeCap.Round)
                        drawLine(theme.text,Offset(17f*u,5f*u),Offset(5f*u,17f*u),1.8f*u,StrokeCap.Round)
                    }
                }
            }
            Column(Modifier.weight(1f,fill=false).verticalScroll(scroll)
                .padding(start=20.dp,end=20.dp,top=8.dp,bottom=maxOf(safeBottom,TyPanelDims.BottomPadding).dp),
                verticalArrangement=Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth().heightIn(min=40.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    if(advanced)ChromeButton("返回快捷定时",size=32.dp,onClick={advanced=false;ui.clearError()}){PageIcon("chevron-left",colors.ink,Modifier.size(20.dp))}
                    Text(if(advanced)"更多选项"else"快捷定时",color=colors.muted,fontSize=13.sp,modifier=Modifier.weight(1f))
                    if(!advanced)SleepMenuAction("更多选项 ›",colors,Modifier.widthIn(min=88.dp),small=true){advanced=true;ui.clearError()}
                }
                if(snapshot.active) {
                    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(if(snapshot.waiting)"本曲结束暂停"else snapshot.clockAt(now),color=colors.accent,fontSize=if(snapshot.waiting)17.sp else 26.sp,fontWeight=FontWeight.SemiBold)
                            Text(if(snapshot.waiting)"等待当前歌曲自然结束"else if(snapshot.mode=="deadline_track")"时间结束后播完当前歌曲再暂停"else"时间结束立即暂停",color=colors.muted,fontSize=10.sp,lineHeight=15.sp)
                        }
                        if(!advanced)SleepMenuAction("修改",colors,small=true){advanced=true;ui.clearError()}
                        SleepMenuAction("取消定时",colors,small=true){if(ui.cancel())onDismiss()}
                    }
                }
                if(!advanced) {
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                        listOf(15,30,60).forEach { value -> SleepMenuAction("$value 分钟",colors,Modifier.weight(1f),
                            selected=snapshot.active&&snapshot.mode=="deadline"&&snapshot.duration==value*60000L){start("deadline",value*60000L)} }
                    }
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                        SleepMenuAction("本曲结束",colors,Modifier.weight(1f),selected=snapshot.active&&snapshot.mode=="track"){start("track",0)}
                        SleepMenuAction("自定义",colors,Modifier.weight(1f)){if(mode=="track")mode="deadline";advanced=true;ui.clearError()}
                    }
                } else {
                    Text("停止方式",color=colors.muted,fontSize=12.sp)
                    Column(Modifier.fillMaxWidth().background(colors.control,RoundedCornerShape(20.dp))) {
                        listOf("deadline" to "时间结束立即暂停","track" to "当前歌曲播放完暂停","deadline_track" to "时间结束后播完当前歌曲再暂停").forEach{(id,label)->
                            val selected=mode==id
                            Row(Modifier.fillMaxWidth().heightIn(min=44.dp).background(if(selected)colors.selected else Color.Transparent,RoundedCornerShape(20.dp))
                                .border(if(selected)1.dp else 0.dp,if(selected)colors.accent.copy(alpha=.45f)else Color.Transparent,RoundedCornerShape(20.dp))
                                .selectable(selected=selected,role=Role.RadioButton,onClick={mode=id;ui.clearError()}).padding(horizontal=12.dp,vertical=8.dp),
                                verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                                Canvas(Modifier.size(16.dp)){drawCircle(if(selected)colors.accent else colors.muted.copy(alpha=.7f),style=Stroke(1.5.dp.toPx()));if(selected)drawCircle(colors.accent,4.dp.toPx())}
                                Text(label,color=colors.ink,fontSize=12.sp,lineHeight=18.sp)
                            }
                        }
                    }
                    if(mode!="track") {
                        Box(Modifier.fillMaxWidth().height(.7.dp).background(colors.accent.copy(alpha=.14f)))
                        Text("自定义时长",color=colors.muted,fontSize=12.sp)
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                            SleepDurationPart("小时",hours,0,24,colors,Modifier.weight(1f)){hours=it;if(hours==24)minutes=0}
                            SleepDurationPart("分钟",minutes,0,if(hours==24)0 else 59,colors,Modifier.weight(1f)){minutes=it}
                        }
                    }
                    SleepMenuAction("开始定时",colors,Modifier.fillMaxWidth(),primary=true,enabled=mode=="track"||hours*60+minutes>0){start(mode,(hours*60+minutes)*60000L)}
                }
                if(ui.error.isNotBlank())Text(ui.error,color=LocalInterfacePalette.current.sleepError,fontSize=12.sp,lineHeight=18.sp,modifier=Modifier.semantics{contentDescription="定时设置失败：${ui.error}"})
            }
        }
    }
}
@Composable private fun SleepMenuAction(label:String,colors:SleepMenuColors,modifier:Modifier=Modifier,selected:Boolean=false,primary:Boolean=false,
    enabled:Boolean=true,small:Boolean=false,onClick:()->Unit) {
    Box(modifier.heightIn(min=44.dp).background(if(primary||selected)colors.selected else colors.control,RoundedCornerShape(999.dp))
        .border(if(selected||primary)1.dp else .7.dp,if(selected||primary)colors.accent.copy(alpha=.4f)else colors.line.copy(alpha=.14f),RoundedCornerShape(999.dp))
        .chromeClickable(enabled=enabled,role=Role.Button,corner=999.dp,onClick=onClick).padding(horizontal=if(small)10.dp else 6.dp,vertical=8.dp),contentAlignment=Alignment.Center) {
        Text(label,color=(if(primary||selected)colors.accent else colors.ink).copy(alpha=if(enabled)1f else .40f),
            fontSize=if(small)11.sp else 13.sp,lineHeight=18.sp,fontWeight=if(selected||primary)FontWeight.SemiBold else FontWeight.Medium)
    }
}
@Composable private fun SleepDurationPart(unit:String,value:Int,min:Int,max:Int,colors:SleepMenuColors,modifier:Modifier,onValue:(Int)->Unit) {
    Row(modifier.heightIn(min=44.dp).background(colors.control,RoundedCornerShape(999.dp)).padding(horizontal=3.dp),
        verticalAlignment=Alignment.CenterVertically) {
        Box(Modifier.width(32.dp).height(44.dp).semantics{contentDescription="减少$unit"}.chromeClickable(enabled=value>min,role=Role.Button,corner=10.dp){onValue(value-1)},contentAlignment=Alignment.Center){Text("−",color=colors.muted.copy(alpha=if(value>min)1f else .35f),fontSize=18.sp)}
        Text("%02d $unit".format(value),color=colors.ink,fontSize=12.sp,maxLines=1,modifier=Modifier.weight(1f),textAlign=androidx.compose.ui.text.style.TextAlign.Center)
        Box(Modifier.width(32.dp).height(44.dp).semantics{contentDescription="增加$unit"}.chromeClickable(enabled=value<max,role=Role.Button,corner=10.dp){onValue(value+1)},contentAlignment=Alignment.Center){Text("+",color=colors.muted.copy(alpha=if(value<max)1f else .35f),fontSize=18.sp)}
    }
}
