package io.github.huleixin.tingyu.lyrics

import android.media.MediaMetadata

// Copy the complete canonical metadata, including vendor lyric fields; replace only titles.
internal object BluetoothLyricsMetadata {
    const val MIN_INTERVAL_MS = 1500L
    fun project(original: MediaMetadata, line: String): MediaMetadata = MediaMetadata.Builder(original)
        .putString(MediaMetadata.METADATA_KEY_TITLE, line.take(180))
        .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, line.take(180)).build()
    fun matches(original: MediaMetadata?, projection: LyricsProjection, key: String, epoch: String): Boolean =
        original != null && projection.valid && projection.songKey == key && projection.epoch == epoch &&
            original.getString(MediaMetadata.METADATA_KEY_MEDIA_ID) == key && !projection.line?.text.isNullOrBlank()
}
