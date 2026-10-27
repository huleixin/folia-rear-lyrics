package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeModel.kt
// Geometry is CSS pixels until the host applies WebView scale; business state stays in the existing player.
data class ChromeRect(val left: Float, val top: Float, val width: Float, val height: Float, val alpha: Float)
data class ChromeTimeline(val position: Double, val duration: Double, val playing: Boolean, val receivedAt: Long) {
    // A missing renderer heartbeat never leaves an independently advancing native player clock.
    fun at(now: Long): Double = (position + if (playing) (now - receivedAt).coerceIn(0, 2500) / 1000.0 else 0.0)
        .coerceIn(0.0, max(0.0, duration))
}
data class ChromeSurface(
    val id: String, val session: String, val generation: Long, val revision: Long,
    val rect: ChromeRect, val viewportWidth: Float, val enabled: Boolean,
    val title: String, val artist: String, val cover: String, val trackKey: String,
    val playing: Boolean, val disabled: Boolean, val canNext: Boolean, val canPrevious: Boolean,
    val duration: Double, val position: Double, val selected: Int, val loop: String,
    val light: Boolean, val reducedMotion: Boolean, val accent: String, val ink: String,
    val labels: Map<String, String>, val vertical: Boolean
) {
    fun label(key: String, fallback: String) = labels[key]?.takeIf { it.isNotBlank() } ?: fallback
    companion object {
        fun parse(value: JSONObject): ChromeSurface {
            val id = value.optString("id")
            require(id in setOf("nav", "mini", "stage")) { "Unknown native control surface" }
            val session = value.optString("session"); require(session.length in 1..160)
            fun finite(key: String, fallback: Double = 0.0): Double = value.optDouble(key, fallback).let { if (it.isFinite()) it else fallback }
            val viewport = finite("viewportWidth", 1.0).toFloat(); require(viewport in 1f..10000f)
            val data = value.optJSONObject("data") ?: JSONObject()
            val labels = data.optJSONObject("labels") ?: JSONObject()
            fun seconds(key: String) = data.optDouble(key, 0.0).let { if (it.isFinite()) it.coerceIn(0.0, 604800.0) else 0.0 }
            return ChromeSurface(id, session, value.optLong("generation"), value.optLong("revision"),
                ChromeRect(finite("left").toFloat(), finite("top").toFloat(), finite("width").coerceIn(0.0,10000.0).toFloat(),
                    finite("height").coerceIn(0.0,10000.0).toFloat(), finite("alpha",1.0).coerceIn(0.0,1.0).toFloat()),
                viewport, value.optBoolean("enabled"), data.optString("title").take(300), data.optString("artist").take(300),
                data.optString("cover").take(200000), data.optString("trackKey").take(400), data.optBoolean("playing"), data.optBoolean("disabled"),
                data.optBoolean("canNext"), data.optBoolean("canPrevious"), seconds("duration"), seconds("position"),
                data.optInt("selected",0).coerceIn(-1,3), data.optString("loop","off"), data.optBoolean("light"), data.optBoolean("reducedMotion"),
                data.optString("accent","#86d8b8"), data.optString("ink","#fffdf6"),
                labels.keys().asSequence().associateWith { labels.optString(it).take(120) }, data.optBoolean("vertical"))
        }
    }
}
fun interface ChromeActionListener { fun onAction(id: String, session: String, action: String, value: Double) }
