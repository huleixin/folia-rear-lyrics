package io.github.huleixin.tingyu.chrome

import org.json.JSONObject
import org.json.JSONArray

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsDocumentModel.kt
data class SettingRect(val x:Float,val y:Float,val w:Float,val h:Float){
    fun contains(px:Float,py:Float)=px>=x&&px<=x+w&&py>=y&&py<=y+h
    companion object{fun parse(v:JSONObject)=SettingRect(v.f("x"),v.f("y"),v.f("w").coerceIn(0f,30000f),v.f("h").coerceIn(0f,30000f))}
}
internal fun JSONObject.f(key:String,default:Double=0.0)=optDouble(key,default).let{if(it.isFinite())it.toFloat() else default.toFloat()}
internal fun JSONArray?.objects()=(0 until (this?.length()?:0)).mapNotNull{this?.optJSONObject(it)}
data class SettingPaint(val rect:SettingRect,val kind:String,val area:String,val clip:SettingRect?,val color:String,val background:String,
    val border:String,val borderWidth:Float,val radius:Float,val opacity:Float,val text:String,val font:Float,val weight:Int,val family:String,val italic:Boolean,val image:String,val svg:String,val gradient:String,val edges:List<Pair<Float,String>>)
data class SettingControl(val id:String,val rect:SettingRect,val kind:String,val area:String,val value:String,val label:String,val disabled:Boolean,
    val min:Float,val max:Float,val step:Float,val inputType:String,val font:Float,val color:String,val multiline:Boolean,val placeholder:String,val padding:List<Float>,val options:List<Pair<String,String>>,val accent:String="",val rangeFill:Boolean=true)
data class SettingArea(val id:String,val rect:SettingRect,val contentHeight:Float,val offset:Int)
data class NativeSettingsDocument(val paints:List<SettingPaint>,val controls:List<SettingControl>,val areas:List<SettingArea>,val live:List<SettingRect>){
    companion object{
        fun parse(v:JSONObject):NativeSettingsDocument{
            val paints=v.optJSONArray("paints").objects();require(paints.size<=14000)
            val controls=v.optJSONArray("controls").objects();require(controls.size<=3000)
            val areas=v.optJSONArray("areas").objects();require(areas.size<=100)
            return NativeSettingsDocument(paints.map{p->SettingPaint(SettingRect.parse(p),p.optString("kind"),p.optString("area"),p.optJSONObject("clip")?.let{SettingRect.parse(it)},
                p.optString("color"),p.optString("background"),p.optString("border"),p.f("borderWidth"),p.f("radius"),p.f("opacity",1.0).coerceIn(0f,1f),
                p.optString("text"),p.f("font",14.0),p.optInt("weight",400),p.optString("family"),p.optBoolean("italic"),p.optString("image"),p.optString("svg"),p.optString("gradient"),
                p.optJSONArray("edges").objects().map{it.f("width") to it.optString("color")} )},
                controls.map{p->SettingControl(p.getString("id"),SettingRect.parse(p),p.getString("kind"),p.optString("area"),p.optString("value"),p.optString("label"),p.optBoolean("disabled"),
                    p.f("min"),p.f("max",100.0),p.f("step",1.0),p.optString("inputType"),p.f("font",14.0),p.optString("color"),p.optBoolean("multiline"),p.optString("placeholder"),
                    (0..3).map{p.optJSONArray("padding")?.optDouble(it,0.0)?.toFloat()?:0f},p.optJSONArray("options").objects().map{it.getString("value") to it.getString("label")},p.optString("accent"),p.optBoolean("rangeFill",true))},
                areas.map{SettingArea(it.getString("id"),SettingRect.parse(it),it.f("contentHeight").coerceIn(0f,2000000f),it.optInt("offset").coerceAtLeast(0))},
                v.optJSONArray("live").objects().map{SettingRect.parse(it)})
        }
    }
}
