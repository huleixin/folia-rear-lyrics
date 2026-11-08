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
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
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
    // 跟手镜面热点：归一化到整条底栏（0..1）。null = 没按压。
    var pressPoint by remember { mutableStateOf<Offset?>(null) }
    // 按压进度：折射带/高光/阴影/缩放都由它驱动；damping 0.55 留一点回弹。
    val press by animateFloatAsState(
        targetValue = if(pressed&&!s.disabled)1f else 0f,
        animationSpec = spring(dampingRatio=.55f,stiffness=900f),
        label="nav-press",
    )
    val selection by animateFloatAsState(s.selected.coerceAtLeast(0).toFloat(),animationSpec=if(s.reducedMotion)snap()else spring(dampingRatio=NativeMotionPolicy.Damping,stiffness=NativeMotionPolicy.Stiffness),label="selected-tab")
    BoxWithConstraints(modifier.chromeGlass(backdrop,s.light,radius,spec,ChromeGlassPresets.NavFill,pressPoint={pressPoint}).padding(4.dp)) {
        val extent=with(LocalDensity.current){(if(s.vertical)maxHeight else maxWidth).toPx()}/4
        val position=drag ?: selection
        val touch=Modifier.pointerInput(s.vertical,extent,s.selected) {
            fun end(){drag?.let{action("navigate",it.roundToInt().coerceIn(0,3).toDouble())};drag=null;action("interactionEnd",0.0)}
            if(s.vertical) detectVerticalDragGestures(onDragStart={drag=s.selected.coerceAtLeast(0).toFloat();action("interactionStart",0.0)},onDragEnd={end()},onDragCancel={drag=null;action("interactionEnd",0.0)}) { change,amount->change.consume();drag=((drag?:selection)+amount/extent).coerceIn(0f,3f) }
            else detectHorizontalDragGestures(onDragStart={drag=s.selected.coerceAtLeast(0).toFloat();action("interactionStart",0.0)},onDragEnd={end()},onDragCancel={drag=null;action("interactionEnd",0.0)}) { change,amount->change.consume();drag=((drag?:selection)+amount/extent).coerceIn(0f,3f) }
        }
        // 只观测、不消费：任何一次按下都推进按压进度（点击与滑动共用同一套反馈），
        // 同时记录归一化按压点喂给玻璃的镜面热点。
        val pressWatch=Modifier.pointerInput(s.disabled) {
            awaitEachGesture {
                val down=awaitFirstDown(requireUnconsumed=false,pass=PointerEventPass.Initial)
                pressed=true
                pressPoint=Offset(
                    (down.position.x/size.width.coerceAtLeast(1)).coerceIn(0f,1f),
                    (down.position.y/size.height.coerceAtLeast(1)).coerceIn(0f,1f),
                )
                try { do { val e=awaitPointerEvent(PointerEventPass.Initial) } while(e.changes.any{it.pressed}) }
                finally { pressed=false; pressPoint=null }
            }
        }
        // ① 记录层：与底栏完全同参的一块玻璃，alpha=0 只用来喂 ③（不画高光/投影，省两个图层）。
        Box(Modifier.fillMaxSize().alpha(0f).layerBackdrop(tabsBackdrop)
            .chromeGlass(backdrop,s.light,radius,spec,ChromeGlassPresets.NavFill,decorations=false))
        val bounds=Modifier.then(if(s.vertical) Modifier.fillMaxWidth().height(maxHeight/4) else Modifier.fillMaxHeight().width(maxWidth/4))
        val pillScrim=if(s.light)Color.Black.copy(alpha=.075f) else Color.White.copy(alpha=.075f)
        // 静止也保留折射（0.55 强度），否则胶囊只剩一层灰纱 —— 这正是上一版"灰色磨砂"的成因。
        val pillLens=.55f+.45f*press
        val pill=bounds
            .graphicsLayer {
                if(s.vertical)translationY=position*extent else translationX=position*extent
                val grow=1f+.055f*press
                scaleX=grow;scaleY=grow
            }
            .then(
                if(Build.VERSION.SDK_INT>=31) Modifier.drawBackdrop(
                    backdrop=tabsBackdrop,
                    // 按压时圆角收一点，配合缩放做出"液体被压"的形变。
                    shape={RoundedCornerShape(24.dp-3.dp*press)},
                    effects={
                        if(Build.VERSION.SDK_INT>=33) {
                            val h=9.dp.toPx()*pillLens
                            val a=12.dp.toPx()*pillLens
                            padding=a+4.dp.toPx()
                            lens(h,a,chromaticAberration=true)
                        }
                    },
                    highlight={Highlight(.7.dp,.35.dp,.22f+.62f*press,HighlightStyle.Default)},
                    shadow={Shadow(radius=12.dp,offset=DpOffset(0.dp,2.dp),color=Color.Black.copy(alpha=.10f),alpha=.22f+.5f*press)},
                    innerShadow={InnerShadow(radius=8.dp,alpha=.22f+.55f*press)},
                    onDrawSurface={
                        drawRect(pillScrim)
                        drawRect(accent.copy(alpha=if(s.light).085f else .12f))
                        // 胶囊自己的环境反射：顶部一道柔光，让它在静止时也是"玻璃"而不是"色块"。
                        drawRect(
                            brush=Brush.verticalGradient(
                                0f to Color.White.copy(alpha=.085f),
                                .40f to Color.White.copy(alpha=.025f),
                                1f to Color.Transparent,
                            ),
                            blendMode=BlendMode.Plus,
                        )
                        // 跟手热点：把底栏归一化点换算到胶囊自身坐标（4 段之一）。
                        pressPoint?.let{p->
                            val cx=((p.x*4f-position).coerceIn(-.2f,1.2f))*size.width
                            val center=Offset(cx,p.y*size.height)
                            val r=size.height*1.8f
                            drawCircle(
                                brush=Brush.radialGradient(
                                    0f to Color.White.copy(alpha=.12f),
                                    .5f to Color.White.copy(alpha=.04f),
                                    1f to Color.Transparent,
                                    center=center,radius=r,
                                ),
                                radius=r,center=center,blendMode=BlendMode.Plus,
                            )
                        }
                    },
                ) else Modifier.background(pillScrim,RoundedCornerShape(24.dp-3.dp*press))
            )
        if(s.selected>=0 || drag!=null) Box(pill)
        val items=@Composable {
            repeat(4){index->
                val active=(drag?.roundToInt()?:s.selected)==index
                val context=LocalContext.current;val px=with(LocalDensity.current){23.dp.roundToPx()}
                val names=listOf("recommend","library","search","settings")
                val bitmap=remember(index,active,s.light,px){(GlassNavIcons.load(context,names[index],active,s.light,px) as BitmapDrawable).bitmap.asImageBitmap()}
                // 按压反馈走 chromeTapPressed（轻微缩放），indication=null 关掉系统 ripple：
                // 这一格是「整格矩形、无裁剪」，默认 ripple 一长按就是一块方角灰底（灰矩形专项）。
                val pressSource=remember(index){MutableInteractionSource()}
                Column(Modifier.then(if(s.vertical)Modifier.fillMaxWidth().height(maxHeight/4) else Modifier.width(maxWidth/4).fillMaxHeight())
                    .chromeTapPressed(pressSource)
                    .semantics {selected=active}
                    .clickable(interactionSource=pressSource,indication=null,enabled=!s.disabled,role=Role.Tab){action("navigate",index.toDouble())},horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.Center){
                    Image(bitmap,contentDescription=null,modifier=Modifier.size(23.dp),colorFilter=null);Spacer(Modifier.height(2.dp))
                    Text(s.label("nav$index",listOf("推荐","资料库","搜索","设置")[index]),color=if(active)accent else if(s.light)LightInterfaceColors.Muted else ink.copy(alpha=.82f),fontSize=10.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                }
            }
        }
        if(s.vertical) Column(Modifier.fillMaxSize().then(touch).then(pressWatch)){items()} else Row(Modifier.fillMaxSize().then(touch).then(pressWatch)){items()}
    }
}
