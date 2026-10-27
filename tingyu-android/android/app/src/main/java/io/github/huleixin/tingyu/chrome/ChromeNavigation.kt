package io.github.huleixin.tingyu.chrome

import android.graphics.drawable.BitmapDrawable
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kyant.backdrop.Backdrop
import io.github.huleixin.tingyu.glass.GlassNavIcons
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeNavigation.kt
@Composable fun ChromeNavigation(s: ChromeSurface, backdrop: Backdrop, modifier: Modifier, action: (String,Double)->Unit) {
    val ink=chromeColor(s.ink);val accent=chromeColor(s.accent)
    var drag by remember { mutableStateOf<Float?>(null) }
    val selection by animateFloatAsState(s.selected.coerceAtLeast(0).toFloat(),animationSpec=if(s.reducedMotion)snap()else spring(),label="selected-tab")
    BoxWithConstraints(modifier.chromeGlass(backdrop,s.light,if(s.vertical)28.dp else 32.dp).padding(4.dp)) {
        val extent=with(LocalDensity.current){(if(s.vertical)maxHeight else maxWidth).toPx()}/4
        val position=drag ?: selection
        val touch=Modifier.pointerInput(s.vertical,extent,s.selected) {
            fun end(){drag?.let{action("navigate",it.roundToInt().coerceIn(0,3).toDouble())};drag=null;action("interactionEnd",0.0)}
            if(s.vertical) detectVerticalDragGestures(onDragStart={drag=s.selected.coerceAtLeast(0).toFloat();action("interactionStart",0.0)},onDragEnd={end()},onDragCancel={drag=null;action("interactionEnd",0.0)}) { change,amount->change.consume();drag=((drag?:selection)+amount/extent).coerceIn(0f,3f) }
            else detectHorizontalDragGestures(onDragStart={drag=s.selected.coerceAtLeast(0).toFloat();action("interactionStart",0.0)},onDragEnd={end()},onDragCancel={drag=null;action("interactionEnd",0.0)}) { change,amount->change.consume();drag=((drag?:selection)+amount/extent).coerceIn(0f,3f) }
        }
        val highlight=Modifier.then(if(s.vertical) Modifier.fillMaxWidth().height(maxHeight/4) else Modifier.fillMaxHeight().width(maxWidth/4))
            .graphicsLayer { if(s.vertical)translationY=position*extent else translationX=position*extent }
            .chromeGlass(backdrop,s.light,24.dp).background(accent.copy(alpha=.14f),RoundedCornerShape(24.dp))
        if(s.selected>=0 || drag!=null) Box(highlight)
        val items=@Composable {
            repeat(4){index->
                val active=(drag?.roundToInt()?:s.selected)==index
                val context=LocalContext.current;val px=with(LocalDensity.current){23.dp.roundToPx()}
                val names=listOf("recommend","library","search","settings")
                val bitmap=remember(index,active,px){(GlassNavIcons.load(context,names[index],active,px) as BitmapDrawable).bitmap.asImageBitmap()}
                Column(Modifier.then(if(s.vertical)Modifier.fillMaxWidth().height(maxHeight/4) else Modifier.width(maxWidth/4).fillMaxHeight())
                    .semantics {selected=active}.clickable(enabled=!s.disabled,role=Role.Tab){action("navigate",index.toDouble())},horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
                    Image(bitmap,contentDescription=null,modifier=Modifier.size(23.dp));Spacer(Modifier.height(2.dp))
                    Text(s.label("nav$index",listOf("推荐","资料库","搜索","设置")[index]),color=if(active)accent else ink.copy(alpha=.82f),fontSize=10.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                }
            }
        }
        if(s.vertical) Column(Modifier.fillMaxSize().then(touch)){items()} else Row(Modifier.fillMaxSize().then(touch)){items()}
    }
}
