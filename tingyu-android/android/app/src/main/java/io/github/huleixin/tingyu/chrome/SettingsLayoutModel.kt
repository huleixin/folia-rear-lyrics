package io.github.huleixin.tingyu.chrome

import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsLayoutModel.kt
// Explicit page composition; source DOM rectangles and CSS are never consumed by Compose.
data class SettingsLayoutStyle(
    val gap: Float = 0f, val padding: List<Float> = emptyList(), val margin: List<Float> = emptyList(),
    val radius: Float = 0f, val columns: Int = 1, val wideColumns: Int = 0, val breakpoint: Float = 1024f,
    val width: Float = 0f, val height: Float = 0f, val minHeight: Float = 0f, val aspect: Float = 0f,
    val grow: Boolean = false, val align: String = "start", val font: Float = 0f, val weight: Int = 0,
    val tone: String = "", val border: Boolean = false, val fill: Boolean = false,
    val center: Boolean = false, val divider: Boolean = false, val preview: String = "",
    val overlay: String = "", val progress: Float = -1f, val stackBelow: Float = 0f, val maxHeight: Float = 0f, val scroll: Boolean = false, val reverse: Boolean = false,
) {
    companion object {
        fun parse(v: JSONObject?): SettingsLayoutStyle {
            if(v == null) return SettingsLayoutStyle()
            fun number(key: String, fallback: Double = 0.0, max: Float = 960f) = v.optDouble(key, fallback).let { if(it.isFinite()) it.toFloat().coerceIn(0f,max) else fallback.toFloat() }
            fun edges(key: String) = v.optJSONArray(key)?.let { a -> (0..3).map { a.optDouble(it).let { n -> if(n.isFinite()) n.toFloat().coerceIn(0f,64f) else 0f } } } ?: emptyList()
            return SettingsLayoutStyle(number("gap",max=40f),edges("padding"),edges("margin"),number("radius",max=64f),
                v.optInt("columns",1).coerceIn(1,8),v.optInt("wideColumns").coerceIn(0,8),number("breakpoint",1024.0,1600f),
                number("width"),number("height"),number("minHeight"),number("aspect",max=4f),v.optBoolean("grow"),v.optString("align","start"),
                number("font",max=40f),v.optInt("weight").let { if(it>0)it.coerceIn(100,900) else 0 },v.optString("tone"),v.optBoolean("border"),v.optBoolean("fill"),
                v.optBoolean("center"),v.optBoolean("divider"),v.optString("preview"),v.optString("overlay"),if(v.has("progress"))number("progress",max=1f)else -1f,number("stackBelow"),number("maxHeight"),v.optBoolean("scroll"),v.optBoolean("reverse"))
        }
    }
}
data class SettingsLayoutNode(
    val id: String, val kind: String, val style: SettingsLayoutStyle,
    val ref: String, val text: String, val icon: String, val children: List<SettingsLayoutNode>, val svg: String = "",
) {
    companion object {
        private val kinds = setOf("column","row","wrap","grid","card","segment","text","icon","control","spacer","break","vector")
        fun parse(value: JSONObject): SettingsLayoutNode {
            var count = 0
            fun read(v: JSONObject, depth: Int): SettingsLayoutNode {
                require(depth <= 32 && ++count <= 6000) { "Settings layout exceeds limits" }
                val kind = v.getString("kind"); require(kind in kinds) { "Unknown settings layout" }
                val raw = v.optJSONArray("children")
                val children = (0 until (raw?.length() ?: 0)).map { read(raw!!.getJSONObject(it), depth+1) }
                return SettingsLayoutNode(v.optString("id").take(160),kind,SettingsLayoutStyle.parse(v.optJSONObject("style")),
                    v.optString("ref").take(120),v.optString("text"),v.optString("icon").take(60),children,v.optString("svg").take(40000))
            }
            return read(value,0)
        }
    }
}
