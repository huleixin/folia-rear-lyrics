package io.github.huleixin.tingyu.chrome

import kotlin.math.min
import kotlin.math.max

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SettingsSvgViewport.kt
// SVG's default is xMidYMid meet, not stretching a hard-coded 24×24 coordinate space.
internal data class SettingsSvgViewport(val x:Float,val y:Float,val width:Float,val height:Float,val aspect:String="xMidYMid meet") {
    fun placement(width:Float,height:Float):FloatArray {
        val sx=width/this.width;val sy=height/this.height
        if(aspect.trim()=="none")return floatArrayOf(sx,sy,-x*sx,-y*sy)
        val scale=if(aspect.contains("slice"))max(sx,sy)else min(sx,sy)
        val dx=width-this.width*scale;val dy=height-this.height*scale
        val ax=if(aspect.contains("xMin"))0f else if(aspect.contains("xMax"))1f else .5f
        val ay=if(aspect.contains("YMin"))0f else if(aspect.contains("YMax"))1f else .5f
        return floatArrayOf(scale,scale,dx*ax-x*scale,dy*ay-y*scale)
    }
    companion object {
        fun parse(viewBox:String,width:Float,height:Float,aspect:String):SettingsSvgViewport {
            val parts=svgNumbers(viewBox)
            return if(parts.size==4&&parts[2]>0&&parts[3]>0)SettingsSvgViewport(parts[0],parts[1],parts[2],parts[3],aspect)
                else SettingsSvgViewport(0f,0f,width.coerceAtLeast(1f),height.coerceAtLeast(1f),aspect)
        }
    }
}
internal fun svgNumbers(value:String)=Regex("[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?").findAll(value).mapNotNull{it.value.toFloatOrNull()?.takeIf{v->v.isFinite()}}.toList()
