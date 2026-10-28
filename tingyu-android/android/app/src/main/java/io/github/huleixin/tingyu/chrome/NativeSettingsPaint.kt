package io.github.huleixin.tingyu.chrome

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.LinearGradient
import android.graphics.Shader
import android.os.Build

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsPaint.kt
// Native vector/text drawing; paths and fonts are prepared once per discrete form model.
internal fun settingColor(value:String,default:Int=android.graphics.Color.TRANSPARENT):Int=runCatching{
    if(value.startsWith("rgb")){
        val values=Regex("[\\d.]+").findAll(value).map{it.value.toFloat()}.toList()
        android.graphics.Color.argb(((values.getOrNull(3)?:1f)*255).toInt().coerceIn(0,255),values[0].toInt(),values[1].toInt(),values[2].toInt())
    }else android.graphics.Color.parseColor(value)
}.getOrDefault(default)
internal class SettingsDrawing(val node:SettingPaint){
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    private val font=run{
        val base=Typeface.create(if(node.family.contains("monospace"))"monospace"else if(node.family.contains("serif")&&!node.family.contains("sans"))"serif"else"sans-serif",Typeface.NORMAL)
        if(Build.VERSION.SDK_INT>=28)Typeface.create(base,node.weight.coerceIn(1,1000),node.italic)
        else Typeface.create(base,(if(node.weight>=600)Typeface.BOLD else Typeface.NORMAL) or (if(node.italic)Typeface.ITALIC else 0))
    }
    private val vector=if(node.kind=="svg")NativeSettingsSvg(node.svg,node.color)else null
    private val gradient=settingsGradient(node.gradient,node.rect)
    fun draw(canvas:Canvas){
        canvas.save();node.clip?.let{canvas.clipRect(it.x,it.y,it.x+it.w,it.y+it.h)}
        val r=node.rect;paint.reset();paint.isAntiAlias=true;paint.alpha=(node.opacity*255).toInt()
        when(node.kind){
            "box"->{
                val base=settingColor(node.background);paint.color=base;paint.alpha=(android.graphics.Color.alpha(base)*node.opacity).toInt()
                if(gradient!=null){paint.shader=gradient;paint.alpha=(node.opacity*255).toInt()}
                canvas.drawRoundRect(r.x,r.y,r.x+r.w,r.y+r.h,node.radius,node.radius,paint);paint.shader=null
                if(node.edges.size==4&&node.edges.distinct().size>1){node.edges.forEachIndexed{i,(width,color)->if(width>0){
                    paint.style=Paint.Style.STROKE;paint.strokeWidth=width;paint.color=settingColor(color);paint.alpha=(android.graphics.Color.alpha(paint.color)*node.opacity).toInt()
                    when(i){0->canvas.drawLine(r.x,r.y+width/2,r.x+r.w,r.y+width/2,paint);1->canvas.drawLine(r.x+r.w-width/2,r.y,r.x+r.w-width/2,r.y+r.h,paint)
                        2->canvas.drawLine(r.x,r.y+r.h-width/2,r.x+r.w,r.y+r.h-width/2,paint);3->canvas.drawLine(r.x+width/2,r.y,r.x+width/2,r.y+r.h,paint)}
                }}}
                else if(node.borderWidth>0){paint.style=Paint.Style.STROKE;paint.strokeWidth=node.borderWidth;paint.color=settingColor(node.border);paint.alpha=(android.graphics.Color.alpha(paint.color)*node.opacity).toInt();val inset=node.borderWidth/2
                    canvas.drawRoundRect(r.x+inset,r.y+inset,r.x+r.w-inset,r.y+r.h-inset,node.radius,node.radius,paint)}
            }
            "text"->{paint.color=settingColor(node.color);paint.alpha=(android.graphics.Color.alpha(paint.color)*node.opacity).toInt();paint.textSize=node.font;paint.typeface=font
                val fm=paint.fontMetrics;canvas.drawText(node.text,r.x,r.y+(r.h-fm.descent-fm.ascent)/2,paint)}
            "svg"->vector?.draw(canvas,r,node.opacity,paint)
        }
        canvas.restore()
    }
}
