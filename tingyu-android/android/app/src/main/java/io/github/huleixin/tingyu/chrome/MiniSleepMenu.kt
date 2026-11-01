package io.github.huleixin.tingyu.chrome

import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kyant.backdrop.Backdrop

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MiniSleepMenu.kt
internal class SleepMenuColors(light:Boolean) {
    private val palette=InterfacePalette(light)
    val ink=palette.ink
    val muted=palette.muted
    val accent=palette.accent
    // The same neutral glass tint as chromeGlass, with a modest readability veil for a larger panel.
    val tint=if(light)Color(0x33F1F4ED)else Color(0x4D303B36)
    val arrowTint=if(light)Color(0xB8F1F4ED)else Color(0xA1303B36)
    val line=if(light)LightInterfaceColors.Border else Color.White.copy(alpha=.23f)
    val control=ink.copy(alpha=.045f)
    val selected=accent.copy(alpha=.14f)

}
@Composable internal fun SleepMoon(color:Color,modifier:Modifier=Modifier,active:Boolean=false) {
    Canvas(modifier.size(22.dp)) {
        val u=size.minDimension/24f
        val path=Path().apply {
            moveTo(20.8f*u,13f*u);cubicTo(19.6f*u,13.6f*u,18.2f*u,13.9f*u,16.9f*u,13.9f*u)
            cubicTo(12.5f*u,13.9f*u,9f*u,10.4f*u,9f*u,6f*u);cubicTo(9f*u,4.7f*u,9.3f*u,3.4f*u,9.9f*u,2.2f*u)
            cubicTo(5.7f*u,3.2f*u,2.8f*u,6.8f*u,2.8f*u,11.2f*u);cubicTo(2.8f*u,16.4f*u,7f*u,20.6f*u,12.2f*u,20.6f*u)
            cubicTo(16.4f*u,20.6f*u,20f*u,17.7f*u,20.8f*u,13f*u);close()
        }
        drawPath(path,color,style=Stroke(1.8f*u,cap=StrokeCap.Round))
        if(active){val z=Path().apply{moveTo(16f*u,3f*u);lineTo(20f*u,3f*u);lineTo(16f*u,7f*u);lineTo(20f*u,7f*u)};drawPath(z,color,style=Stroke(1.5f*u,cap=StrokeCap.Round))}
    }
}
@Composable internal fun MiniSleepButton(ui:MiniSleepUi,light:Boolean,width:Float,reduced:Boolean,action:()->Unit,modifier:Modifier=Modifier) {
    val snapshot=ui.snapshot
    val now=sleepDisplayNow(snapshot,LocalChromeRendering.current,false)
    val colors=remember(light){SleepMenuColors(light)}
    val color=if(snapshot.active)colors.accent else colors.ink.copy(alpha=.85f)
    val label=if(snapshot.active)"定时关闭：${if(snapshot.waiting)"本曲结束"else snapshot.clockAt(now)}，点击修改或取消"else"定时关闭"
    ChromeButton(label,modifier=modifier,size=width.dp,reduced=reduced,onClick=action) {
        Column(Modifier.background(if(snapshot.active)colors.accent.copy(alpha=.10f)else Color.Transparent,RoundedCornerShape(14.dp))
            .padding(horizontal=4.dp,vertical=2.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center) {
            SleepMoon(color,Modifier.size(if(snapshot.active&&!snapshot.waiting)17.dp else 21.dp),snapshot.active)
            if(snapshot.active&&!snapshot.waiting)Text(snapshot.minutesAt(now),color=color,fontSize=8.sp,lineHeight=10.sp,maxLines=1)
        }
    }
}

/** One in-scene floating surface. The same measured bottom edge anchors both views. */
@Composable internal fun MiniSleepMenu(ui:MiniSleepUi,anchor:Rect,safeTop:Float,light:Boolean,backdrop:Backdrop,
    preferredMinutes:Int=30,reduced:Boolean=false,onDismiss:()->Unit) {
    val colors=remember(light){SleepMenuColors(light)}
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
    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().semantics{contentDescription="关闭定时菜单"}.clickable(
            interactionSource=remember{MutableInteractionSource()},indication=null,onClick=onDismiss))
        val scale=LocalDensity.current.density
        Layout(modifier=Modifier.fillMaxSize(),content={
            Column(Modifier.animateContentSize(tween(if(reduced)0 else 180)).chromeGlass(backdrop,light,28.dp)
                .background(colors.tint,RoundedCornerShape(28.dp))
                .clip(RoundedCornerShape(28.dp)).pointerInput(Unit){detectTapGestures{}}
                .semantics{paneTitle="定时关闭"}.verticalScroll(scroll).padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth().heightIn(min=40.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    if(advanced)ChromeButton("返回快捷定时",size=32.dp,onClick={advanced=false;ui.clearError()}){PageIcon("chevron-left",colors.ink,Modifier.size(20.dp))}
                    else SleepMoon(colors.ink,Modifier.size(21.dp))
                    Text(if(advanced)"定时关闭 · 更多选项"else"定时关闭",color=colors.ink,fontSize=15.sp,fontWeight=FontWeight.SemiBold,modifier=Modifier.weight(1f))
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
                if(ui.error.isNotBlank())Text(ui.error,color=if(light)Color(0xFFA13F35)else Color(0xFFFFB6A6),fontSize=12.sp,lineHeight=18.sp,modifier=Modifier.semantics{contentDescription="定时设置失败：${ui.error}"})
            }
            Canvas(Modifier.size(16.dp,10.dp)) {
                val path=Path().apply{moveTo(0f,0f);lineTo(size.width/2,size.height);lineTo(size.width,0f)}
                drawPath(path,colors.arrowTint);drawPath(path,colors.line,style=Stroke(.8.dp.toPx()))
            }
        }){measurables,constraints->
            val top=(safeTop*scale).toInt()
            val placement=sleepMenuPlacement(constraints.maxWidth,constraints.maxHeight,top,anchor.center.x.toInt(),anchor.top.toInt(),advanced,scale=scale)
            val card=measurables[0].measure(Constraints(minWidth=placement.width,maxWidth=placement.width,maxHeight=placement.maxHeight))
            val arrow=measurables[1].measure(Constraints.fixed((16*scale).toInt(),(10*scale).toInt()))
            val placed=sleepMenuPlacement(constraints.maxWidth,constraints.maxHeight,top,anchor.center.x.toInt(),anchor.top.toInt(),advanced,card.height,scale)
            layout(constraints.maxWidth,constraints.maxHeight){card.place(placed.left,placed.top);arrow.place(placed.arrowLeft,placed.arrowTop)}
        }
    }
}
@Composable private fun SleepMenuAction(label:String,colors:SleepMenuColors,modifier:Modifier=Modifier,selected:Boolean=false,primary:Boolean=false,
    enabled:Boolean=true,small:Boolean=false,onClick:()->Unit) {
    Box(modifier.heightIn(min=44.dp).background(if(primary||selected)colors.selected else colors.control,RoundedCornerShape(999.dp))
        .border(if(selected||primary)1.dp else .7.dp,if(selected||primary)colors.accent.copy(alpha=.4f)else colors.line.copy(alpha=.14f),RoundedCornerShape(999.dp))
        .clickable(enabled=enabled,role=Role.Button,onClick=onClick).padding(horizontal=if(small)10.dp else 6.dp,vertical=8.dp),contentAlignment=Alignment.Center) {
        Text(label,color=(if(primary||selected)colors.accent else colors.ink).copy(alpha=if(enabled)1f else .40f),
            fontSize=if(small)11.sp else 13.sp,lineHeight=18.sp,fontWeight=if(selected||primary)FontWeight.SemiBold else FontWeight.Medium)
    }
}
@Composable private fun SleepDurationPart(unit:String,value:Int,min:Int,max:Int,colors:SleepMenuColors,modifier:Modifier,onValue:(Int)->Unit) {
    Row(modifier.heightIn(min=44.dp).background(colors.control,RoundedCornerShape(999.dp)).padding(horizontal=3.dp),
        verticalAlignment=Alignment.CenterVertically) {
        Box(Modifier.width(32.dp).height(44.dp).semantics{contentDescription="减少$unit"}.clickable(enabled=value>min,role=Role.Button){onValue(value-1)},contentAlignment=Alignment.Center){Text("−",color=colors.muted.copy(alpha=if(value>min)1f else .35f),fontSize=18.sp)}
        Text("%02d $unit".format(value),color=colors.ink,fontSize=12.sp,maxLines=1,modifier=Modifier.weight(1f),textAlign=androidx.compose.ui.text.style.TextAlign.Center)
        Box(Modifier.width(32.dp).height(44.dp).semantics{contentDescription="增加$unit"}.clickable(enabled=value<max,role=Role.Button){onValue(value+1)},contentAlignment=Alignment.Center){Text("+",color=colors.muted.copy(alpha=if(value<max)1f else .35f),fontSize=18.sp)}
    }
}
