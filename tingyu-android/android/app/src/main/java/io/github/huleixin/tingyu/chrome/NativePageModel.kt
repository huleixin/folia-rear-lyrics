package io.github.huleixin.tingyu.chrome

import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageModel.kt
data class NativePageItem(val id: String, val title: String, val subtitle: String, val image: String,
    val action: String, val secondary: String, val secondaryLabel: String, val disabled: Boolean, val selected: Boolean,
    val number:String="", val duration:String="")
data class NativePageSection(val id: String, val title: String, val layout: String, val items: List<NativePageItem>,
    val text: String, val value: String, val placeholder: String, val action: String, val submit: String,
    val more: String, val moreLabel: String, val busy: Boolean, val total: Int, val offset: Int, val request: String, val dataKey:String="", val image:String="",
    val description:String="",val creator:String="",val creatorImage:String="")
data class NativePage(val id: String, val session: String, val generation: Long, val revision: Long, val enabled: Boolean,
    val rect: ChromeRect, val viewport: Float, val safeTop: Float, val safeBottom: Float,
    val key: String, val title: String, val subtitle: String, val leading: String, val trailing: String,
    val trailingLabel: String, val home: Boolean, val bottomClearance: Float, val topPadding: Float, val sections: List<NativePageSection>,internal val document:NativeSettingsDocument?=null) {
    val priority get() = when(id) { "settings" -> 4; "search" -> 3; "collection" -> 2; else -> 1 }
    companion object {
        fun parse(value: JSONObject): NativePage {
            require(value.toString().length <= 1_500_000) { "Native page packet too large" }
            val id=value.optString("id");require(id in setOf("home","collection","search","settings"))
            val session=value.optString("session");require(session.length in 1..160)
            fun number(key: String, fallback: Double=0.0): Float = value.optDouble(key,fallback).let { if(it.isFinite())it.toFloat() else fallback.toFloat() }
            val viewport=number("viewportWidth",1.0);require(viewport in 1f..10000f)
            val model=value.getJSONObject("model");val blocks=model.optJSONArray("sections")
            require((blocks?.length()?:0)<=60)
            val sections=(0 until (blocks?.length()?:0)).map { index ->
                val block=blocks!!.getJSONObject(index);val rows=block.optJSONArray("items");require((rows?.length()?:0)<=3000)
                val items=(0 until (rows?.length()?:0)).map { row ->
                    val item=rows!!.getJSONObject(row)
                    NativePageItem(item.optString("id").take(600),item.optString("title").take(500),item.optString("subtitle").take(1000),
                        item.optString("image").take(200000),item.optString("action").take(800),item.optString("secondary").take(800),
                        item.optString("secondaryLabel",""),item.optBoolean("disabled"),item.optBoolean("selected"),item.optString("number"),item.optString("duration"))
                }
                val layout=block.optString("layout");require(layout in setOf("rows","cards","hero","chips","input","message"))
                NativePageSection(block.optString("id"),block.optString("title"),layout,items,block.optString("text"),block.optString("value"),
                    block.optString("placeholder"),block.optString("action"),block.optString("submit"),block.optString("more"),
                    block.optString("moreLabel","加载更多"),block.optBoolean("busy"),block.optInt("total",items.size).coerceIn(0,1000000),
                    block.optInt("offset").coerceAtLeast(0),block.optString("request"),block.optString("key"),block.optString("image"),
                    block.optString("description"),block.optString("creator"),block.optString("creatorImage"))
            }
            fun metric(key: String,fallback:Double)=model.optDouble(key,fallback).let{if(it.isFinite())it.toFloat().coerceIn(0f,1000f)else fallback.toFloat()}
            return NativePage(id,session,value.optLong("generation"),value.optLong("revision"),value.optBoolean("enabled"),
                ChromeRect(number("left"),number("top"),number("width").coerceIn(0f,10000f),number("height").coerceIn(0f,10000f),1f),
                viewport,number("safeTop").coerceIn(0f,200f),number("safeBottom").coerceIn(0f,200f),model.getString("key"),
                model.optString("title"),model.optString("subtitle"),model.optString("leading"),model.optString("trailing"),
                model.optString("trailingLabel"),model.optString("background")=="home",metric("bottomClearance",20.0),metric("topPadding",18.0),sections,
                model.optJSONObject("document")?.let{NativeSettingsDocument.parse(it)})
        }
    }
}
fun interface NativePageActionListener { fun onAction(id: String, session: String, key: String, action: String, text: String, value: Double) }
