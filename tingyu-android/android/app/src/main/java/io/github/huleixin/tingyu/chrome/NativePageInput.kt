package io.github.huleixin.tingyu.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
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
// Original 40px library filter / 46px capsule search, with preserved IME composition.
@Composable internal fun NativePageInput(section:NativePageSection,action:PageAction,search:Boolean=false) {
    var draft by remember(section.id){mutableStateOf(TextFieldValue(section.value))}
    var focused by remember{mutableStateOf(false)}
    val focus=LocalFocusManager.current
    LaunchedEffect(section.value,focused){if(!focused&&draft.text!=section.value)draft=TextFieldValue(section.value)}
    val shape=RoundedCornerShape(if(search)999.dp else 14.dp)
    Row(Modifier.fillMaxWidth().height((if(search)NativePageDesign.SearchField else NativePageDesign.LibraryFilter).dp).background(Color(0x08FFFFFF),shape)
        .border(1.dp,if(focused)Color(0x7791DBBD)else Color(0x14C6E6D6),shape).padding(start=12.dp,end=4.dp),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        PageIcon("search",PageMuted,Modifier.size(17.dp))
        BasicTextField(draft,{draft=it;action(section.action,it.text,if(it.composition!=null)1.0 else 0.0)},
            modifier=Modifier.weight(1f).onFocusChanged{focused=it.isFocused},
            textStyle=TextStyle(color=PageInk,fontSize=14.sp,lineHeight=20.sp),cursorBrush=SolidColor(PageAccent),singleLine=true,
            keyboardOptions=KeyboardOptions(imeAction=ImeAction.Search),
            keyboardActions=KeyboardActions(onSearch={action(section.submit.ifBlank{section.action},draft.text,0.0);focus.clearFocus()}),
            decorationBox={inner->if(draft.text.isBlank())Text(section.placeholder,color=PageMuted,fontSize=14.sp,lineHeight=20.sp,maxLines=1);inner()})
        if(draft.text.isNotEmpty())ChromeButton("清空",size=36.dp,onClick={draft=TextFieldValue("");action(section.action,"",0.0)}){
            PageIcon("x",PageMuted,Modifier.size(18.dp))
        }
    }
}
