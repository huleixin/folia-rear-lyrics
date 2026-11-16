package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.animation.animateBounds
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/DiscoverySettingsControls.kt
@Composable internal fun DiscoverySourceSetting(theme:TyPanelTheme,node:TySettingNode,action:PageAction) {
    var expanded by remember { mutableStateOf(false) }
    val enabled=node.value=="1"
    SettingsItem(theme,node.title,trailing={
        Row(verticalAlignment=Alignment.CenterVertically) {
            Box(Modifier.heightIn(min=48.dp).widthIn(min=56.dp).semantics{contentDescription=node.title+"推荐权重"}.chromeClickable(enabled=enabled){expanded=true},contentAlignment=Alignment.Center){
                Text(node.options.firstOrNull{it.value==node.detail}?.label?:node.detail,color=if(enabled)theme.accent else theme.muted,fontSize=13.sp)
            }
            Switch(checked=enabled,modifier=Modifier.semantics{contentDescription=node.title},onCheckedChange={action(TySettingEvent.set(node.action),if(it)"1" else "0",0.0)},
                colors=SwitchDefaults.colors(checkedTrackColor=theme.accent,checkedThumbColor=theme.surface))
        }
    })
    SettingsOptionPopup(theme,node.title,node.options,node.detail,visible=expanded,onClose={expanded=false}){
        expanded=false;action(TySettingEvent.action(node.action),"weight:"+it,0.0)
    }
}

/** Drag is local while held; one bridge event persists the final permutation on release. */
@OptIn(androidx.compose.animation.ExperimentalSharedTransitionApi::class)
@Composable internal fun DiscoveryModuleOrder(theme:TyPanelTheme,node:TySettingNode,action:PageAction) {
    var order by remember { mutableStateOf(node.options) }
    var dragging by remember { mutableStateOf<String?>(null) }
    val density=LocalDensity.current
    val heights=remember { mutableStateMapOf<String,Float>() }
    val fallbackHeight=with(density){58.dp.toPx()}
    val currentNode by rememberUpdatedState(node)
    val currentAction by rememberUpdatedState(action)
    val reduced=LocalLiquidReduced.current
    val hidden=remember(node.value){runCatching{val a=JSONArray(node.value);(0 until a.length()).map{a.getString(it)}.toSet()}.getOrDefault(emptySet())}
    LaunchedEffect(node.options){if(dragging==null)order=node.options}
    fun commit(){currentAction(TySettingEvent.action(currentNode.action),JSONArray(order.map{it.value}).toString(),0.0)}
    androidx.compose.ui.layout.LookaheadScope {
    Column {
        Text(node.hint,color=theme.muted,fontSize=12.sp,modifier=Modifier.padding(vertical=8.dp))
        order.forEach { option -> key(option.value) {
            val placement=if(reduced)Modifier else Modifier.animateBounds(this@LookaheadScope,
                boundsTransform=androidx.compose.animation.BoundsTransform { _,_->
                    androidx.compose.animation.core.spring(dampingRatio=TingYuMotion.PanelDamping,stiffness=TingYuMotion.PanelStiffness)
                })
            Row(placement.fillMaxWidth().heightIn(min=58.dp).onSizeChanged{heights[option.value]=it.height.toFloat()},verticalAlignment=Alignment.CenterVertically){
                Box(Modifier.size(48.dp).semantics {
                    contentDescription="拖动排序："+option.label
                    customActions=listOf(-1 to "上移",1 to "下移").map{(direction,label)->CustomAccessibilityAction(label){
                        val index=order.indexOfFirst{it.value==option.value};val target=index+direction
                        if(target in order.indices){order=order.toMutableList().apply{java.util.Collections.swap(this,index,target)};commit();true}else false
                    }}
                }.pointerInput(option.value){
                    var distance=0f
                    detectDragGesturesAfterLongPress(onDragStart={dragging=option.value;distance=0f},
                        onDragEnd={dragging=null;commit()},onDragCancel={dragging=null;order=currentNode.options}){change,amount->
                        change.consume();distance+=amount.y
                        val index=order.indexOfFirst{it.value==option.value}
                        val target=index+if(distance>0)1 else -1
                        val threshold=order.getOrNull(target)?.let{heights[it.value]}?:fallbackHeight
                        if(target in order.indices&&kotlin.math.abs(distance)>=threshold){
                            order=order.toMutableList().apply{java.util.Collections.swap(this,index,target)}
                            distance-=if(distance>0)threshold else -threshold
                        }
                    }
                },contentAlignment=Alignment.Center){PageIcon("grip-vertical",if(dragging==option.value)theme.accent else theme.muted,Modifier.size(20.dp))}
                Text(option.label,color=theme.text,fontSize=14.sp,modifier=Modifier.weight(1f))
                Switch(checked=option.value !in hidden,modifier=Modifier.semantics{contentDescription="显示"+option.label},onCheckedChange={action(TySettingEvent.action(node.action),"toggle:"+option.value,0.0)},
                    colors=SwitchDefaults.colors(checkedTrackColor=theme.accent,checkedThumbColor=theme.surface))
            }
        }}
    }
    }
}
