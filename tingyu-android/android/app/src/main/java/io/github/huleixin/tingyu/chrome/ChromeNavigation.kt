package io.github.huleixin.tingyu.chrome

import android.graphics.drawable.BitmapDrawable
import android.os.Build
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
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
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.highlight.Highlight
import com.kyant.backdrop.highlight.HighlightStyle
import com.kyant.backdrop.shadow.InnerShadow
import com.kyant.backdrop.shadow.Shadow
import androidx.compose.ui.unit.DpOffset
import io.github.huleixin.tingyu.glass.GlassNavIcons
import kotlin.math.roundToInt

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeNavigation.kt
//
// 底栏（1.3.189 玻璃专项）。结构对齐 Kyant0 1.0.6 的 LiquidBottomTabs：
//
//   ① 底栏本体：一块完整的液态玻璃（采样页面层 backdrop）
//   ② 记录层：把①自身的玻璃再录一份到 tabsBackdrop（alpha=0，看不见，只作采样源）
//   ③ 选中项：只采样②，静止时**不做第二次模糊**，靠一层中性薄纱 + 光学高光/阴影分层
//
// 旧实现里选中项是「父级玻璃 + 子级玻璃 + accent 14%」三明治：同一张背景被模糊两次、
// 两层表面 alpha 叠在一起，所以发灰、浑浊。②③ 的意义就在于把「第二层玻璃」变成
// 「同一块玻璃上的另一层薄纱」——两层关系清晰，但不重复模糊。
@Composable fun ChromeNavigation(s: ChromeSurface, backdrop: Backdrop, modifier: Modifier, action: (String,Double)->Unit) {
    val ink=chromeColor(s.ink);val accent=chromeColor(s.accent)
    val spec=ChromeGlassPresets.active()
    val radius=if(s.vertical)28.dp else 32.dp
    // ② 的采样源：底栏自身玻璃。remember 在组合层，条目的重组不会重建它。
    val tabsBackdrop=rememberLayerBackdrop()
    var drag by remember { mutableStateOf<Float?>(null) }
    var pressed by remember { mutableStateOf(false) }
    // 按压进度：折射带/高光/阴影/缩放都由它驱动；damping 0.55 留一点回弹。
    val press by animateFloatAsState(
        targetValue = if(pressed&&!s.disabled)1f else 0f,
        animationSpec = spring(dampingRatio=.55f,stiffness=900f),
        label="nav-press",
    )
    val selection by animateFloatAsState(s.selected.coerceAtLeast(0).toFloat(),animationSpec=if(s.reducedMotion)snap()else spring(dampingRatio=NativeMotionPolicy.Damping,stiffness=NativeMotionPolicy.Stiffness),label="selected-tab")
    BoxWithConstraints(modifier.chromeGlass(backdrop,s.light,radius,spec,ChromeGlassPresets.NavFill).padding(4.dp)) {
        val extent=with(LocalDensity.current){(if(s.vertical)maxHeight else maxWidth).toPx()}/4
        val position=drag ?: selection
        val touch=Modifier.pointerInput(s.vertical,extent,s.selected) {
            fun end(){drag?.let{action("navigate",it.roundToInt().coerceIn(0,3).toDouble())};drag=null;action("interactionEnd",0.0)}
            if(s.vertical) detectVerticalDragGestures(onDragStart={drag=s.selected.coerceAtLeast(0).toFloat();action("interactionStart",0.0)},onDragEnd={end()},onDragCancel={drag=null;action("interactionEnd",0.0)}) { change,amount->change.consume();drag=((drag?:selection)+amount/extent).coerceIn(0f,3f) }
            else detectHorizontalDragGestures(onDragStart={drag=s.selected.coerceAtLeast(0).toFloat();action("interactionStart",0.0)},onDragEnd={end()},onDragCancel={drag=null;action("interactionEnd",0.0)}) { change,amount->change.consume();drag=((drag?:selection)+amount/extent).coerceIn(0f,3f) }
        }
        // 只观测、不消费：任何一次按下都推进按压进度（点击与滑动共用同一套反馈）。
        val pressWatch=Modifier.pointerInput(s.disabled) {
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed=false,pass=PointerEventPass.Initial)
                pressed=true
                try { do { val e=awaitPointerEvent(PointerEventPass.Initial) } while(e.changes.any{it.pressed}) }
                finally { pressed=false }
            }
        }
        // ① 记录层：与底栏完全同参的一块玻璃，alpha=0 只用来喂 ③（不画高光/投影，省两个图层）。
        Box(Modifier.fillMaxSize().alpha(0f).layerBackdrop(tabsBackdrop)
            .chromeGlass(backdrop,s.light,radius,spec,ChromeGlassPresets.NavFill,decorations=false))
        val bounds=Modifier.then(if(s.vertical) Modifier.fillMaxWidth().height(maxHeight/4) else Modifier.fillMaxHeight().width(maxWidth/4))
        val pillShape=RoundedCornerShape(24.dp)
        val pillScrim=if(s.light)Color.Black.copy(alpha=.10f) else Color.White.copy(alpha=.10f)
        val pill=bounds
            .graphicsLayer {
                if(s.vertical)translationY=position*extent else translationX=position*extent
                val grow=1f+.055f*press
                scaleX=grow;scaleY=grow
            }
            .then(
                if(Build.VERSION.SDK_INT>=31) Modifier.drawBackdrop(
                    backdrop=tabsBackdrop,
                    shape={pillShape},
                    effects={
                        // 静止时 press=0：完全不挂 RenderEffect，只画一层薄纱（不重复模糊）。
                        if(Build.VERSION.SDK_INT>=33&&press>.02f) {
                            val h=10.dp.toPx()*press
                            val a=14.dp.toPx()*press
                            padding=a+4.dp.toPx()
                            lens(h,a,chromaticAberration=true)
                        }
                    },
                    highlight={Highlight(.6.dp,.3.dp,.28f+.5f*press,HighlightStyle.Default)},
                    shadow={Shadow(radius=12.dp,offset=DpOffset(0.dp,2.dp),color=Color.Black.copy(alpha=.10f),alpha=.28f+.45f*press)},
                    innerShadow={InnerShadow(radius=8.dp,alpha=.8f*press)},
                    onDrawSurface={
                        drawRect(pillScrim)
                        drawRect(accent.copy(alpha=if(s.light).10f else .14f))
                    },
                ) else Modifier.background(pillScrim,pillShape)
            )
        if(s.selected>=0 || drag!=null) Box(pill)
        val items=@Composable {
            repeat(4){index->
                val active=(drag?.roundToInt()?:s.selected)==index
                val context=LocalContext.current;val px=with(LocalDensity.current){23.dp.roundToPx()}
                val names=listOf("recommend","library","search","settings")
                val bitmap=remember(index,active,s.light,px){(GlassNavIcons.load(context,names[index],active,s.light,px) as BitmapDrawable).bitmap.asImageBitmap()}
                Column(Modifier.then(if(s.vertical)Modifier.fillMaxWidth().height(maxHeight/4) else Modifier.width(maxWidth/4).fillMaxHeight())
                    .semantics {selected=active}.clickable(enabled=!s.disabled,role=Role.Tab){action("navigate",index.toDouble())},horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
                    Image(bitmap,contentDescription=null,modifier=Modifier.size(23.dp),colorFilter=null);Spacer(Modifier.height(2.dp))
                    Text(s.label("nav$index",listOf("推荐","资料库","搜索","设置")[index]),color=if(active)accent else if(s.light)LightInterfaceColors.Muted else ink.copy(alpha=.82f),fontSize=10.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                }
            }
        }
        if(s.vertical) Column(Modifier.fillMaxSize().then(touch).then(pressWatch)){items()} else Row(Modifier.fillMaxSize().then(touch).then(pressWatch)){items()}
    }
}
