package io.github.huleixin.tingyu.chrome

import android.view.View
import android.webkit.WebView

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeSamplingPolicy.kt
// Only a visible glass reader may record WebView. Native pages have a separate source.
internal object ChromeSamplingPolicy {
    fun webReader(route:String, exiting:Boolean, overlay:Boolean, active:Boolean, focused:Boolean, readers:Int)=
        active&&focused&&!overlay&&(route=="stage"||exiting)&&readers>0
}

internal class WebSamplingLayer(private val web:WebView) {
    private val original=web.layerType
    private val lease=WebSamplingLease(
        acquire={if(web.layerType!=View.LAYER_TYPE_HARDWARE)web.setLayerType(View.LAYER_TYPE_HARDWARE,null)},
        release={if(web.layerType!=original)web.setLayerType(original,null)},
        afterFrame={callback->web.postOnAnimation{callback()}}
    )
    fun update(needed:Boolean)=lease.update(needed)
    fun close()=lease.close()
}

internal class WebSamplingLease(private val acquire:()->Unit,private val release:()->Unit,private val afterFrame:(()->Unit)->Unit) {
    private var requested=false
    private var generation=0
    private var closed=false
    fun update(needed:Boolean) {
        if(closed||needed==requested)return
        requested=needed;val token=++generation
        if(needed)acquire()
        else {
            // Remove backdrop readers first. Two frame callbacks drain the outgoing recording
            // before releasing its texture. A quick reveal invalidates this pending release.
            afterFrame{afterFrame{
                if(!closed&&!requested&&generation==token)release()
            }}
        }
    }
    fun close(){if(closed)return;closed=true;generation++;release()}
}
