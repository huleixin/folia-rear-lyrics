package io.github.huleixin.tingyu.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePlayerEntry.kt
// Move the actual WebView over the retained native page; no screenshot or JS frame bridge.
@Composable internal fun Modifier.playerEntryTransform(enter:Boolean,reduced:Boolean,height:Float):Modifier {
    val offset=remember(enter){Animatable(if(enter&&!reduced)1f else 0f)}
    LaunchedEffect(enter,reduced){offset.animateTo(0f,tween(if(reduced)0 else 420,easing=CubicBezierEasing(.2f,.72f,.16f,1f)))}
    return graphicsLayer{translationY=height*offset.value}
}
@Composable internal fun Modifier.playerDetourTransform(phase:String,reduced:Boolean,height:Float):Modifier {
    val offset=remember(phase){Animatable(if(phase=="to-stage"&&!reduced)1f else 0f)}
    LaunchedEffect(phase,reduced){
        offset.animateTo(if(phase=="to-minimal"&&!reduced)1f else 0f,
            tween(if(reduced)0 else 360,easing=if(phase=="to-minimal")CubicBezierEasing(.4f,0f,.7f,.3f)else CubicBezierEasing(.2f,.72f,.16f,1f)))
    }
    return graphicsLayer{translationY=height*offset.value}
}
