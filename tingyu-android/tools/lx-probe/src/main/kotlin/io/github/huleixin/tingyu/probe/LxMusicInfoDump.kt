package io.github.huleixin.tingyu.probe

import io.github.huleixin.tingyu.lx.LxPlatform
import org.json.JSONObject
import java.io.File

// 导出原生侧构造的 musicInfo，供双引擎对照台喂给 WebView 侧执行器。
// 两侧必须用**同一份** musicInfo，否则比出来的差异是"歌曲身份不同"，不是"宿主不同"。
//
// 入参走 JSON 文件而不是命令行：歌名/专辑名有中文，Windows 上 JVM 的参数解码不可靠。
// 用法：musicinfo <spec.json>
//   spec = { source, providerId, mediaId, title, artist, album, seconds, artwork, providerData, qualitys[] }

fun main(args: Array<String>) {
    if (args.isEmpty()) {
        println("usage: musicinfo <spec.json>")
        return
    }
    val spec = JSONObject(File(args[0]).readText())
    val qualitys = spec.optJSONArray("qualitys")?.let { array ->
        (0 until array.length()).mapNotNull { array.optString(it).takeIf { value -> value.isNotBlank() } }
    } ?: emptyList()
    val info = LxPlatform.musicInfo(
        spec.optString("source", "tx"),
        spec.optString("providerId", "qq"),
        spec.optString("mediaId"),
        spec.optString("title"),
        spec.optString("artist"),
        spec.optString("album"),
        spec.optLong("seconds", 0L),
        spec.optString("artwork"),
        spec.optString("providerData"),
        qualitys,
    )
    // 写文件而不是打 stdout：Windows 控制台不是 UTF-8，中文歌名会被打烂。
    val out = args.getOrNull(1)
    if (out.isNullOrBlank()) println(info.toString())
    else File(out).writeText(info.toString(), Charsets.UTF_8)
}
