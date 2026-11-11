package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.compose.ui.unit.sp
import kotlin.math.round

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsControl.kt
// Native IME, selection and dragging keep immediate local feedback during bridge edits.
@Composable internal fun NativeSettingsControl(control:SettingControl,modifier:Modifier,action:PageAction){
    val latestAction by rememberUpdatedState(action)
    val ink=Color(settingColor(control.color,android.graphics.Color.WHITE))
    val accent=Color(settingColor(control.accent,settingColor(control.color,android.graphics.Color.WHITE)))
    when(control.kind){
        "pad"->{
            var point by remember{mutableStateOf(Offset.Zero)}
            Canvas(modifier.pointerInput(control.id,"tap"){detectTapGestures{position->val text="{\"x\":${(position.x/size.width).coerceIn(0f,1f)},\"y\":${(position.y/size.height).coerceIn(0f,1f)}}"
                latestAction(control.id,text,1.0);latestAction(control.id,text,2.0)
            }}.pointerInput(control.id){
                fun send(phase:Double){latestAction(control.id,"{\"x\":${(point.x/size.width).coerceIn(0f,1f)},\"y\":${(point.y/size.height).coerceIn(0f,1f)}}",phase)}
                detectDragGestures(onDragStart={point=it;send(1.0)},onDragEnd={send(2.0)},onDragCancel={send(2.0)}){change,_->change.consume();point=change.position;send(0.0)}
            }){}
        }
        "click"->{
            if(control.inputType in setOf("checkbox","radio"))Box(modifier.background(if(control.value=="1")accent else Color.Transparent,RoundedCornerShape(if(control.inputType=="radio")99.dp else 3.dp))
                .border(1.dp,if(control.value=="1")accent else ink.copy(alpha=.6f),RoundedCornerShape(if(control.inputType=="radio")99.dp else 3.dp)),contentAlignment=Alignment.Center){
                if(control.value=="1")PageIcon("check",LocalInterfacePalette.current.onAccent,Modifier.fillMaxSize().padding(2.dp))
            }
            if(control.inputType=="color")Box(modifier.padding(3.dp).background(Color(settingColor(control.value))))
        }
        "ruler"->{
            var draft by remember(control.id){mutableFloatStateOf(control.value.toFloatOrNull()?:0f)}
            var dragging by remember{mutableStateOf(false)}
            LaunchedEffect(control.value){if(!dragging)draft=control.value.toFloatOrNull()?:0f}
            val scale=androidx.compose.ui.platform.LocalDensity.current.density
            Canvas(modifier.pointerInput(control.id){detectHorizontalDragGestures(onDragStart={dragging=true},onDragEnd={dragging=false},onDragCancel={dragging=false}){change,amount->
                change.consume();draft=(draft-amount/scale/.6f).coerceIn(control.min,control.max);latestAction(control.id,round(draft).toString(),0.0)
            }}){}
        }
        "text"->{
            var draft by remember(control.id){mutableStateOf(TextFieldValue(control.value))}
            var focused by remember(control.id){mutableStateOf(false)}
            val focus=LocalFocusManager.current
            // Keep IME composition and intermediate numeric text ("0.", "-") local
            // until blur, even when an HTML number field temporarily sanitizes its value.
            LaunchedEffect(control.value,focused){if(!focused&&draft.text!=control.value)draft=TextFieldValue(control.value,TextRange(draft.selection.start.coerceAtMost(control.value.length)))}
            val pad=control.padding
            BasicTextField(draft,{value->draft=value;latestAction(control.id,value.text,0.0)},modifier.onFocusChanged{state->if(focused!=state.isFocused){focused=state.isFocused;latestAction(control.id,draft.text,if(focused)3.0 else 4.0)}}.padding(start=pad[0].dp,top=pad[1].dp,end=pad[2].dp,bottom=pad[3].dp),
                enabled=!control.disabled,singleLine=!control.multiline,textStyle=TextStyle(color=ink,fontSize=control.font.sp),cursorBrush=SolidColor(PageAccent),
                visualTransformation=if(control.inputType=="password")PasswordVisualTransformation()else VisualTransformation.None,
                keyboardOptions=KeyboardOptions(imeAction=if(control.multiline)ImeAction.Default else ImeAction.Done,keyboardType=when(control.inputType){"password"->KeyboardType.Password;"number"->KeyboardType.Decimal;"email"->KeyboardType.Email;"url"->KeyboardType.Uri;else->KeyboardType.Text}),
                keyboardActions=KeyboardActions(onDone={latestAction(control.id,draft.text,5.0);focus.clearFocus()}),
                decorationBox={field->Box{if(draft.text.isBlank())Text(control.placeholder,color=ink.copy(alpha=.5f),fontSize=control.font.sp);field()}})
        }
        "range"->{
            var value by remember(control.id){mutableFloatStateOf(control.value.toFloatOrNull()?:control.min)}
            var dragging by remember{mutableStateOf(false)}
            LaunchedEffect(control.value){if(!dragging)value=control.value.toFloatOrNull()?:control.min}
            val span=(control.max-control.min).coerceAtLeast(.0001f)
            Canvas(modifier.pointerInput(control.id,"tap",control.min,control.max,control.step){detectTapGestures{point->if(!control.disabled){
                val raw=control.min+(point.x/size.width).coerceIn(0f,1f)*span
                value=(if(control.step>0)control.min+round((raw-control.min)/control.step)*control.step else raw).coerceIn(control.min,control.max)
                latestAction(control.id,value.toString(),1.0);latestAction(control.id,value.toString(),2.0)
            }}}.pointerInput(control.id,control.min,control.max,control.step){
                fun update(x:Float){val raw=control.min+(x/size.width).coerceIn(0f,1f)*span
                    value=(if(control.step>0)control.min+round((raw-control.min)/control.step)*control.step else raw).coerceIn(control.min,control.max)}
                detectDragGestures(onDragStart={if(!control.disabled){dragging=true;update(it.x);latestAction(control.id,value.toString(),1.0)}},
                    onDragEnd={if(dragging){dragging=false;latestAction(control.id,value.toString(),2.0)}},onDragCancel={if(dragging){dragging=false;latestAction(control.id,value.toString(),2.0)}},
                    onDrag={change,_->if(!control.disabled){change.consume();update(change.position.x);latestAction(control.id,value.toString(),0.0)}})
            }){
                val progress=((value-control.min)/span).coerceIn(0f,1f);val y=size.height/2;val radius=(if(control.rect.h<=8)6 else 7).dp.toPx();val x=radius+(size.width-radius*2)*progress
                drawLine(ink.copy(alpha=.22f),Offset(radius,y),Offset(size.width-radius,y),3.dp.toPx())
                if(control.rangeFill)drawLine(accent,Offset(radius,y),Offset(x,y),3.dp.toPx());drawCircle(accent,radius,Offset(x,y))
            }
        }
        "select"->{
            // 语言等下拉菜单（68597 / 68606）：设置文档页没有自己的 MaterialTheme，
            // M3 菜单在这里是"浅底浅字 + 弹层卡顿"；改为自绘 Popup，颜色全部显式取自调色板。
            // 排版按 DOM 的内边距与控件框对齐：文字左对齐、箭头贴右、菜单挂在输入框正下方。
            var expanded by remember(control.id){mutableStateOf(false)}
            val light=LocalInterfacePalette.current.light
            val panel=LocalInterfacePalette.current.dropdownSurface
            val edge=LocalInterfacePalette.current.dropdownBorder
            val label=LocalInterfacePalette.current.dropdownInk
            val density=LocalDensity.current
            val current=control.options.firstOrNull{it.first==control.value}?.second?:control.value
            val padStart=control.padding.getOrElse(0){12f}
            val padEnd=control.padding.getOrElse(2){12f}
            Box(modifier){
                Row(Modifier.fillMaxSize()
                    .chromeClickable(enabled=!control.disabled,corner=10.dp){expanded=true}
                    .padding(start=padStart.dp,end=padEnd.dp),
                    verticalAlignment=Alignment.CenterVertically){
                    Text(current,color=ink,fontSize=control.font.sp,maxLines=1,
                        overflow=androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        modifier=Modifier.weight(1f))
                    Box(Modifier.padding(start=8.dp).size(16.dp)){PageIcon("chevron-down",ink.copy(alpha=.55f),Modifier.fillMaxSize())}
                }
                LiquidPopup(visible=expanded,
                    onDismissRequest={expanded=false},
                    // 贴着输入框下沿展开，宽度与控件框一致 —— 不再飘到分组标题上。
                    offset=IntOffset(0,with(density){(control.rect.h+4f).dp.roundToPx()}),
                ){
                    Column(Modifier.width(with(density){control.rect.w.dp})
                        .background(panel,RoundedCornerShape(14.dp))
                        .border(1.dp,edge,RoundedCornerShape(14.dp))
                        .padding(vertical=6.dp)){
                        control.options.forEach{(value,text)->
                            val selected=value==control.value
                            Row(Modifier.fillMaxWidth()
                                .chromeClickable(corner=8.dp){expanded=false;latestAction(control.id,value,0.0)}
                                .background(if(selected)accent.copy(alpha=if(light).14f else .20f)else Color.Transparent)
                                .padding(horizontal=14.dp,vertical=11.dp),verticalAlignment=Alignment.CenterVertically){
                                Text(text,color=if(selected)accent else label,fontSize=control.font.sp,modifier=Modifier.weight(1f))
                                if(selected)Box(Modifier.padding(start=8.dp).size(16.dp)){PageIcon("check",accent,Modifier.fillMaxSize())}
                            }
                        }
                    }
                }
            }
        }
    }
}
