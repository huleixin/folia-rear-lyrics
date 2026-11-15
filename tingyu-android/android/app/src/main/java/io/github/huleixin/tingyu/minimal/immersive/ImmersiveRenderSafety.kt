package io.github.huleixin.tingyu.minimal.immersive

import android.app.ActivityManager
import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import io.github.huleixin.tingyu.chrome.LocalLiquidReduced
import io.github.huleixin.tingyu.diagnostics.DiagnosticLog
import io.github.huleixin.tingyu.minimal.immersive.port.*
import org.json.JSONObject

// Renderer capability policy; no playback state or user content enters diagnostics.
internal object ImmersiveRenderSafety {
    private var preferences: SharedPreferences? = null
    var gpuDisabled by mutableStateOf(false)
        private set

    fun attach(context: Context) {
        if (preferences != null) return
        preferences = context.applicationContext.getSharedPreferences("immersive_renderer", Context.MODE_PRIVATE)
        gpuDisabled = preferences!!.getBoolean("gpu_disabled", false)
    }

    /** Failed drivers remain on the mature CPU path on later launches. */
    fun rejectGpu(error: Exception?) {
        if (gpuDisabled) return
        gpuDisabled = true
        preferences?.edit()?.putBoolean("gpu_disabled", true)?.apply()
        DiagnosticLog.event("player-style", "warn", "renderer-cpu-fallback", JSONObject()
            .put("style", "immersive").put("renderer", "cpu")
            .put("errorType", error?.javaClass?.simpleName ?: "shader-rejected"))
    }
}

@Composable internal fun ApplyImmersiveRenderPolicy(preview: Boolean) {
    val context = LocalContext.current
    val reduced = LocalLiquidReduced.current
    val lowRam = remember(context) {
        ImmersiveRenderSafety.attach(context)
        (context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.isLowRamDevice == true
    }
    SideEffect {
        if (!preview) {
            MeloXSettingsRuntime.reduceMotion = reduced
            MeloXSettingsRuntime.lyricReduceMotion = reduced
            MeloXSettingsRuntime.lyricRenderingQuality = if (lowRam || ImmersiveRenderSafety.gpuDisabled)
                MeloXLyricsRenderingQuality.Balanced else MeloXLyricsRenderingQuality.High
            MeloXSettingsRuntime.lyricBackgroundFrameRate = if (lowRam) 15 else 24
        }
    }
}
