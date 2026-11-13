package io.github.huleixin.tingyu.lyrics

import android.media.MediaMetadata
import io.github.huleixin.tingyu.minimal.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// Verify the complete Android metadata object. Robolectric does not emulate AVRCP/session IPC.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BluetoothLyricsMetadataTest {
    private fun original() = MediaMetadata.Builder()
        .putString(MediaMetadata.METADATA_KEY_MEDIA_ID, "tx:1")
        .putString(MediaMetadata.METADATA_KEY_TITLE, "Song")
        .putString(MediaMetadata.METADATA_KEY_ARTIST, "Artist")
        .putString(MediaMetadata.METADATA_KEY_ALBUM, "Album")
        .putString(MediaMetadata.METADATA_KEY_ART_URI, "content://cover/1")
        .putString("vendor.lyrics", "original lyric data")
        .putLong(MediaMetadata.METADATA_KEY_DURATION, 180000).build()
    @Test fun projectionPreservesEveryOriginalFieldAndLeavesCanonicalUntouched() {
            val original = original()
            val shown = BluetoothLyricsMetadata.project(original, "Current line")
            assertEquals("Current line", shown.getString(MediaMetadata.METADATA_KEY_TITLE))
            for (key in original.keySet().filter { it != MediaMetadata.METADATA_KEY_TITLE }) {
                if (key == MediaMetadata.METADATA_KEY_DURATION) assertEquals(original.getLong(key), shown.getLong(key))
                else assertEquals(original.getString(key), shown.getString(key))
            }
            assertEquals("Song", original.getString(MediaMetadata.METADATA_KEY_TITLE))
    }
    @Test fun layoutsAndTranslationKeepTheCanonicalCopyUntouched(){
        val original=original()
        val state=MinimalPlayerState(playback=MinimalPlayback(MinimalTrack("tx:1"),epoch="one"),lyrics=MinimalLyrics("tx:1","one",status=MinimalLyricsStatus.READY,lines=listOf(MinimalLyricLine(0.0,10.0,"Line","Translation"),MinimalLyricLine(10.0,20.0,"Next"))))
        val projection=LyricsProjection(state,0)
        fun shown(mode:String,content:String="original")=BluetoothLyricsMetadata.project(original,projection,LyricsPreferencesState(btMode=mode,btContent=content))
        assertEquals("Line",shown("artist").getString(MediaMetadata.METADATA_KEY_ARTIST))
        assertEquals("Song",shown("artist").getString(MediaMetadata.METADATA_KEY_TITLE))
        assertEquals("Line",shown("album").getString(MediaMetadata.METADATA_KEY_ALBUM))
        assertEquals("Song · Artist",shown("title_song").getString(MediaMetadata.METADATA_KEY_ARTIST))
        assertEquals("Next",shown("two_lines").getString(MediaMetadata.METADATA_KEY_ARTIST))
        assertEquals("Translation",shown("title","translation").getString(MediaMetadata.METADATA_KEY_TITLE))
        assertEquals("Line / Translation",shown("title","paired").getString(MediaMetadata.METADATA_KEY_TITLE))
        assertEquals("Artist",original.getString(MediaMetadata.METADATA_KEY_ARTIST))
        assertEquals("Album",original.getString(MediaMetadata.METADATA_KEY_ALBUM))
        assertEquals(180000L,shown("two_lines").getLong(MediaMetadata.METADATA_KEY_DURATION))
    }
    @Test fun preferenceMigrationAndBoundsAreSafe(){
        val settings=LyricsPreferencesState.from(org.json.JSONObject("""{"bluetooth":false,"btMode":"unknown","btIntervalMs":1,"btMaxChars":9000}"""))
        assertEquals("title",settings.btMode);assertEquals(1500,settings.btIntervalMs);assertEquals(180,settings.btMaxChars)
        assertFalse(settings.bluetooth)
        val changed=settings.copy(btMode="album",btContent="paired",btIntervalMs=5000,btMaxChars=64)
        assertEquals(changed,LyricsPreferencesState.from(changed.json()))
    }
    @Test fun missingTranslationFallsBackAndTextLimitNeverSplitsSurrogatePair(){
        val text="a".repeat(31)+"\uD83C\uDFB5"
        val state=MinimalPlayerState(playback=MinimalPlayback(MinimalTrack("tx:1"),epoch="one"),lyrics=MinimalLyrics("tx:1","one",status=MinimalLyricsStatus.READY,lines=listOf(MinimalLyricLine(0.0,10.0,text))))
        val shown=BluetoothLyricsMetadata.project(original(),LyricsProjection(state,0),LyricsPreferencesState(btContent="translation",btMaxChars=32))
        assertEquals("a".repeat(31),shown.getString(MediaMetadata.METADATA_KEY_TITLE))
    }
    @Test fun rejectsOldSongEpochAndMissingLyrics() {
        val state = MinimalPlayerState(
            playback = MinimalPlayback(MinimalTrack("tx:1"), epoch = "one"),
            lyrics = MinimalLyrics("tx:1", "one", status = MinimalLyricsStatus.READY,
                lines = listOf(MinimalLyricLine(0.0, 10.0, "Line"))))
        val projection = LyricsProjection(state, 0)
        assertTrue(BluetoothLyricsMetadata.matches(original(), projection, "tx:1", "one"))
        assertFalse(BluetoothLyricsMetadata.matches(original(), projection, "tx:2", "two"))
        assertFalse(BluetoothLyricsMetadata.matches(original(), projection, "tx:1", "two"))
        assertFalse(BluetoothLyricsMetadata.matches(original(), projection.copy(index = -1), "tx:1", "one"))
    }
}
