package io.github.huleixin.tingyu.lyrics

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.WindowManager
import androidx.activity.ComponentDialog
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import android.Manifest
import android.os.Build
import io.github.huleixin.tingyu.chrome.*

// Small native bridge: preference snapshots, visual import/export and the themed settings sheet.
@CapacitorPlugin(name = "TingyuLyrics", permissions = [Permission(alias = "bluetooth", strings = [Manifest.permission.BLUETOOTH_CONNECT])])
class TingyuLyricsPlugin : Plugin() {
    private var sheet: ComponentDialog? = null
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
        try {
            sheet?.dismiss()
            val dialog = ComponentDialog(activity)
            val compose = ComposeView(activity)
            compose.setViewTreeViewModelStoreOwner(activity)
            compose.setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
            dialog.setContentView(compose)
            compose.setContent {
                CompositionLocalProvider(LocalInterfacePalette provides InterfacePalette(InterfaceAppearance.light(activity), InterfaceAppearance.style(activity))) {
                    LyricsSettingsSheet(activity, mode = call.getString("mode") ?: "desktop",
                        requestBluetooth = {
                            if (Build.VERSION.SDK_INT >= 31) activity.requestPermissions(arrayOf(Manifest.permission.BLUETOOTH_CONNECT), 27073)
                        }) { dialog.dismiss() }
                }
            }
            dialog.setOnDismissListener { compose.disposeComposition(); if (sheet === dialog) sheet = null }
            dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            dialog.show(); dialog.window?.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT)
            sheet = dialog; call.resolve()
        } catch (error: RuntimeException) { call.reject("Lyrics settings could not open", error) }
    } }
    override fun handleOnDestroy() { sheet?.dismiss(); sheet = null }
}
