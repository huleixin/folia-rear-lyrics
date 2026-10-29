package io.github.huleixin.tingyu.chrome

import android.view.View
import android.view.ViewTreeObserver
import android.webkit.WebView
import io.github.huleixin.tingyu.BuildConfig
import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/GraphicsProbe.kt
// Diagnostic counters describe public View/Compose lifetimes, not private GPU allocations.
internal class GraphicsProbe(private val web:WebView) {
    val enabled=BuildConfig.GRAPHICS_DIAGNOSTICS
    private val prefs by lazy { web.context.getSharedPreferences("tingyu_graphics_probe_v1",0) }
    val mode=if(enabled)GraphicsProbeMode.parse(prefs.getString("mode","A"))else GraphicsProbeMode.A
    private var attached=0
    private var detached=0
    private var draws=0L
    var compositions=0
    var layerMounts=0
    var layerDisposals=0
    private val startedAt=System.currentTimeMillis()
    private val attach=object:View.OnAttachStateChangeListener{
        override fun onViewAttachedToWindow(view:View){attached++}
        override fun onViewDetachedFromWindow(view:View){detached++}
    }
    private val draw=ViewTreeObserver.OnDrawListener { draws++ }
    init { if(enabled){
        web.addOnAttachStateChangeListener(attach)
        web.viewTreeObserver.addOnDrawListener(draw)
        if(mode==GraphicsProbeMode.C_HW)web.setLayerType(View.LAYER_TYPE_HARDWARE,null)
    } }
    fun sampleStage(route:String)=!enabled||mode!=GraphicsProbeMode.B||route!="stage"
    fun snapshot(route:String,overlay:Boolean):JSONObject=JSONObject()
        .put("supported",enabled).put("mode",mode.name).put("startedAt",startedAt)
        .put("appVersion",BuildConfig.VERSION_NAME).put("sdk",android.os.Build.VERSION.SDK_INT)
        .put("manufacturer",android.os.Build.MANUFACTURER).put("model",android.os.Build.MODEL)
        .put("webViewVersion",if(android.os.Build.VERSION.SDK_INT>=26)WebView.getCurrentWebViewPackage()?.versionName?:"unknown"else"unknown")
        .put("nativeRoute",route).put("webOverlay",overlay).put("webBackdropSampling",sampleStage(route))
        .put("isolated999",mode!=GraphicsProbeMode.C31).put("webLayerType",web.layerType)
        .put("webHardwareAccelerated",web.isHardwareAccelerated).put("webAttached",web.isAttachedToWindow)
        .put("webVisibility",web.visibility).put("webWindowVisibility",web.windowVisibility)
        .put("webAlpha",web.alpha).put("webWidth",web.width).put("webHeight",web.height)
        .put("webHasFocus",web.hasWindowFocus()).put("webAttachCount",attached).put("webDetachCount",detached)
        .put("windowOnDrawCount",draws).put("drawCounterScope","ViewTreeObserver window draw callbacks, not WebView compositor frames").put("compositionCount",compositions)
        .put("logicalIsolationMounts",layerMounts).put("logicalIsolationDisposals",layerDisposals)
        .put("gpuAllocationVisibility","not observable through public View counters; requires device GPU/Perfetto trace")
    fun configure(target:String):Boolean {
        check(enabled){"Graphics diagnostic build required"}
        val next=GraphicsProbeMode.entries.firstOrNull{it.name==target}?:error("Unknown graphics experiment")
        check(GraphicsProbeMode.allowed(mode,next)){"Restore A before changing a different variable"}
        return prefs.edit().putString("mode",next.name).commit()
    }
    fun close(){if(enabled){web.removeOnAttachStateChangeListener(attach);if(web.viewTreeObserver.isAlive)web.viewTreeObserver.removeOnDrawListener(draw)}}
}

internal enum class GraphicsProbeMode {
    A,B,C31,C_HW;
    companion object {
        fun parse(value:String?)=entries.firstOrNull{it.name==value}?:A
        fun allowed(from:GraphicsProbeMode,to:GraphicsProbeMode)=from==A||to==A||from==to
    }
}
