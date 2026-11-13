package io.github.huleixin.tingyu.lyrics

import android.Manifest
import android.app.AppOpsManager
import android.bluetooth.*
import android.content.*
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.*
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.MessageDigest

// Connected A2DP profiles only. A scoped observer owns no playback session or lyric clock.
data class LyricsDevice(val id: String, val name: String, val streaming: Boolean)
data class LyricsDevicesState(val status: String = "loading", val devices: List<LyricsDevice> = emptyList())
internal class A2dpLyricsDevices(private val context: Context) {
    private val mutable = MutableStateFlow(LyricsDevicesState())
    val state = mutable.asStateFlow()
    private val handler = Handler(Looper.getMainLooper())
    private val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
    private val audio = context.getSystemService(AudioManager::class.java)
    private var proxy: BluetoothA2dp? = null
    private var requested = false
    @Volatile private var closed = false
    private val listener = object : BluetoothProfile.ServiceListener {
        override fun onServiceConnected(profile: Int, service: BluetoothProfile) {
            handler.post {
                if (closed) { runCatching { adapter?.closeProfileProxy(profile, service) }; return@post }
                proxy = service as? BluetoothA2dp; requested = false; refresh()
            }
        }
        override fun onServiceDisconnected(profile: Int) { handler.post { proxy = null; requested = false; if (!closed) mutable.value = LyricsDevicesState("disconnected") } }
    }
    private val receiver = object : BroadcastReceiver() { override fun onReceive(c: Context?, intent: Intent?) { refresh() } }
    private val routes = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(devices: Array<out AudioDeviceInfo>) { refresh() }
        override fun onAudioDevicesRemoved(devices: Array<out AudioDeviceInfo>) { refresh() }
    }
    private val ops = context.getSystemService(AppOpsManager::class.java)
    private val permissions = AppOpsManager.OnOpChangedListener { _, pkg -> if (pkg == context.packageName) handler.post { refresh() } }
    init {
        runCatching { ContextCompat.registerReceiver(context, receiver, IntentFilter().apply {
            addAction(BluetoothAdapter.ACTION_STATE_CHANGED); addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED)
            addAction(BluetoothA2dp.ACTION_PLAYING_STATE_CHANGED); addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
        }, ContextCompat.RECEIVER_EXPORTED) }
        runCatching { audio?.registerAudioDeviceCallback(routes, handler) }
        if (Build.VERSION.SDK_INT >= 31) runCatching { ops?.startWatchingMode("android:bluetooth_connect", context.packageName, permissions) }
        refresh()
    }
    fun refresh() {
        if (closed) return
        try {
            if (!hasPermission(context)) { mutable.value = LyricsDevicesState("permission-required"); return }
            if (adapter == null) { mutable.value = LyricsDevicesState("unavailable"); return }
            if (!adapter.isEnabled) { mutable.value = LyricsDevicesState("bluetooth-off"); return }
            if (proxy == null) {
                if (!requested) { requested = adapter.getProfileProxy(context, listener, BluetoothProfile.A2DP) }
                mutable.value = LyricsDevicesState(if (requested) "loading" else "unavailable"); return
            }
            val devices = proxy!!.connectedDevices.map { device ->
                val id = MessageDigest.getInstance("SHA-256").digest((context.packageName + device.address).toByteArray()).joinToString("") { "%02x".format(it) }
                LyricsDevice(id, device.name ?: "A2DP", proxy!!.isA2dpPlaying(device))
            }
            mutable.value = LyricsDevicesState(if (devices.isEmpty()) "disconnected" else "connected", devices)
        } catch (_: SecurityException) { mutable.value = LyricsDevicesState("permission-required") }
        catch (_: RuntimeException) { mutable.value = LyricsDevicesState("unavailable") }
    }
    @Suppress("DEPRECATION") fun pauseRouteHeld() = runCatching { audio?.isBluetoothA2dpOn == true }.getOrDefault(false)
    fun close() {
        // Let already queued profile callbacks run: they must close a proxy delivered during teardown.
        closed = true
        runCatching { context.unregisterReceiver(receiver) }; runCatching { audio?.unregisterAudioDeviceCallback(routes) }
        runCatching { ops?.stopWatchingMode(permissions) }
        proxy?.let { runCatching { adapter?.closeProfileProxy(BluetoothProfile.A2DP, it) } }; proxy = null
    }
    companion object {
        fun hasPermission(context: Context) = Build.VERSION.SDK_INT < 31 || ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }
}
