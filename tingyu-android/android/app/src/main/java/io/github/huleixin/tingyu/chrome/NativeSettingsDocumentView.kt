package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.gestures.rememberScrollableState
import androidx.compose.foundation.gestures.scrollable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.*
import coil.compose.rememberAsyncImagePainter
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.FlowPreview

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsDocumentView.kt
// One retained native display list. Scroll invalidates Canvas drawing, not JS/React layouts.
@OptIn(FlowPreview::class)
@Composable internal fun NativeSettingsDocumentView(document:NativeSettingsDocument,modifier:Modifier,action:PageAction){
    val scale=LocalDensity.current.density
    val scrolls=document.areas.associate{area->area.id to key(area.id){remember{mutableFloatStateOf(area.offset.toFloat())}}}
    val drawings=remember(document.paints){document.paints.map{SettingsDrawing(it)}}
    val images=document.paints.filter{it.kind=="image"}.associate{it.image to rememberAsyncImagePainter(pageImage(it.image))}
    val needsIsolation=remember(document.paints){document.paints.any{it.kind=="live"}}
    val clearPaint=remember{android.graphics.Paint().apply{xfermode=android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.CLEAR)}}
    val latestAction by rememberUpdatedState(action)
    fun offset(id:String)=if(id.isEmpty())0f else scrolls[id]?.floatValue?:0f
    fun hit(x:Float,y:Float):SettingControl?=document.controls.asReversed().firstOrNull{control->
        val area=document.areas.firstOrNull{it.id==control.area}
        (area==null||area.rect.contains(x,y))&&control.rect.contains(x,y+offset(control.area))
    }
    Box(modifier.clipToBounds().pointerInput(document.controls,document.live){detectTapGestures{point->
        val x=point.x/scale;val y=point.y/scale;val control=hit(x,y)
        if(control!=null&&!control.disabled&&control.kind=="click")latestAction(control.id,"",0.0)
        else if(document.live.any{it.contains(x,y)})latestAction("liveTap","{\"x\":$x,\"y\":$y}",0.0)
    }}){
        Canvas(Modifier.fillMaxSize().then(if(needsIsolation)Modifier.graphicsLayer{compositingStrategy=CompositingStrategy.Offscreen}else Modifier)){
            drawings.forEach{drawing->val p=drawing.node;val area=document.areas.firstOrNull{it.id==p.area};val dy=offset(p.area)
                if(area!=null&&(p.rect.y-dy+p.rect.h<area.rect.y||p.rect.y-dy>area.rect.y+area.rect.h))return@forEach
                drawIntoCanvas{composeCanvas->val canvas=composeCanvas.nativeCanvas;canvas.save();canvas.scale(scale,scale)
                    if(area!=null)canvas.clipRect(area.rect.x,area.rect.y,area.rect.x+area.rect.w,area.rect.y+area.rect.h)
                    canvas.translate(0f,-dy)
                    when(p.kind){
                        "live"->{canvas.drawRoundRect(p.rect.x,p.rect.y,p.rect.x+p.rect.w,p.rect.y+p.rect.h,p.radius,p.radius,clearPaint)}
                        "image"->{canvas.translate(p.rect.x,p.rect.y);val clip=android.graphics.Path();clip.addRoundRect(0f,0f,p.rect.w,p.rect.h,p.radius,p.radius,android.graphics.Path.Direction.CW);canvas.clipPath(clip)
                            images[p.image]?.let{painter->with(painter){draw(Size(p.rect.w,p.rect.h),p.opacity)}}}
                        else->drawing.draw(canvas)
                    };canvas.restore()
                }
            }
        }
        document.areas.forEach{area->key(area.id){
            val scroll=scrolls.getValue(area.id)
            LaunchedEffect(area.contentHeight,area.rect.h){scroll.floatValue=scroll.floatValue.coerceIn(0f,(area.contentHeight-area.rect.h).coerceAtLeast(0f))}
            val latestArea by rememberUpdatedState(area)
            val state=rememberScrollableState{delta->val old=scroll.floatValue;scroll.floatValue=(old-delta/scale).coerceIn(0f,(latestArea.contentHeight-latestArea.rect.h).coerceAtLeast(0f));(old-scroll.floatValue)*scale}
            Box(Modifier.offset(area.rect.x.dp,area.rect.y.dp).size(area.rect.w.dp,area.rect.h.dp).clipToBounds().scrollable(state,Orientation.Vertical).semantics{
                verticalScrollAxisRange=ScrollAxisRange({scroll.floatValue},{(latestArea.contentHeight-latestArea.rect.h).coerceAtLeast(0f)})
                scrollBy{_,y->scroll.floatValue=(scroll.floatValue+y/scale).coerceIn(0f,(latestArea.contentHeight-latestArea.rect.h).coerceAtLeast(0f));true}
            })
            LaunchedEffect(area.id){snapshotFlow{scroll.floatValue}.distinctUntilChanged().debounce(120).collect{latestAction("scroll:${area.id}","",it.toDouble())}}
            if(document.paints.any{it.kind=="live"&&it.area==area.id})LaunchedEffect(area.id,"live"){
                snapshotFlow{scroll.floatValue}.distinctUntilChanged().debounce(16).collect{latestAction("scroll:${area.id}","live",it.toDouble())}
            }
        }}
        document.controls.forEach{control->key(control.id){
            val area=document.areas.firstOrNull{it.id==control.area};val y=control.rect.y-offset(control.area)
            if(area==null||(y+control.rect.h>area.rect.y&&y<area.rect.y+area.rect.h)){
                val frame=if(area==null)Modifier.fillMaxSize()else Modifier.offset(area.rect.x.dp,area.rect.y.dp).size(area.rect.w.dp,area.rect.h.dp).clipToBounds()
                Box(frame){
                    val placement=Modifier.offset((control.rect.x-(area?.rect?.x?:0f)).dp,(y-(area?.rect?.y?:0f)).dp).size(control.rect.w.dp,control.rect.h.dp)
                    if(control.kind=="click")Box(placement.semantics{
                        if(control.label.isNotBlank())contentDescription=control.label
                        role=Role.Button;if(control.disabled)disabled()else onClick{latestAction(control.id,"",0.0);true}
                    }){if(control.inputType in setOf("checkbox","radio","color"))NativeSettingsControl(control,Modifier.fillMaxSize(),latestAction)}
                    else NativeSettingsControl(control,placement.semantics{if(control.label.isNotBlank())contentDescription=control.label},latestAction)
                }
            }
        }}
    }
}
