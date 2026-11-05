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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
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
@Composable internal fun NativePageInput(
    section:NativePageSection,
    action:PageAction,
    search:Boolean=false,
    /** 固定层用：由外层请求焦点（展开时自动聚焦弹键盘）。 */
    focusRequester:FocusRequester?=null,
    /** 组合后立刻请求焦点（第一次展开时立即弹键盘，不等用户再点一次）。 */
    autoFocus:Boolean=false,
    /** 外层已经画了胶囊底/描边时不再重复画（避免双层边框）。 */
    bare:Boolean=false,
    /** 焦点变化回调：页面用它决定"展开/收起搜索层"。 */
    onFocusChanged:((Boolean)->Unit)?=null,
    /** 被动模式：自身不获取焦点（点击由外层接管，用于"点一下就上浮成固定层"的入口）。 */
    passive:Boolean=false,
) {
    var draft by remember(section.id){mutableStateOf(TextFieldValue(section.value))}
    var focused by remember{mutableStateOf(false)}
    val focus=LocalFocusManager.current
    LaunchedEffect(autoFocus){
        if(autoFocus){withFrameNanos{};runCatching{focusRequester?.requestFocus()}}
    }
    LaunchedEffect(section.value,focused){if(!focused&&draft.text!=section.value)draft=TextFieldValue(section.value)}
    val shape=RoundedCornerShape(if(search)999.dp else 14.dp)
    val fieldHeight=if(bare)46.dp else (if(search)NativePageDesign.SearchField else NativePageDesign.LibraryFilter).dp
    Row(Modifier.fillMaxWidth().height(fieldHeight)
        .then(if(bare)Modifier else Modifier.background(interfaceColor(Color(0x08FFFFFF),LightInterfaceColors.Subtle),shape)
            .border(1.dp,if(focused)interfaceColor(Color(0x7791DBBD),LightInterfaceColors.Focus)else interfaceColor(Color(0x14C6E6D6),LightInterfaceColors.Border),shape))
        .padding(start=12.dp,end=4.dp),
        verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        PageIcon("search",PageMuted,Modifier.size(17.dp))
        BasicTextField(draft,{draft=it;action(section.action,it.text,if(it.composition!=null)1.0 else 0.0)},
            modifier=Modifier.weight(1f)
                .then(if(focusRequester!=null)Modifier.focusRequester(focusRequester)else Modifier)
                .onFocusChanged{focused=it.isFocused;onFocusChanged?.invoke(it.isFocused)},
            textStyle=TextStyle(color=PageInk,fontSize=14.sp,lineHeight=20.sp),cursorBrush=SolidColor(PageAccent),singleLine=true,
            // 被动模式必须真的不可聚焦：否则点内联框时它自己先吃下 tap、弹起输入法，
            // 外层的"展开固定层"就永远不触发（68603 的现象）。
            enabled=!passive,
            keyboardOptions=KeyboardOptions(imeAction=ImeAction.Search),
            keyboardActions=KeyboardActions(onSearch={action(section.submit.ifBlank{section.action},draft.text,0.0);focus.clearFocus()}),
            decorationBox={inner->if(draft.text.isBlank())Text(section.placeholder,color=PageMuted,fontSize=14.sp,lineHeight=20.sp,maxLines=1);inner()})
        if(draft.text.isNotEmpty())ChromeButton("清空",size=36.dp,onClick={draft=TextFieldValue("");action(section.action,"",0.0)}){
            PageIcon("x",PageMuted,Modifier.size(18.dp))
        }
    }
}
