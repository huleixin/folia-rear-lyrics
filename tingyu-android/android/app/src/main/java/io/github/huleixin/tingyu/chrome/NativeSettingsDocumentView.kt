package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.clickable
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
import androidx.compose.ui.input.pointer.PointerEventPass
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
    // 语义化设置页由 NativePageView 直接路由到 SettingsFlowPage（那里才有页面级信息：
    // 底色、毛玻璃顶栏、安全区）。能走到这里的 document 一定没有 flow；
    // 万一有（旧包/异常包），当前页仍按测量显示列表绘制，不会白屏。
    val scale=LocalDensity.current.density
    val scrolls=document.areas.associate{area->area.id to key(area.id){remember{mutableFloatStateOf(area.offset.toFloat())}}}
    val drawingCache=remember{mutableMapOf<SettingPaint,SettingsDrawing>()}
    val drawings=remember(document.paints){
        android.os.Trace.beginSection("settings-drawings")
        try {
            val next=document.paints.map{drawingCache[it]?:SettingsDrawing(it)}
            drawingCache.clear();next.forEach{drawingCache[it.node]=it};next
        } finally {android.os.Trace.endSection()}
    }
    val images=document.paints.filter{it.kind=="image"}.associate{it.image to rememberAsyncImagePainter(pageImage(it.image))}
    val needsIsolation=remember(document.paints){document.paints.any{it.kind=="live"}}
    val clearPaint=remember{android.graphics.Paint().apply{xfermode=android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.CLEAR)}}
    val latestAction by rememberUpdatedState(action)
    val traceIdentity=LocalSettingsTraceIdentity.current
    fun offset(id:String)=if(id.isEmpty())0f else scrolls[id]?.floatValue?:0f
    fun hit(x:Float,y:Float):SettingControl?=document.controls.asReversed().firstOrNull{control->
        val area=document.areas.firstOrNull{it.id==control.area}
        (area==null||area.rect.contains(x,y))&&control.rect.contains(x,y+offset(control.area))
    }
    // Observe the initial pass for diagnostics only. Child clickables and their scroll parent
    // arbitrate gestures; a second root tap recognizer must never dispatch the same touch.
    Box(modifier.clipToBounds().pointerInput(document,traceIdentity){
        awaitPointerEventScope{while(true){val event=awaitPointerEvent(PointerEventPass.Initial)
            event.changes.firstOrNull{it.pressed&&!it.previousPressed}?.let{change->
                val x=change.position.x/scale;val y=change.position.y/scale
                val control=hit(x,y)
                settingsTrace("touch-hit","x" to x,"y" to y,"control" to control?.id,"disabled" to control?.disabled,
                    "route" to traceIdentity.route,"session" to traceIdentity.session,"key" to traceIdentity.key,"navigation" to traceIdentity.navigation)
            }
        }}
    }){
        Canvas(Modifier.fillMaxSize().then(if(needsIsolation)Modifier.graphicsLayer{compositingStrategy=CompositingStrategy.Offscreen}else Modifier)){
            drawings.forEach{drawing->val p=drawing.node;val area=document.areas.firstOrNull{it.id==p.area};val dy=offset(p.area)
                if(area!=null&&(p.rect.y-dy+p.rect.h<area.rect.y||p.rect.y-dy>area.rect.y+area.rect.h))return@forEach
                drawIntoCanvas{composeCanvas->val canvas=composeCanvas.nativeCanvas;canvas.save();canvas.scale(scale,scale)
                    if(area!=null)canvas.clipRect(area.rect.x,area.rect.y,area.rect.x+area.rect.w,area.rect.y+area.rect.h)
                    canvas.translate(0f,-dy)
                    p.clip?.let{canvas.clipRect(it.x,it.y,it.x+it.w,it.y+it.h)}
                    when(p.kind){
                        "live"->{if(traceIdentity.liveEnabled)canvas.drawRoundRect(p.rect.x,p.rect.y,p.rect.x+p.rect.w,p.rect.y+p.rect.h,p.radius,p.radius,clearPaint)}
                        "image"->{canvas.translate(p.rect.x,p.rect.y);val clip=android.graphics.Path();clip.addRoundRect(0f,0f,p.rect.w,p.rect.h,p.radius,p.radius,android.graphics.Path.Direction.CW);canvas.clipPath(clip)
                            images[p.image]?.let{painter->with(painter){draw(Size(p.rect.w,p.rect.h),p.opacity)}}}
                        else->drawing.draw(canvas)
                    };canvas.restore()
                }
            }
        }
        @Composable fun Controls(area:SettingArea?) {
            val areaId=area?.id?:""
            // A live island has one native tap target; its DOM children are never painted twice.
            document.paints.filter{traceIdentity.liveEnabled&&it.kind=="live"&&it.area==areaId}.forEach{paint->
                val x=paint.rect.x;val y=paint.rect.y-offset(areaId)
                Box(Modifier.offset((x-(area?.rect?.x?:0f)).dp,(y-(area?.rect?.y?:0f)).dp)
                    .size(paint.rect.w.dp,paint.rect.h.dp).pointerInput(paint.rect,y){detectTapGestures{point->
                        latestAction("liveTap","{\"x\":${x+point.x/scale},\"y\":${y+point.y/scale}}",0.0)
                    }})
            }
            document.controls.filter{it.area==areaId}.forEach{control->key(control.id){
                val y=control.rect.y-offset(areaId)
                if(area==null||(y+control.rect.h>area.rect.y&&y<area.rect.y+area.rect.h)){
                    val placement=Modifier.offset((control.rect.x-(area?.rect?.x?:0f)).dp,(y-(area?.rect?.y?:0f)).dp).size(control.rect.w.dp,control.rect.h.dp)
                    if(control.kind=="click")Box(placement.chromeClickable(enabled=!control.disabled,role=Role.Button,corner=6.dp){latestAction(control.id,"",0.0)}.semantics{
                        if(control.label.isNotBlank())contentDescription=control.label
                    }){if(control.inputType in setOf("checkbox","radio","color"))NativeSettingsControl(control,Modifier.fillMaxSize(),latestAction)}
                    else NativeSettingsControl(control,placement.semantics{if(control.label.isNotBlank())contentDescription=control.label},latestAction)
                }
            }}
        }
        document.areas.forEach{area->key(area.id){
            val scroll=scrolls.getValue(area.id)
            LaunchedEffect(area.contentHeight,area.rect.h){scroll.floatValue=scroll.floatValue.coerceIn(0f,(area.contentHeight-area.rect.h).coerceAtLeast(0f))}
            val latestArea by rememberUpdatedState(area)
            val state=rememberScrollableState{delta->val old=scroll.floatValue;scroll.floatValue=(old-delta/scale).coerceIn(0f,(latestArea.contentHeight-latestArea.rect.h).coerceAtLeast(0f));(old-scroll.floatValue)*scale}
            // Controls are descendants of the scrollable, so a drag cancels a button's press.
            Box(Modifier.offset(area.rect.x.dp,area.rect.y.dp).size(area.rect.w.dp,area.rect.h.dp).clipToBounds().scrollable(state,Orientation.Vertical).semantics{
                verticalScrollAxisRange=ScrollAxisRange({scroll.floatValue},{(latestArea.contentHeight-latestArea.rect.h).coerceAtLeast(0f)})
                scrollBy{_,y->scroll.floatValue=(scroll.floatValue+y/scale).coerceIn(0f,(latestArea.contentHeight-latestArea.rect.h).coerceAtLeast(0f));true}
            }){Controls(area)}
            LaunchedEffect(area.id){snapshotFlow{scroll.floatValue}.distinctUntilChanged().debounce(120).collect{latestAction("scroll:${area.id}","",it.toDouble())}}
            if(document.paints.any{it.kind=="live"&&it.area==area.id})LaunchedEffect(area.id,"live"){
                snapshotFlow{scroll.floatValue}.distinctUntilChanged().collect{latestAction("scroll:${area.id}","live",it.toDouble())}
            }
        }}
        Controls(null)
    }
}
