package io.github.huleixin.tingyu.chrome

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeShellCache.kt
// Only presentation snapshots are cached: never provider credentials, URLs for audio, or player state ownership.
internal class NativeShellCache(context: Context) {
    private val prefs=context.getSharedPreferences("native_shell_ui_v1",Context.MODE_PRIVATE)
    private val values=mutableMapOf<String,String>()
    // Keep transport snapshots, but do not replay the old settings schema (missing backend controls).
    private fun storageKey(id:String)=if(id=="settings")"settings_design_v2" else id
    init { for(id in listOf("home","library","settings","search","collection","nav","mini","stage"))prefs.getString(storageKey(id),null)?.let{values[id]=it} }
    private fun read(id:String)=runCatching{JSONObject(values[id]?:"")}.getOrNull()
    private fun save(id:String,value:JSONObject){val text=value.toString();if(text.length<=250000&&values[id]!=text){values[id]=text;prefs.edit().putString(storageKey(id),text).apply()}}
    fun page(value:JSONObject){val model=value.optJSONObject("model")?:return;val id=value.optString("id")
        // Queries are already owned by the search-history store; do not create another disk copy.
        val blocks=model.optJSONArray("sections")
        // Persist the initial window only; a scrolled window cannot stand in for the start of a list.
        if((0 until (blocks?.length()?:0)).any{blocks!!.getJSONObject(it).optInt("offset")>0})return
        if(id=="home"||id=="settings")save(if(id=="home"&&model.optString("key").startsWith("library:"))"library"else id,model)
    }
    fun chrome(value:JSONObject){val data=value.optJSONObject("data")?:return;val copy=JSONObject(data.toString());copy.remove("position");save(value.optString("id"),copy)}
    fun page(id:String,width:Float,height:Float,top:Float):NativePage {
        val model=read(id)?:JSONObject().put("key","boot:$id").put("title",when(id){"settings"->"选项";"search"->"搜索";"collection"->"歌单";else->"推荐"})
            .put("trailing",if(id=="home"||id=="library")"sources"else"").put("trailingLabel","音乐来源")
            .put("subtitle",if(id=="home")"为你发现更多音乐"else"").put("background",if(id=="home")"home"else"dark")
            .put("bottomClearance",if(id=="home")152 else 24).put("sections",if(id=="home")JSONArray().put(JSONObject().put("id","hero").put("layout","hero").put("items",JSONArray().apply{
                listOf("guess-you-like" to "猜你\n喜欢","daily-30" to "每日\n三十首","new-releases" to "新歌速递").forEach{(key,title)->put(JSONObject().put("id",key).put("title",title)
                    .put("subtitle","为你发现更多音乐").put("secondaryLabel","正在加载推荐").put("image","file:///android_asset/public/assets/mobile-home/$key.png").put("disabled",true))}
            }))else JSONArray().put(JSONObject().put("id","loading").put("layout","message").put("text","正在读取本机内容…")))
        // Cached controls retain their complete appearance. Boot views have no action
        // listener, so an old presentation can never invoke stale business operations.
        val blocks=model.optJSONArray("sections")
        for(index in 0 until (blocks?.length()?:0)){
            val block=blocks!!.getJSONObject(index);block.put("request","").put("offset",0)
            block.put("total",block.optJSONArray("items")?.length()?:0)
        }
        if(id=="library"&&model.optString("title")=="推荐")model.put("title","资料库")
        return NativePage.parse(frame(if(id=="library")"home"else id,width,height).put("safeTop",top).put("model",model))
    }
    fun chrome(id:String,width:Float,height:Float,bottom:Float=0f,top:Float=0f):ChromeSurface {
        val wide=width>=840;val short=wide&&height<=600;val data=read(id)?:JSONObject()
        data.put("disabled",true).put("playing",false).put("position",0).put("vertical",wide&&id=="nav")
        if(id=="nav")data.put("selected",0).put("labels",JSONObject().put("nav0","推荐").put("nav1","资料库").put("nav2","搜索").put("nav3","设置"))
        if(id=="mini"&&data.optString("title").isBlank())data.put("title","听屿").put("artist","选择一首音乐开始播放")
        val value=frame(id,width,height).put("data",data)
        when(id){
            "nav"->if(wide)value.put("left",if(short)8 else 12).put("top",16+top).put("width",80).put("height",height-32-top)
                else value.put("left",10).put("top",height-62-bottom).put("width",width-20).put("height",54)
            "mini"->value.put("left",if(short)108 else if(wide)116 else 10).put("top",height-(if(short)72 else if(wide)76 else 114)-(if(wide)0f else bottom))
                .put("width",width-(if(short)128 else if(wide)148 else 20)).put("height",if(short)64 else if(wide)62 else 46)
            "stage"->value.put("left",16).put("top",height-148).put("width",width-32).put("height",132)
        }
        return ChromeSurface.parse(value)
    }
    private fun frame(id:String,width:Float,height:Float)=JSONObject().put("id",id).put("session","boot").put("generation",0).put("revision",0)
        .put("enabled",true).put("left",0).put("top",0).put("width",width).put("height",height).put("viewportWidth",width)
}
