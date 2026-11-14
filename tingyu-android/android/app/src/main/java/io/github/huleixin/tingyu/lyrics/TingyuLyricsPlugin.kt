package io.github.huleixin.tingyu.lyrics

import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import android.Manifest
import android.os.Build

// Small native bridge: preference snapshots, visual import/export and the themed settings sheet.
@CapacitorPlugin(name = "TingyuLyrics", permissions = [Permission(alias = "bluetooth", strings = [Manifest.permission.BLUETOOTH_CONNECT])])
class TingyuLyricsPlugin : Plugin() {
    @PluginMethod fun snapshot(call: PluginCall) { call.resolve(JSObject.fromJSONObject(LyricsPreferences.get(context).state.value.json())) }
    @PluginMethod fun restoreStyle(call: PluginCall) {
        val style = DesktopLyricsStyle.from(call.getObject("style") ?: JSObject())
        LyricsPreferences.get(context).update { it.copy(style = style) }; call.resolve()
    }
    @PluginMethod fun requestBluetooth(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 31 || A2dpLyricsDevices.hasPermission(context)) call.resolve()
        else requestPermissionForAlias("bluetooth", call, "bluetoothPermission")
    }
    @PermissionCallback private fun bluetoothPermission(call: PluginCall) {
        call.resolve(JSObject().put("granted", A2dpLyricsDevices.hasPermission(context)))
    }
    @PluginMethod fun openSettings(call: PluginCall) { activity.runOnUiThread {
        val shell=(activity as? io.github.huleixin.tingyu.MainActivity)?.nativeShell
        if(shell?.openLyricsSettings(call.getString("mode")?:"desktop")==true)call.resolve()
        else call.reject("Native settings host is not ready; retry after returning to the app")
    } }
}
