package io.github.huleixin.tingyu.chrome

import android.app.Application
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.SilenceMediaSource
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import io.github.huleixin.tingyu.playback.SleepTimerController
import org.json.JSONObject

// android/app/src/debug/java/io/github/huleixin/tingyu/chrome/MiniSleepPreviewActivity.kt
// Debug-only native fixture, excluded from Release. Uses the production menu and controller.
class MiniSleepPreviewActivity:ComponentActivity() {
    var previewWidth by mutableIntStateOf(393)
    var light by mutableStateOf(false)
    private var menu by mutableStateOf(false)
    lateinit var session:SleepPreviewSession
        private set
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState);WindowCompat.setDecorFitsSystemWindows(window,false)
        session=ViewModelProvider(this)[SleepPreviewSession::class.java]
        setContent {
            val real=LocalDensity.current
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val pixels=with(real){maxWidth.toPx()}
                CompositionLocalProvider(LocalDensity provides Density(pixels/previewWidth,1f),LocalInterfacePalette provides InterfacePalette(light)) {
                    BoxWithConstraints(Modifier.fillMaxSize().background(if(light)InterfacePalette(true).sheet else Color(0xFF031812))) {
                        val backdrop=rememberLayerBackdrop();val ui=rememberMiniSleepUi(true)
                        val w=maxWidth.value;val h=maxHeight.value;val density=LocalDensity.current
                        var anchor by remember{mutableStateOf(Rect.Zero)}
                        val cache=remember{NativeShellCache(this@MiniSleepPreviewActivity)}
                        Box(Modifier.fillMaxSize().layerBackdrop(backdrop)) {NativePageView(cache.page("home",w,h,24f),Modifier.fillMaxSize()){_,_,_->}}
                        val mini=NativeFooterLayout.rect("mini",w,h,24f,24f,false)
                        val surface=remember(light){ChromeSurface.parse(JSONObject().put("id","mini").put("session","preview").put("viewportWidth",393)
                            .put("data",JSONObject().put("title","戒烟").put("artist","李荣浩").put("playing",false).put("labels",JSONObject().put("qualityValue","无损")))).interfacePaint(InterfacePalette(light))}
                        ChromeMiniPlayer(surface,ChromeTimeline(12.0,300.0,false,SystemClock.elapsedRealtime()),backdrop,
                            Modifier.offset(mini.left.dp,mini.top.dp).size(mini.width.dp,mini.height.dp)){_,_->}
                        // The production mini no longer hosts sleep; keep the debug menu fixture independently reachable.
                        MiniSleepButton(ui,light,48f,true,{menu=!menu},
                            Modifier.offset((mini.left+mini.width-48f).dp,(mini.top-56f).dp)
                                .onGloballyPositioned{anchor=it.boundsInRoot()})
                        val nav=NativeFooterLayout.rect("nav",w,h,24f,24f,false)
                        ChromeNavigation(surface.copy(id="nav",selected=0),backdrop,Modifier.offset(nav.left.dp,nav.top.dp).size(nav.width.dp,nav.height.dp)){_,_->}
                        TyPanelScrim(menu,light,{menu=false})
                        if(menu)MiniSleepMenu(ui,24f,24f,light,30,true){menu=false}
                    }
                }
            }
        }
    }
}
class SleepPreviewSession(application:Application):AndroidViewModel(application) {
    val player=ExoPlayer.Builder(application).build()
    val timer=SleepTimerController.get(application)
    init {player.setMediaSource(SilenceMediaSource.Factory().setDurationUs(3600000000).createMediaSource());player.prepare();timer.attach(player,player::pause)}
    override fun onCleared(){timer.detach();player.release()}
}
