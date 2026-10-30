package io.github.huleixin.tingyu.lx

import org.json.JSONArray
import org.json.JSONObject

// 平台与音质映射 + musicInfo 构造 —— 与 WebView 侧
// src/services/lxSource/selection.ts / contract.ts / musicInfo.ts 逐一对应。
//
// 原生必须自己拼出和 JS 一模一样的 musicInfo，否则脚本拿到的身份不同，
// 取回来的是另一首歌（或者取不到）。
object LxPlatform {

    private val PROVIDER_TO_SOURCE = mapOf(
        "netease" to "wy",
        "qq" to "tx",
        "kugou" to "kg",
        "kuwo" to "kw",
        "migu" to "mg",
    )
    private val SOURCES = setOf("kw", "kg", "tx", "wy", "mg")

    val QUALITIES = arrayOf("128k", "320k", "flac", "flac24bit")

    /** providerId → 洛雪平台 key。不认识就返回 null，绝不猜一个。 */
    fun sourceFor(providerId: String?): String? {
        val value = providerId?.trim()?.lowercase() ?: return null
        if (value.startsWith("lx-")) {
            val source = value.substring(3)
            return source.takeIf { SOURCES.contains(it) }
        }
        return PROVIDER_TO_SOURCE[value]
    }

    /** 偏好音质 → 脚本能给的档位，拿不到就往下降一档（与 chooseLxQuality 同规则）。 */
    fun qualityFor(preference: String?, supported: List<String>): String {
        val target = listOf("standard", "high", "lossless", "hires").indexOf(preference ?: "high").let { if (it < 0) 1 else it }
        for (i in target downTo 0) {
            val candidate = QUALITIES[i]
            if (supported.contains(candidate)) return candidate
        }
        return supported.firstOrNull { QUALITIES.contains(it) } ?: throw IllegalArgumentException("音源不支持任何可用音质")
    }

    /** 把脚本 inited 里声明的 sources 收敛成能力表：只要能取 musicUrl 的平台。 */
    fun validateCapabilities(value: Any?): Map<String, List<String>> {
        val result = LinkedHashMap<String, List<String>>()
        val root = value as? JSONObject ?: return result
        val keys = root.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (!SOURCES.contains(key)) continue
            val item = root.opt(key) as? JSONObject ?: continue
            if (item.optString("type") != "music") continue
            val actions = item.optJSONArray("actions") ?: continue
            var hasMusicUrl = false
            for (i in 0 until actions.length()) if (actions.optString(i) == "musicUrl") hasMusicUrl = true
            if (!hasMusicUrl) continue
            val declared = item.optJSONArray("qualitys")
            val qualitys = ArrayList<String>()
            if (declared != null) {
                for (i in 0 until declared.length()) {
                    val quality = declared.optString(i)
                    if (QUALITIES.contains(quality) && !qualitys.contains(quality)) qualitys.add(quality)
                }
            }
            if (qualitys.isNotEmpty()) result[key] = qualitys
        }
        return result
    }

    /**
     * 脚本要的 musicInfo。字段与 WebView 侧 buildLxMusicInfo 一致：
     * 少了任何一个，依赖它的脚本就会换一条链路或者报错，而不是"取到别的歌"。
     */
    fun musicInfo(
        source: String,
        providerId: String,
        mediaId: String,
        title: String,
        artist: String,
        album: String,
        durationSeconds: Long,
        artwork: String,
        providerData: String,
        qualitys: List<String>,
    ): JSONObject {
        val data = try {
            if (providerData.isBlank()) JSONObject() else JSONObject(providerData)
        } catch (_: Throwable) {
            JSONObject()
        }
        val songmid = firstText(data, "songMid", "songmid", "strMediaMid", "mediaMid") ?: mediaId
        val songId = firstText(data, "songId", "copyrightId") ?: mediaId
        val albumId = firstText(data, "albumId", "albumMid") ?: album
        val strMediaMid = firstText(data, "strMediaMid", "mediaMid") ?: songmid
        val hash = firstText(data, "hash") ?: mediaId
        val types = JSONArray()
        qualitys.forEach { quality ->
            val item = JSONObject().put("type", quality).put("size", JSONObject.NULL)
            if (source == "kg") item.put("hash", hash)
            types.put(item)
        }
        val typeMap = JSONObject()
        qualitys.forEach { quality ->
            val item = JSONObject().put("type", quality).put("size", JSONObject.NULL)
            if (source == "kg") item.put("hash", hash)
            typeMap.put(quality, item)
        }
        val minutes = durationSeconds / 60
        val seconds = durationSeconds % 60
        val interval = "$minutes:" + seconds.toString().padStart(2, '0')
        val info = JSONObject()
            .put("id", mediaId)
            .put("name", title)
            .put("singer", artist)
            .put("source", source)
            .put("songmid", songmid)
            .put("songId", songId)
            .put("strMediaMid", strMediaMid)
            .put("albumId", albumId)
            .put("albumMid", firstText(data, "albumMid") ?: "")
            .put("hash", hash)
            .put("copyrightId", firstText(data, "copyrightId") ?: "")
            .put("interval", interval)
            .put("albumName", album)
            .put("img", artwork)
            .put("types", types)
            .put("_types", typeMap)
            .put("typeUrl", JSONObject())
        val meta = JSONObject()
            .put("songId", songId)
            .put("albumName", album)
            .put("picUrl", artwork)
            .put("qualitys", types)
            .put("_qualitys", typeMap)
            .put("hash", hash)
            .put("strMediaMid", strMediaMid)
            .put("albumMid", firstText(data, "albumMid") ?: "")
            .put("albumId", albumId)
            .put("copyrightId", firstText(data, "copyrightId") ?: "")
        listOf("lrcUrl", "mrcUrl", "trcUrl").forEach { key ->
            val value = firstText(data, key)
            if (!value.isNullOrEmpty()) meta.put(key, value)
        }
        info.put("meta", meta)
        // 音源脚本还会读 providerData 里剩下的原平台字段（例如 kg 的 hash 之外的东西）。
        val keys = data.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (!info.has(key)) info.put(key, data.opt(key))
        }
        return info
    }

    private fun firstText(data: JSONObject, vararg names: String): String? {
        names.forEach { name ->
            val value = data.opt(name)
            if (value != null && value != JSONObject.NULL) {
                val text = value.toString().trim()
                if (text.isNotEmpty()) return text
            }
        }
        return null
    }
}
