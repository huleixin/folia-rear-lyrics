package io.github.huleixin.tingyu.lyrics

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

// Native preferences are authoritative. Visual export omits permissions, enablement and device IDs.
data class DesktopLyricsStyle(
    val doubleLine: Boolean = true, val wordHighlight: Boolean = true,
    val fontSize: Float = 22f, val font: String = "sans",
    val color: String = "#FFFFFF", val highlight: String = "#8FE6C3",
    val opacity: Float = .8f, val outline: Float = 2f,
) {
    fun json() = JSONObject().put("doubleLine", doubleLine).put("wordHighlight", wordHighlight)
        .put("fontSize", fontSize).put("font", font).put("color", color).put("highlight", highlight)
        .put("opacity", opacity).put("outline", outline)
    companion object {
        fun from(value: JSONObject): DesktopLyricsStyle {
            val fallback = DesktopLyricsStyle()
            fun number(key: String, default: Float, min: Float, max: Float) =
                value.optDouble(key, default.toDouble()).toFloat().let { if (it.isFinite()) it.coerceIn(min, max) else default }
            fun color(key: String, default: String) = value.optString(key, default).takeIf { it.matches(Regex("#[0-9a-fA-F]{6}")) } ?: default
            return DesktopLyricsStyle(value.optBoolean("doubleLine", true), value.optBoolean("wordHighlight", true),
                number("fontSize", 22f, 14f, 40f), value.optString("font", "sans").takeIf { it in setOf("sans", "serif", "mono") } ?: "sans",
                color("color", fallback.color), color("highlight", fallback.highlight), number("opacity", .8f, .2f, 1f), number("outline", 2f, 0f, 5f))
        }
    }
}

data class LyricsPreferencesState(
    val desktop: Boolean = false, val locked: Boolean = false, val hideInApp: Boolean = true,
    val x: Float = .5f, val y: Float = .25f, val style: DesktopLyricsStyle = DesktopLyricsStyle(),
    val bluetooth: Boolean = false, val device: String = "",
) {
    fun json() = JSONObject().put("desktop", desktop).put("locked", locked).put("hideInApp", hideInApp)
        .put("x", x).put("y", y).put("style", style.json()).put("bluetooth", bluetooth).put("device", device)
    companion object {
        fun from(value: JSONObject): LyricsPreferencesState {
            fun coordinate(key: String, default: Float) = value.optDouble(key, default.toDouble()).toFloat().let { if (it.isFinite()) it.coerceIn(0f, 1f) else default }
            return LyricsPreferencesState(value.optBoolean("desktop"), value.optBoolean("locked"), value.optBoolean("hideInApp", true),
                coordinate("x", .5f), coordinate("y", .25f), DesktopLyricsStyle.from(value.optJSONObject("style") ?: JSONObject()),
                value.optBoolean("bluetooth"), value.optString("device", "").take(80))
        }
    }
}

class LyricsPreferences private constructor(context: Context) {
    private val disk = context.applicationContext.getSharedPreferences("lyrics-projection", Context.MODE_PRIVATE)
    private val mutable = MutableStateFlow(LyricsPreferencesState.from(runCatching { JSONObject(disk.getString("settings", "{}")!!) }.getOrDefault(JSONObject())))
    val state = mutable.asStateFlow()
    @Synchronized fun update(change: (LyricsPreferencesState) -> LyricsPreferencesState) {
        val next = LyricsPreferencesState.from(change(mutable.value).json())
        disk.edit().putString("settings", next.json().toString()).apply()
        mutable.value = next
    }
    companion object {
        @Volatile private var instance: LyricsPreferences? = null
        @JvmStatic fun get(context: Context): LyricsPreferences = instance ?: synchronized(this) {
            instance ?: LyricsPreferences(context).also { instance = it }
        }
    }
}
