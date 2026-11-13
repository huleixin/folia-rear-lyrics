package io.github.huleixin.tingyu.lyrics

import android.content.Context
import android.media.MediaMetadata
import android.os.SystemClock
import com.getcapacitor.JSObject
import io.github.huleixin.tingyu.RearNativeTrack
import io.github.huleixin.tingyu.playback.PlaybackDiagnostics
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.util.function.Consumer

// Experimental title projection into the existing system session. Never touches audio or controls.
internal class BluetoothLyricsController(context: Context, private val source: LyricsProjectionSource,
    private val publish: Consumer<MediaMetadata>) {
    private val prefs = LyricsPreferences.get(context)
    private val devices = A2dpLyricsDevices(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var canonical: MediaMetadata? = null
    private var pending: Job? = null
    private var testRestore: Job? = null
    private var projected = false
    private var lastTitle = ""
    private var lastEpoch = ""
    private var lastDevice = ""
    private var lastWrite = Long.MIN_VALUE / 2
    private var routeHeld = false
    private var closed = false
    private val contextForPermission = context.applicationContext
    init { scope.launch { combine(source.state, prefs.state, devices.state) { _, _, _ -> Unit }.collect { refresh() } } }
    fun canonical(value: MediaMetadata) {
        canonical = value; projected = false; lastTitle = ""; pending?.cancel(); testRestore?.cancel()
        runCatching { publish.accept(value) }.onFailure { status.value = "metadata-error" }; refresh()
    }
    private fun compatible(projection: LyricsProjection): Boolean {
        val preference = prefs.state.value
        val device = devices.state.value.devices.firstOrNull { it.id == preference.device }
        if (lastDevice != preference.device) { routeHeld = false; lastDevice = preference.device }
        if (device == null || !preference.bluetooth) { routeHeld = false; return false }
        if (device.streaming) routeHeld = true
        else if (projection.state.playback.playing || !devices.pauseRouteHeld()) routeHeld = false
        val track = RearNativeTrack.snapshot()
        return routeHeld && A2dpLyricsDevices.hasPermission(contextForPermission) &&
            BluetoothLyricsMetadata.matches(canonical, projection, track.optString("songKey"), track.optString("epoch"))
    }
    private fun refresh() {
        if (closed) return
        val projection = source.state.value
        pending?.cancel(); pending = null
        if (!compatible(projection)) {
            restore()
            val settings = prefs.state.value
            status.value = when {
                !settings.bluetooth -> "disabled"
                devices.state.value.status != "connected" -> devices.state.value.status
                settings.device.isEmpty() -> "select-device"
                devices.state.value.devices.none { it.id == settings.device } -> "device-disconnected"
                !routeHeld -> "waiting-for-route"
                else -> "waiting-for-lyrics"
            }
            return
        }
        if (lastEpoch != projection.epoch) { restore(); lastEpoch = projection.epoch }
        val line = projection.line!!.text
        if (projected && line == lastTitle) return
        val wait = (BluetoothLyricsMetadata.MIN_INTERVAL_MS - (SystemClock.elapsedRealtime() - lastWrite)).coerceAtLeast(0)
        if (wait == 0L) apply(projection, line)
        else pending = scope.launch { delay(wait); val latest = source.state.value
            if (latest.songKey == projection.songKey && latest.epoch == projection.epoch && compatible(latest)) apply(latest, latest.line!!.text)
        }
    }
    private fun apply(projection: LyricsProjection, line: String) {
        if (closed || !compatible(projection)) return
        val value = canonical ?: return
        try {
            publish.accept(BluetoothLyricsMetadata.project(value, line)); projected = true; lastTitle = line
            lastWrite = SystemClock.elapsedRealtime(); status.value = "metadata-updated"
            PlaybackDiagnostics.note("bluetooth-lyrics-metadata", JSObject().put("song", PlaybackDiagnostics.anonKey(projection.songKey)).put("line", projection.index).put("vehicleVerified", false))
        } catch (error: RuntimeException) { status.value = "metadata-error"; restore() }
    }
    private fun restore() {
        if (projected) canonical?.let { runCatching { publish.accept(it) } }
        projected = false; lastTitle = ""
    }
    /** One bounded check only; the caller must inspect the vehicle itself. */
    fun test(): Boolean {
        val value = source.state.value
        if (!compatible(value)) { refresh(); return false }
        if (SystemClock.elapsedRealtime() - lastWrite < BluetoothLyricsMetadata.MIN_INTERVAL_MS) return false
        pending?.cancel(); apply(value, value.line!!.text)
        testRestore?.cancel(); testRestore = scope.launch { delay(3000); restore(); status.value = "test-complete" }
        return projected
    }
    fun close() { closed = true; scope.cancel(); devices.close(); restore(); status.value = "disabled" }
    companion object { val status = MutableStateFlow("disabled") }
}
