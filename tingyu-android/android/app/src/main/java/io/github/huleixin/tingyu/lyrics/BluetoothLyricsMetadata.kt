package io.github.huleixin.tingyu.lyrics

import android.media.MediaMetadata
import io.github.huleixin.tingyu.minimal.MinimalLyricLine

// BluetoothLyricsMetadata.kt: immutable projections into the one existing media session.
internal object BluetoothLyricsMetadata {
    const val MIN_INTERVAL_MS = 1500L
    private fun clean(value:String,max:Int):String{
        val limited=value.replace(Regex("\\s+")," ").trim().take(max.coerceIn(32,180))
        return if(limited.isNotEmpty()&&Character.isHighSurrogate(limited.last()))limited.dropLast(1)else limited
    }
    private fun line(line:MinimalLyricLine?,settings:LyricsPreferencesState):String{
        if(line==null)return ""
        val translation=line.translation?.takeIf{it.isNotBlank()}
        val text=when(settings.btContent){
            "translation"->translation?:line.text
            "paired"->if(translation!=null)line.text+" / "+translation else line.text
            else->line.text
        }
        return clean(text,settings.btMaxChars)
    }
    fun signature(projection:LyricsProjection,settings:LyricsPreferencesState)=
        listOf(settings.btMode,settings.btContent,settings.btMaxChars.toString(),line(projection.line,settings),if(settings.btMode=="two_lines")line(projection.next,settings)else "").joinToString("|")
    fun project(original:MediaMetadata,projection:LyricsProjection,settings:LyricsPreferencesState):MediaMetadata =
        projectText(original,line(projection.line,settings),line(projection.next,settings),settings.btMode,settings.btMaxChars)
    fun project(original:MediaMetadata,line:String):MediaMetadata=projectText(original,clean(line,180),"","title",180)
    private fun projectText(original:MediaMetadata,current:String,next:String,mode:String,max:Int):MediaMetadata{
        val builder=MediaMetadata.Builder(original)
        fun title(value:String){builder.putString(MediaMetadata.METADATA_KEY_TITLE,value).putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE,value)}
        fun artist(value:String){builder.putString(MediaMetadata.METADATA_KEY_ARTIST,value).putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE,value)}
        when(mode){
            "artist"->artist(current)
            "album"->builder.putString(MediaMetadata.METADATA_KEY_ALBUM,current).putString(MediaMetadata.METADATA_KEY_DISPLAY_DESCRIPTION,current)
            "title_song"->{title(current);artist(clean(listOfNotNull(original.getString(MediaMetadata.METADATA_KEY_TITLE),original.getString(MediaMetadata.METADATA_KEY_ARTIST)).filter{it.isNotBlank()}.joinToString(" · "),max))}
            "two_lines"->{title(current);if(next.isNotBlank())artist(next)}
            else->title(current)
        }
        return builder.build()
    }
    fun matches(original: MediaMetadata?, projection: LyricsProjection, key: String, epoch: String): Boolean =
        original != null && projection.valid && projection.songKey == key && projection.epoch == epoch &&
            original.getString(MediaMetadata.METADATA_KEY_MEDIA_ID) == key && !projection.line?.text.isNullOrBlank()
}
