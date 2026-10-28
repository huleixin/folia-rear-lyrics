package io.github.huleixin.tingyu.chrome

import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePacketPreparation.kt
// Parse/validate and serialize cache snapshots on Capacitor's worker, before posting a
// small immutable presentation to the UI thread. Acceptance/order still belong to the host.
internal data class NativeCachedPresentation(val id: String, val text: String)
class PreparedNativePage internal constructor(val page: NativePage, val navigation: String,
    internal val cache: NativeCachedPresentation?) {
    companion object {
        @JvmStatic fun parse(value: JSONObject): PreparedNativePage {
            val page=NativePage.parse(value)
            return PreparedNativePage(page,value.optString("navigation"),if(page.enabled)NativeShellCache.preparePage(value)else null)
        }
    }
}
class PreparedChromeSurface internal constructor(val surface: ChromeSurface,
    internal val cache: NativeCachedPresentation?) {
    companion object {
        @JvmStatic fun parse(value: JSONObject): PreparedChromeSurface {
            val surface=ChromeSurface.parse(value)
            return PreparedChromeSurface(surface,if(surface.enabled)NativeShellCache.prepareChrome(value)else null)
        }
    }
}
