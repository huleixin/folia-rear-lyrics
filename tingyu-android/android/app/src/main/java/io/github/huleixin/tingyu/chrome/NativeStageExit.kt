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
    private val replies=mutableListOf<()->Unit>()
    fun begin(page:NativePage?,reply:()->Unit){
        if(completed){reply();return};replies.add(reply)
        if(active)return
        returning=page;completed=false;active=true;suppressReturnMotion=true
    }
    fun finish(){completed=true;val callbacks=replies.toList();replies.clear();callbacks.forEach{it()}}
    fun clear(){if(replies.isNotEmpty())finish();active=false;completed=false;returning=null}
}
@Composable internal fun rememberStageExitProgress(exit:NativeStageExit,reduced:Boolean):State<Float>{
    val progress=remember{Animatable(0f)}
    LaunchedEffect(exit.active){
        if(exit.active){progress.snapTo(0f);progress.animateTo(1f,tween(if(reduced)0 else 280,easing=CubicBezierEasing(.16f,1f,.3f,1f)));exit.finish()}
        else progress.snapTo(0f)
    }
    return progress.asState()
}
internal fun Modifier.stageExitTransform(exit:NativeStageExit,progress:State<Float>)=graphicsLayer{
    val p=if(exit.active)progress.value else 0f
    translationY=size.height*.14f*p;scaleX=1f-.035f*p;scaleY=scaleX;alpha=1f-p
}
