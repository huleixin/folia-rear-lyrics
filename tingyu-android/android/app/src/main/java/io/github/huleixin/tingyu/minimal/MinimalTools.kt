package io.github.huleixin.tingyu.minimal

import org.json.JSONArray
import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/minimal/MinimalTools.kt
//
// 原生工具页（音质 / 效果器 / 歌词工具 / 洛雪音源）的只读投影。
//
// 与 [MinimalQueue] 同一哲学：状态真身在 JS 的 store 里，这里解析的只是一份带版本号的
// 快照；行内动作经命令总线发回 JS，由原来的处理器执行。原生不复制任何业务规则。

/** 音质页的投影。 */
data class MinimalQualityState(
    val current: String = "",
    val currentLabel: String = "",
    val actual: String = "",
    val switching: Boolean = false,
    val error: String = "",
    val local: Boolean = false,
)

/** 效果器页的投影。 */
data class MinimalEffectsState(
    val enabled: Boolean = false,
    val preset: String = "flat",
    val gains: List<Int> = List(10) { 0 },
    /** 与 JS `AUDIO_EFFECT_CONTROLS` 同序：highpass lowpass drive crush wow noise width space punch。 */
    val effectValues: List<Float> = List(9) { 0f },
)

/** 歌词工具页的投影。 */
data class MinimalLyricsState(
    val title: String = "",
    val artist: String = "",
    val local: Boolean = false,
    val navi: Boolean = false,
    val sources: List<Pair<String, String>> = emptyList(), // id to label
    val selected: String = "",
    val offsetMs: Int = 0,
    val busy: Boolean = false,
    val message: String = "",
    val hasOnlineOverride: Boolean = false,
) {
    val selectedSource: String get() = selected
}

/** 洛雪音源页的投影。 */
data class MinimalLxScript(
    val id: String,
    val name: String,
    val meta: String,
    val active: Boolean,
    val caps: List<Pair<String, String>>, // name to qualitys
    val hasUpdateUrl: Boolean = false,
    val canRollback: Boolean = false,
)

data class MinimalLxState(
    val activeName: String = "平台原音源",
    val scripts: List<MinimalLxScript> = emptyList(),
    val busy: Boolean = false,
    val message: String = "",
    val failed: Boolean = false,
    val selectedId: String = "",
    val autoDowngrade: Boolean = true,
    val autoSwitch: Boolean = true,
    val retries: Int = 0,
    val preferredSource: String = "",
    val qualities: List<Pair<String, String>> = emptyList(),
)

