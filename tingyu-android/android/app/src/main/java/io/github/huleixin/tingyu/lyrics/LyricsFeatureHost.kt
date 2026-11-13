package io.github.huleixin.tingyu.lyrics

import android.content.Context
import io.github.huleixin.tingyu.minimal.MinimalPlayerRuntime
import kotlinx.coroutines.*
import com.getcapacitor.JSObject
import io.github.huleixin.tingyu.playback.PlaybackDiagnostics
import android.media.MediaMetadata
import java.util.function.Consumer

// Feature lifecycle belongs to the existing playback service. Disabled features own no windows/jobs.
class LyricsFeatureHost(private val context: Context, private val publish: Consumer<MediaMetadata>) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var source: LyricsProjectionSource? = null
    private var desktop: DesktopLyricsController? = null
    private var bluetooth: BluetoothLyricsController? = null
    private var canonical: MediaMetadata? = null
    init {
        active = this
        scope.launch { LyricsPreferences.get(context).state.collect { settings ->
            if ((settings.desktop || settings.bluetooth) && source == null) {
                runCatching { LyricsProjectionSource(MinimalPlayerRuntime.get(context)) }.onSuccess { source = it }.onFailure {
                    PlaybackDiagnostics.note("lyrics-projection-start", JSObject().put("error", it.javaClass.simpleName))
                }
                if (source == null) return@collect
            }
            if (settings.desktop && desktop == null) {
                runCatching { DesktopLyricsController(context, source!!) }.onSuccess { desktop = it }.onFailure {
                    DesktopLyricsController.status.value = "window-error"
                    PlaybackDiagnostics.note("desktop-lyrics-start", JSObject().put("error", it.javaClass.simpleName))
                }
            }
            if (!settings.desktop) { desktop?.close(); desktop = null }
            if (settings.bluetooth && bluetooth == null) {
                runCatching { BluetoothLyricsController(context, source!!, publish) }.onSuccess {
                    bluetooth = it; canonical?.let(it::canonical)
                }.onFailure { BluetoothLyricsController.status.value = "metadata-error" }
            }
            if (!settings.bluetooth) { bluetooth?.close(); bluetooth = null }
            if (!settings.desktop && !settings.bluetooth) { source?.close(); source = null }
        } }
    }
    fun canonical(value: MediaMetadata) { canonical = value; if (bluetooth == null) publish.accept(value) else bluetooth!!.canonical(value) }
    fun close() { scope.cancel(); desktop?.close(); bluetooth?.close(); source?.close(); if (active === this) active = null }
    companion object {
        private var active: LyricsFeatureHost? = null
        @JvmStatic fun testBluetooth() = active?.bluetooth?.test() == true
    }
}
