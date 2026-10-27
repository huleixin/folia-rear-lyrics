package io.github.huleixin.tingyu.chrome

import android.graphics.*
import kotlin.math.*

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsGradient.kt
// Preserve existing linear/radial CSS paints without allocating shaders on scroll frames.
internal fun settingsGradient(css:String,r:SettingRect):Shader?{
    val layers=mutableListOf<String>();var depth=0;var start=0
    css.forEachIndexed{i,c->if(c=='(')depth++;if(c==')')depth--;if(c==','&&depth==0){layers.add(css.substring(start,i));start=i+1}}
    layers.add(css.substring(start));var combined:Shader?=null
    for(layer in layers.asReversed()){
        val matches=Regex("rgba?\\([^)]*\\)(?:\\s+([\\d.]+)%)?").findAll(layer).toList();if(matches.size<2)continue
        val colors=matches.map{settingColor(it.value.substringBeforeLast(')')+")")}.toIntArray()
        val stops=matches.mapIndexed{i,m->m.groupValues.getOrNull(1)?.toFloatOrNull()?.div(100f)?:i.toFloat()/(matches.size-1)}.toFloatArray()
        val shader:Shader=if(layer.contains("radial-gradient")){
            val at=Regex("at\\s+(-?[\\d.]+)%\\s+(-?[\\d.]+)%").find(layer)
            val cx=r.x+r.w*(at?.groupValues?.get(1)?.toFloatOrNull()?.div(100)?:.5f)
            val cy=r.y+r.h*(at?.groupValues?.get(2)?.toFloatOrNull()?.div(100)?:.5f)
            val radius=max(hypot(cx-r.x,cy-r.y),hypot(r.x+r.w-cx,r.y+r.h-cy)).coerceAtLeast(1f)
            RadialGradient(cx,cy,radius,colors,stops,Shader.TileMode.CLAMP)
        }else{
            val angle=Regex("linear-gradient\\(\\s*(-?[\\d.]+)deg").find(layer)?.groupValues?.get(1)?.toFloatOrNull()?:180f
            val dx=sin(angle*PI/180).toFloat();val dy=-cos(angle*PI/180).toFloat();val length=(abs(r.w*dx)+abs(r.h*dy))/2
            val cx=r.x+r.w/2;val cy=r.y+r.h/2
            LinearGradient(cx-dx*length,cy-dy*length,cx+dx*length,cy+dy*length,colors,stops,Shader.TileMode.CLAMP)
        }
        combined=combined?.let{ComposeShader(it,shader,PorterDuff.Mode.SRC_OVER)}?:shader
    }
    return combined
}
