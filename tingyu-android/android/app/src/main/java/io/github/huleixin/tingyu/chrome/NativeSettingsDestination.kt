package io.github.huleixin.tingyu.chrome

import android.app.Activity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf

// NativeSettingsDestination.kt: native-only settings share the shell's existing route animation and safe geometry.
internal data class SettingsSafeInsets(val top:Float,val bottom:Float)
internal val LocalSettingsSafeInsets=staticCompositionLocalOf<SettingsSafeInsets?>{null}
internal data class NativeSettingsDestination(val kind:String,val copyJson:String?=null){
    val key get()="settings:native:$kind"
    fun page(base:NativePage,width:Float,height:Float)=base.copy(id="settings",key=key,
        rect=ChromeRect(0f,0f,width,height,1f),viewport=width,document=null,home=false,subtitle=copyJson.orEmpty(),sections=emptyList(),bottomClearance=0f)
    companion object{
        private val kinds=setOf("desktop","bluetooth","coffee","group")
        fun fromKey(key:String):String?=key.removePrefix("settings:native:").takeIf{key.startsWith("settings:native:")&&it in kinds}
        fun returning(from:String,to:String,back:Boolean)=if(fromKey(to)!=null)false else if(fromKey(from)!=null)true else back
    }
}
@Composable internal fun NativeSettingsContent(kind:String,activity:Activity,copyJson:String?,onClose:()->Unit){
    when(kind){
        "desktop","bluetooth"->LyricsSettingsSheet(activity,mode=kind,requestBluetooth={
            if(android.os.Build.VERSION.SDK_INT>=31)activity.requestPermissions(arrayOf(android.Manifest.permission.BLUETOOTH_CONNECT),27073)
        },onClose=onClose)
        else->SupportSheets(kind,copyJson,onClose)
    }
}
