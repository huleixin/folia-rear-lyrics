package io.github.huleixin.tingyu.minimal.immersive

import android.content.Context
import android.database.ContentObserver
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext

// UI adapter for the existing system music stream. Does not create an audio player.
class ImmersiveSystemVolume(context: Context) {
    private val audio = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    var available by mutableStateOf(try { !audio.isVolumeFixed } catch (_: SecurityException) { false })
        private set
    var value by mutableFloatStateOf(read())
        private set
    var dragging = false
    private fun read(): Float = try {
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        audio.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat() / max
    }
    catch (_: SecurityException) { available = false; 0f }
    fun sync(): Boolean {
        val next = read()
        val changed = next != value
        value = next
        return changed
    }
    fun set(next: Float) {
        if (!available || !next.isFinite()) return
        try {
            val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
            val index = kotlin.math.round(next.coerceIn(0f, 1f) * max).toInt()
            audio.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0)
        } catch (_: SecurityException) { available = false; return }
        sync()
    }
}

/** Observe volume only while this visual surface exists; detach on style/page disposal. */
@Composable
internal fun rememberImmersiveSystemVolume(): ImmersiveSystemVolume {
    val context = LocalContext.current
    val volume = remember(context) { ImmersiveSystemVolume(context) }
    DisposableEffect(context, volume) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { volume.sync() }
        }
        val registered = try { context.contentResolver.registerContentObserver(Settings.System.CONTENT_URI, true, observer); true } catch (_: SecurityException) { false }
        volume.sync()
        onDispose { if (registered) context.contentResolver.unregisterContentObserver(observer) }
    }
    return volume
}
