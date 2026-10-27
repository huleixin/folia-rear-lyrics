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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.unit.dp
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
                if(control.value=="1")PageIcon("check",Color(0xFF04231B),Modifier.fillMaxSize().padding(2.dp))
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
            var expanded by remember{mutableStateOf(false)}
            Box(modifier.clickable(enabled=!control.disabled){expanded=true}){
                Text(control.options.firstOrNull{it.first==control.value}?.second?:control.value,color=ink,fontSize=control.font.sp)
                DropdownMenu(expanded,{expanded=false}){control.options.forEach{(value,label)->DropdownMenuItem(text={Text(label,fontSize=control.font.sp)},onClick={expanded=false;latestAction(control.id,value,0.0)})}}
            }
        }
    }
}