data class MinimalTools(
    val version: Long = -1L,
    val page: String = "",
    val quality: MinimalQualityState = MinimalQualityState(),
    val effects: MinimalEffectsState = MinimalEffectsState(),
    val lyrics: MinimalLyricsState = MinimalLyricsState(),
    val lx: MinimalLxState = MinimalLxState(),
) {
    companion object {
        fun parse(value: JSONObject?): MinimalTools? {
            if (value == null) return null
            val version = value.optLong("v", -1L).takeIf { it >= 0 } ?: return null
            val qualityJson = value.optJSONObject("quality")
            val effectsJson = value.optJSONObject("effects")
            val lyricsJson = value.optJSONObject("lyrics")
            val lxJson = value.optJSONObject("lx")
            if (qualityJson == null || effectsJson == null || lyricsJson == null || lxJson == null) return null
            val quality = MinimalQualityState(
                current = qualityJson.optString("current", ""),
                currentLabel = qualityJson.optString("currentLabel", ""),
                actual = qualityJson.optString("actual", ""),
                switching = qualityJson.optBoolean("switching", false),
                error = qualityJson.optString("error", ""),
                local = qualityJson.optBoolean("local", false),
            )
            val gains = JSONArray()
            (0 until 10).forEach { index -> gains.put(effectsJson.optJSONArray("gains")?.optInt(index, 0) ?: 0) }
            val effectValues = JSONArray()
            val effectsRaw = effectsJson.optJSONObject("effects")
            (0 until 9).forEach { index ->
                val key = EFFECT_KEYS[index]
                effectValues.put((effectsRaw?.optDouble(key, 0.0) ?: 0.0).toFloat())
            }
            val effects = MinimalEffectsState(
                enabled = effectsJson.optBoolean("enabled", false),
                preset = effectsJson.optString("preset", "flat"),
                gains = (0 until 10).map { index -> gains.getInt(index) },
                effectValues = (0 until 9).map { index -> effectValues.getDouble(index).toFloat() },
            )
            val sources = ArrayList<Pair<String, String>>()
            val sourcesRaw = lyricsJson.optJSONArray("sources")
            if (sourcesRaw != null) {
                (0 until sourcesRaw.length()).forEach { index ->
                    val row = sourcesRaw.optJSONObject(index) ?: return@forEach
                    sources += row.optString("id", "") to row.optString("label", "")
                }
            }
            val lyrics = MinimalLyricsState(
                title = lyricsJson.optString("title", ""),
                artist = lyricsJson.optString("artist", ""),
                local = lyricsJson.optBoolean("local", false),
                navi = lyricsJson.optBoolean("navi", false),
                sources = sources,
                selected = lyricsJson.optString("selected", ""),
                offsetMs = lyricsJson.optInt("offsetMs", 0),
                busy = lyricsJson.optBoolean("busy", false),
                message = lyricsJson.optString("message", ""),
                hasOnlineOverride = lyricsJson.optBoolean("hasOnlineOverride", false),
            )
            val scripts = ArrayList<MinimalLxScript>()
            val scriptsRaw = lxJson.optJSONArray("scripts")
            if (scriptsRaw != null) {
                (0 until scriptsRaw.length()).forEach { index ->
                    val row = scriptsRaw.optJSONObject(index) ?: return@forEach
                    val caps = ArrayList<Pair<String, String>>()
                    val capsRaw = row.optJSONArray("caps")
                    if (capsRaw != null) {
                        (0 until capsRaw.length()).forEach { capIndex ->
                            val cap = capsRaw.optJSONObject(capIndex) ?: return@forEach
                            caps += cap.optString("name", "") to cap.optString("qualitys", "")
                        }
                    }
                    scripts += MinimalLxScript(
                        id = row.optString("id", ""),
                        name = row.optString("name", ""),
                        meta = row.optString("meta", ""),
                        active = row.optBoolean("active", false),
                        caps = caps,
                        hasUpdateUrl = row.optBoolean("hasUpdateUrl", false),
                        canRollback = row.optBoolean("canRollback", false),
                    )
                }
            }
            val lx = MinimalLxState(
                activeName = lxJson.optString("activeName", "平台原音源"),
                scripts = scripts,
                busy = lxJson.optBoolean("busy", false),
                message = lxJson.optString("message", ""),
                failed = lxJson.optBoolean("failed", false),
                selectedId = lxJson.optString("selectedId", ""),
                autoDowngrade = lxJson.optJSONObject("policy")?.optBoolean("autoDowngrade", true) ?: true,
                autoSwitch = lxJson.optJSONObject("policy")?.optBoolean("autoSwitch", true) ?: true,
                retries = lxJson.optJSONObject("policy")?.optInt("retries", 0) ?: 0,
                preferredSource = lxJson.optJSONObject("policy")?.optString("preferredSource", "") ?: "",
                qualities = lxJson.optJSONArray("qualities")?.let { rows ->
                    (0 until rows.length()).mapNotNull { index ->
                        val row = rows.optJSONObject(index) ?: return@mapNotNull null
                        row.optString("value", "") to row.optString("label", "")
                    }
                } ?: emptyList(),
            )
            return MinimalTools(
                version = version,
                page = value.optString("page", ""),
                quality = quality,
                effects = effects,
                lyrics = lyrics,
                lx = lx,
            )
        }

        /** 与 JS `AUDIO_EFFECT_CONTROLS` 同序的效果参数键。 */
        val EFFECT_KEYS = arrayOf(
            "highpass", "lowpass", "drive", "crush", "wow", "noise", "width", "space", "punch",
        )
    }
}
