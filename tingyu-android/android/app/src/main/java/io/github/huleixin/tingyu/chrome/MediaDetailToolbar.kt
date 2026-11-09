package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MediaDetailToolbar.kt
// A single fixed-height foreground: the toolbar leaves before the search row enters.
@Composable
internal fun MediaDetailToolbar(identity:String,searching:Boolean,section:NativePageSection?,action:PageAction,
    onRequestClose:()->Unit,onClosed:()->Unit,normal:@Composable ()->Unit) {
    var opened by remember(identity){mutableStateOf(false)}
    val close by rememberUpdatedState(onClosed)
    val travel=with(LocalDensity.current){4.dp.roundToPx()}
    LaunchedEffect(searching){
        if(searching)opened=true
        else if(opened){delay(220);opened=false;close()}
    }
    AnimatedContent(targetState=searching&&section!=null,modifier=Modifier.fillMaxWidth().height(NativeSearchBarHeight),
        transitionSpec={
            ((fadeIn(tween(140,delayMillis=80))+slideInVertically(tween(140,delayMillis=80)){travel})
                togetherWith fadeOut(tween(80))).using(null)
        },label="media-toolbar-search"){search->
        if(search&&section!=null){
            val focus=remember{FocusRequester()}
            Box(Modifier.fillMaxSize().padding(horizontal=14.dp)){
                NativeSearchBarRow(section,action,focus,searching,onRequestClose,section.moreLabel.ifBlank{"取消"})
            }
        }else normal()
    }
}
