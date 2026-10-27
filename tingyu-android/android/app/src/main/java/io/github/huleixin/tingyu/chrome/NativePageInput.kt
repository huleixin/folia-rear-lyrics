package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageInput.kt
@Composable internal fun NativePageInput(section: NativePageSection, action:(String,String,Double)->Unit) {
    var draft by remember(section.id){mutableStateOf(TextFieldValue(section.value))}
    var focused by remember{mutableStateOf(false)}
    val focus=LocalFocusManager.current
    LaunchedEffect(section.value,focused){if(!focused&&draft.text!=section.value)draft=TextFieldValue(section.value)}
    Row(Modifier.fillMaxWidth().background(Color(0xCC19362A),RoundedCornerShape(16.dp)).padding(10.dp)) {
        BasicTextField(draft,{draft=it;action(section.action,it.text,if(it.composition!=null)1.0 else 0.0)},modifier=Modifier.weight(1f).padding(8.dp).onFocusChanged{focused=it.isFocused},
            textStyle=TextStyle(color=Color(0xFFF1F6F3),fontSize=15.sp),cursorBrush=SolidColor(Color(0xFF9FE0C4)),singleLine=true,
            keyboardOptions=KeyboardOptions(imeAction=ImeAction.Search),keyboardActions=KeyboardActions(onSearch={
                action(section.submit.ifBlank{section.action},draft.text,0.0);focus.clearFocus()
            }),decorationBox={inner->if(draft.text.isBlank())Text(section.placeholder,color=Color(0xFFA2B8AE),fontSize=15.sp);inner()})
        if(draft.text.isNotEmpty())ChromeButton("清空",size=40.dp,onClick={draft=TextFieldValue("");action(section.action,"",0.0)}){Text("×",fontSize=20.sp,color=Color(0xFFA2B8AE))}
        if(section.submit.isNotBlank())ChromeButton("搜索",size=44.dp,onClick={action(section.submit,draft.text,0.0);focus.clearFocus()}) {Text("搜索",fontSize=13.sp,color=Color(0xFF9FE0C4))}
    }
}
