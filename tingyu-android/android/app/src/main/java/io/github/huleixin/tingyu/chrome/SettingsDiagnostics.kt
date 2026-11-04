package io.github.huleixin.tingyu.chrome

import android.util.Log
import org.json.JSONObject
import androidx.compose.runtime.staticCompositionLocalOf

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsDiagnostics.kt
// Opt-in touch/route evidence, without field contents or song metadata.
internal data class SettingsTraceIdentity(val route:String="",val session:String="",val key:String="",val navigation:String="",val liveEnabled:Boolean=true)
internal val LocalSettingsTraceIdentity=staticCompositionLocalOf{SettingsTraceIdentity()}
internal fun settingsTrace(phase:String,vararg fields:Pair<String,Any?>) {
    if(!NavigationTiming.enabled()&&!Log.isLoggable("TingyuSettings",Log.DEBUG))return
    val record=JSONObject().put("phase",phase).put("at",NavigationTiming.epochNow()).put("gesture",NavigationTiming.gestureId())
    fields.forEach{(key,value)->record.put(key,value?:JSONObject.NULL)}
    NavigationTiming.detail("settings:$phase",record)
    Log.d("TingyuSettings",record.toString())
}
