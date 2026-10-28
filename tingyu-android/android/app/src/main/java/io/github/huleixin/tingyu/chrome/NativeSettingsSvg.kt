package io.github.huleixin.tingyu.chrome

import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.util.Xml
import androidx.core.graphics.PathParser
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeSettingsSvg.kt
// Prepared paths retain viewBox, inherited fill/stroke, group transforms and opacity.
internal class NativeSettingsSvg(xml:String,private val color:String) {
    private data class Style(val fill:String="black",val stroke:String="none",val width:Float=1f,val alpha:Float=1f,
        val fillAlpha:Float=1f,val strokeAlpha:Float=1f,val cap:Paint.Cap=Paint.Cap.BUTT,val join:Paint.Join=Paint.Join.MITER,val evenOdd:Boolean=false)
    private data class Group(val matrix:Matrix,val style:Style)
    private data class Vector(val path:Path,val group:Group)
    private var viewport=SettingsSvgViewport(0f,0f,24f,24f)
    private val vectors=mutableListOf<Vector>()
    init { runCatching {
        val parser=Xml.newPullParser();parser.setInput(StringReader(xml));val groups=ArrayDeque<Group>();var event=parser.eventType
        while(event!=XmlPullParser.END_DOCUMENT){
            if(event==XmlPullParser.START_TAG){
                fun attr(name:String)=parser.getAttributeValue(null,name)
                fun num(name:String,default:Float=0f)=attr(name)?.let{svgNumbers(it).firstOrNull()}?:default
                val parent=groups.lastOrNull()?:Group(Matrix(),Style())
                val old=parent.style
                val style=old.copy(fill=attr("fill")?:old.fill,stroke=attr("stroke")?:old.stroke,width=num("stroke-width",old.width),
                    alpha=old.alpha*num("opacity",1f),fillAlpha=num("fill-opacity",old.fillAlpha),strokeAlpha=num("stroke-opacity",old.strokeAlpha),
                    cap=attr("stroke-linecap")?.let{when(it){"round"->Paint.Cap.ROUND;"square"->Paint.Cap.SQUARE;else->Paint.Cap.BUTT}}?:old.cap,
                    join=attr("stroke-linejoin")?.let{when(it){"round"->Paint.Join.ROUND;"bevel"->Paint.Join.BEVEL;else->Paint.Join.MITER}}?:old.join,
                    evenOdd=attr("fill-rule")?.let{it=="evenodd"}?:old.evenOdd)
                val matrix=Matrix(parent.matrix);attr("transform")?.let{matrix.preConcat(svgTransform(it))}
                val group=Group(matrix,style);groups.addLast(group)
                if(parser.name=="svg"&&groups.size==1)viewport=SettingsSvgViewport.parse(attr("viewBox")?:"",num("width",24f),num("height",24f),attr("preserveAspectRatio")?:"xMidYMid meet")
                val path=Path()
                when(parser.name){
                    "path"->attr("d")?.let{PathParser.createPathFromPathData(it)?.let(path::set)}
                    "circle"->path.addCircle(num("cx"),num("cy"),num("r"),Path.Direction.CW)
                    "ellipse"->path.addOval(num("cx")-num("rx"),num("cy")-num("ry"),num("cx")+num("rx"),num("cy")+num("ry"),Path.Direction.CW)
                    "rect"->path.addRoundRect(num("x"),num("y"),num("x")+num("width"),num("y")+num("height"),num("rx",num("ry")),num("ry",num("rx")),Path.Direction.CW)
                    "line"->{path.moveTo(num("x1"),num("y1"));path.lineTo(num("x2"),num("y2"))}
                    "polyline","polygon"->{svgNumbers(attr("points")?:"").chunked(2).forEachIndexed{i,p->if(p.size==2){if(i==0)path.moveTo(p[0],p[1])else path.lineTo(p[0],p[1])}};if(parser.name=="polygon")path.close()}
                }
                if(!path.isEmpty){path.fillType=if(style.evenOdd)Path.FillType.EVEN_ODD else Path.FillType.WINDING;vectors.add(Vector(path,group))}
            } else if(event==XmlPullParser.END_TAG&&groups.isNotEmpty())groups.removeLast()
            event=parser.next()
        }
    }.onFailure{vectors.clear()} }
    fun draw(canvas:Canvas,r:SettingRect,opacity:Float,paint:Paint){
        canvas.save();canvas.clipRect(r.x,r.y,r.x+r.w,r.y+r.h);canvas.translate(r.x,r.y)
        val fit=viewport.placement(r.w,r.h);canvas.translate(fit[2],fit[3]);canvas.scale(fit[0],fit[1])
        vectors.forEach{v->canvas.save();canvas.concat(v.group.matrix);val s=v.group.style
            paint.strokeWidth=s.width;paint.strokeCap=s.cap;paint.strokeJoin=s.join
            fun part(value:String,alpha:Float,mode:Paint.Style){if(value!="none"){
                paint.style=mode;paint.color=settingColor(if(value.equals("currentColor",true))color else value)
                paint.alpha=(android.graphics.Color.alpha(paint.color)*opacity*s.alpha*alpha).toInt().coerceIn(0,255);canvas.drawPath(v.path,paint)
            }}
            part(s.fill,s.fillAlpha,Paint.Style.FILL);part(s.stroke,s.strokeAlpha,Paint.Style.STROKE);canvas.restore()
        };canvas.restore()
    }
}
private fun svgTransform(value:String):Matrix {
    val matrix=Matrix()
    Regex("([a-zA-Z]+)\\s*\\(([^)]*)\\)").findAll(value).forEach{match->
        val n=svgNumbers(match.groupValues[2]);val part=Matrix()
        when(match.groupValues[1]){
            "matrix"->if(n.size==6)part.setValues(floatArrayOf(n[0],n[2],n[4],n[1],n[3],n[5],0f,0f,1f))
            "translate"->if(n.isNotEmpty())part.setTranslate(n[0],n.getOrElse(1){0f})
            "scale"->if(n.isNotEmpty())part.setScale(n[0],n.getOrElse(1){n[0]})
            "rotate"->if(n.isNotEmpty())part.setRotate(n[0],n.getOrElse(1){0f},n.getOrElse(2){0f})
            "skewX"->if(n.isNotEmpty())part.setSkew(kotlin.math.tan(Math.toRadians(n[0].toDouble())).toFloat(),0f)
            "skewY"->if(n.isNotEmpty())part.setSkew(0f,kotlin.math.tan(Math.toRadians(n[0].toDouble())).toFloat())
        };matrix.preConcat(part)
    };return matrix
}
