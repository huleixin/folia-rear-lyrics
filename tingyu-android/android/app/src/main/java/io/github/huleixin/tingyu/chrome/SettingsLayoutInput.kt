package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.dp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsLayoutInput.kt
// The original label/description live in the page layout, outside this text field.
@Composable
internal fun SettingsLayoutInput(node:TySettingNode,theme:TyPanelTheme,modifier:Modifier,s:SettingsLayoutStyle,action:PageAction){
    var draft by remember(node.id){mutableStateOf(node.value)}
    var focused by remember{mutableStateOf(false)}
    LaunchedEffect(node.value,focused){if(!focused)draft=node.value}
    Box(modifier.fillMaxWidth().heightIn(min=if(s.minHeight>0)s.minHeight.dp else if(node.multiline)88.dp else 44.dp)
        .clip(RoundedCornerShape(if(s.radius>0)s.radius.dp else 12.dp)).background(theme.card)
        .border(1.dp,theme.line,RoundedCornerShape(if(s.radius>0)s.radius.dp else 12.dp))
        .then(if(s.padding.size==4)Modifier.layoutEdges(s.padding)else Modifier.padding(horizontal=12.dp,vertical=10.dp)),
        propagateMinConstraints=true){
        if(draft.isEmpty())Text(node.placeholder,color=theme.muted,style=LocalTextStyle.current)
        BasicTextField(value=draft,onValueChange={draft=it;action(TySettingEvent.submit(node.action),it,0.0)},
            enabled=!node.disabled,singleLine=!node.multiline,textStyle=LocalTextStyle.current,cursorBrush=SolidColor(theme.accent),
            visualTransformation=if(node.inputType=="password")PasswordVisualTransformation()else VisualTransformation.None,
            keyboardOptions=KeyboardOptions(keyboardType=when(node.inputType){"password"->KeyboardType.Password;"number"->KeyboardType.Decimal;"url"->KeyboardType.Uri;"email"->KeyboardType.Email;else->KeyboardType.Text},imeAction=if(node.multiline)ImeAction.Default else ImeAction.Done),
            keyboardActions=KeyboardActions(onDone={action("enter:${node.action}","",0.0)}),
            modifier=Modifier.fillMaxWidth().onFocusChanged{if(focused!=it.isFocused){focused=it.isFocused;action("focus:${node.action}","",if(focused)1.0 else 0.0)}})
    }
}
