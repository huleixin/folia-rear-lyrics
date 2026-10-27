package io.github.huleixin.tingyu.chrome

import android.graphics.Paint
import android.graphics.Path
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.core.graphics.PathParser
import io.github.huleixin.tingyu.R
import org.json.JSONObject

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageIcon.kt
// Geometry is exported from the same bundled Lucide icons used by the original pages.
private var definitions:JSONObject?=null
@Composable internal fun PageIcon(name:String,color:Color,modifier:Modifier,filled:Boolean=false) {
    val context=LocalContext.current
    val paths=remember(name){
        val root=definitions?:context.resources.openRawResource(R.raw.native_page_icons).bufferedReader().use{JSONObject(it.readText())}.also{definitions=it}
        val nodes=root.optJSONArray(name)
        (0 until (nodes?.length()?:0)).map { index ->
            val node=nodes!!.getJSONArray(index);val a=node.getJSONObject(1)
            fun number(key:String,default:Double=0.0)=a.optDouble(key,default).toFloat()
            Path().apply { when(node.getString(0)) {
                "path" -> PathParser.createPathFromPathData(a.getString("d"))?.let{set(it)}
                "circle" -> addCircle(number("cx"),number("cy"),number("r"),Path.Direction.CW)
                "ellipse" -> addOval(number("cx")-number("rx"),number("cy")-number("ry"),number("cx")+number("rx"),number("cy")+number("ry"),Path.Direction.CW)
                "rect" -> addRoundRect(number("x"),number("y"),number("x")+number("width"),number("y")+number("height"),number("rx"),number("ry",a.optDouble("rx",0.0)),Path.Direction.CW)
                "line" -> {moveTo(number("x1"),number("y1"));lineTo(number("x2"),number("y2"))}
                "polyline","polygon" -> {
                    val points=a.optString("points").trim().split(Regex("[ ,]+")).mapNotNull{it.toFloatOrNull()}
                    points.chunked(2).filter{it.size==2}.forEachIndexed{i,p->if(i==0)moveTo(p[0],p[1])else lineTo(p[0],p[1])}
                    if(node.getString(0)=="polygon")close()
                }
            } }
        }
    }
    val paint=remember { Paint(Paint.ANTI_ALIAS_FLAG).apply{style=Paint.Style.STROKE;strokeWidth=2f;strokeCap=Paint.Cap.ROUND;strokeJoin=Paint.Join.ROUND} }
    Canvas(modifier){drawIntoCanvas { canvas ->
        paint.color=color.toArgb();paint.style=if(filled)Paint.Style.FILL_AND_STROKE else Paint.Style.STROKE;val native=canvas.nativeCanvas;native.save();native.scale(size.width/24f,size.height/24f)
        paths.forEach{native.drawPath(it,paint)};native.restore()
    }}
}
