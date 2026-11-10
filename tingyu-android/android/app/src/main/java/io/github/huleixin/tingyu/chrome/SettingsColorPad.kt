package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsColorPad.kt
// The original two-dimensional color plane and hue strip, with native touch handling.
@Composable
internal fun SettingsColorPad(node:TySettingNode,modifier:Modifier,action:PageAction){
    fun parse(value:String)=FloatArray(3).also{try{android.graphics.Color.colorToHSV(android.graphics.Color.parseColor(value),it)}catch(_:Exception){it[2]=1f}}
    var hsv by remember(node.id){mutableStateOf(parse(node.value))}
    var dragging by remember{mutableStateOf(false)}
    val latest by rememberUpdatedState(action)
    var lastAt by remember{mutableLongStateOf(0L)}
    var lastColor by remember{mutableStateOf("")}
    LaunchedEffect(node.value){if(!dragging)hsv=parse(node.value)}
    fun emit(force:Boolean){
        val now=android.os.SystemClock.uptimeMillis()
        val color=String.format("#%06x",android.graphics.Color.HSVToColor(hsv) and 0xffffff)
        if(color!=lastColor&&(force||now-lastAt>=48)){lastAt=now;lastColor=color;latest(TySettingEvent.action(node.action),color,0.0)}
    }
    fun point(x:Float,y:Float,w:Int,h:Int,hue:Boolean,force:Boolean){
        val next=hsv.copyOf()
        if(hue){next[0]=(x/w.coerceAtLeast(1)).coerceIn(0f,1f)*360
            if(node.detail=="visible-hue"&&(next[1]<.08f||next[2]<.05f)){next[1]=.65f;next[2]=.75f}
        }else{next[1]=(x/w.coerceAtLeast(1)).coerceIn(0f,1f);next[2]=1-(y/h.coerceAtLeast(1)).coerceIn(0f,1f)}
        hsv=next;emit(force)
    }
    fun Modifier.touch(hue:Boolean)=pointerInput(node.id,hue,node.disabled){
        if(node.disabled)return@pointerInput
        detectTapGestures{point(it.x,it.y,size.width,size.height,hue,true)}
    }.pointerInput(node.id,hue,node.disabled){
        if(node.disabled)return@pointerInput
        detectDragGestures(onDragStart={dragging=true;point(it.x,it.y,size.width,size.height,hue,false)},onDragEnd={dragging=false;emit(true)},onDragCancel={dragging=false;emit(true)}){change,_->change.consume();point(change.position.x,change.position.y,size.width,size.height,hue,false)}
    }
    Column(modifier.fillMaxWidth().height(236.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
        Canvas(Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(10.dp)).touch(false)){
            val color=Color.hsv(hsv[0],1f,1f)
            drawRect(Brush.horizontalGradient(listOf(Color.White,color)))
            drawRect(Brush.verticalGradient(listOf(Color.Transparent,Color.Black)))
            val p=Offset(size.width*hsv[1],size.height*(1-hsv[2]))
            drawCircle(Color.White,9.dp.toPx(),p,style=Stroke(3.dp.toPx()))
        }
        Canvas(Modifier.fillMaxWidth().height(24.dp).clip(RoundedCornerShape(8.dp)).touch(true)){
            drawRect(Brush.horizontalGradient((0..6).map{Color.hsv(it*60f,1f,1f)}))
            drawCircle(Color.White,9.dp.toPx(),Offset(size.width*hsv[0]/360,size.height/2),style=Stroke(3.dp.toPx()))
        }
    }
}
