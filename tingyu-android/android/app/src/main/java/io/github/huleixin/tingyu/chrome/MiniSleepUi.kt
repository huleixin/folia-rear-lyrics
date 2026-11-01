package io.github.huleixin.tingyu.chrome

import android.os.SystemClock
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import io.github.huleixin.tingyu.playback.SleepTimerController
import com.getcapacitor.JSObject
import java.util.function.Consumer
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/MiniSleepUi.kt
/** A disposable UI subscriber of the existing authority, with no playback or expiry logic. */
internal class MiniSleepUi(private val timer:SleepTimerController) {
    var snapshot by mutableStateOf(MiniSleepSnapshot())
        private set
    var error by mutableStateOf("")
        private set
    private val listener=Consumer<JSObject>{snapshot=MiniSleepSnapshot.from(it,SystemClock.elapsedRealtime())}
    fun observe(){timer.observe(listener);refresh()}
    fun close(){timer.unobserve(listener)}
    fun refresh(){timer.check();listener.accept(timer.snapshot())}
    fun clearError(){error=""}
    fun start(mode:String,duration:Long):Boolean=run {
        try {listener.accept(timer.start(mode,duration));error="";true}
        catch(failure:Exception){error=if(failure is IllegalArgumentException)"请选择 1 分钟至 24 小时的时长"else failure.message?:"定时未设置，请稍后再试";false}
    }
    fun cancel():Boolean=run {
        try {listener.accept(timer.cancel("cancelled"));error="";true}
        catch(failure:Exception){error="取消失败，请稍后再试";false}
    }
}
@Composable internal fun rememberMiniSleepUi(rendering:Boolean):MiniSleepUi {
    val context=LocalContext.current
    val ui=remember(context){MiniSleepUi(SleepTimerController.get(context))}
    DisposableEffect(ui,rendering){if(rendering)ui.observe();onDispose{ui.close()}}
    return ui
}
@Composable internal fun sleepDisplayNow(snapshot:MiniSleepSnapshot,rendering:Boolean,precise:Boolean):Long {
    var now by remember(snapshot){mutableLongStateOf(SystemClock.elapsedRealtime())}
    LaunchedEffect(snapshot,rendering,precise){
        if(!rendering||!snapshot.active||snapshot.waiting)return@LaunchedEffect
        while(isActive){
            now=SystemClock.elapsedRealtime()
            val remaining=snapshot.remainingAt(now)
            if(remaining==0L)break
            // The badge changes at minute boundaries; only an open menu displays seconds.
            delay(if(precise)minOf(1000,remaining)else minOf(remaining,remaining%60000+1))
        }
    }
    return now
}
