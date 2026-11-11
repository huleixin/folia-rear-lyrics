package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeStageExit.kt
// Keep the actual stage mounted until its native collapse finishes. No screenshot,
// JS frame loop, or waiting for a replacement renderer to draw.
internal class NativeStageExit {
    var active by mutableStateOf(false);private set
    var completed by mutableStateOf(false);private set
    var returning:NativePage?=null;private set
    var suppressReturnMotion=false
    var minimal=false;private set
    private val replies=mutableListOf<()->Unit>()
    fun begin(page:NativePage?,minimal:Boolean=false,reply:()->Unit){
        if(completed){reply();return};replies.add(reply)
        if(active)return
        returning=page;this.minimal=minimal;completed=false;active=true;suppressReturnMotion=true
    }
    fun finish(){completed=true;val callbacks=replies.toList();replies.clear();callbacks.forEach{it()}}
    fun clear(){if(replies.isNotEmpty())finish();active=false;completed=false;returning=null;minimal=false}
}
@Composable internal fun rememberStageExitProgress(exit:NativeStageExit,reduced:Boolean,reference:Boolean=false):State<Float>{
    val progress=remember{Animatable(0f)}
    LaunchedEffect(exit.active,reduced,reference){
        if(exit.active){progress.animateTo(1f,tween(if(reduced)0 else if(exit.minimal&&reference)SaltPlayerTimeline.ExitMs else if(exit.minimal)TingYuMotion.StageCollapseMinimalMs else TingYuMotion.StageCollapseClassicMs,easing=if(exit.minimal&&reference)androidx.compose.animation.core.LinearEasing else if(exit.minimal)TingYuMotion.Collapse else TingYuMotion.Emphasized));exit.finish()}
        else progress.snapTo(0f)
    }
    return progress.asState()
}
internal fun Modifier.stageExitTransform(exit:NativeStageExit,progress:State<Float>,visible:Boolean=true,slide:Boolean=false)=graphicsLayer{
    val p=if(exit.active)progress.value else 0f
    translationY=size.height*(if(slide)1f else .14f)*p
    scaleX=if(slide)1f else 1f-.035f*p;scaleY=scaleX;alpha=if(visible){if(slide)1f else 1f-p}else 0f
}
