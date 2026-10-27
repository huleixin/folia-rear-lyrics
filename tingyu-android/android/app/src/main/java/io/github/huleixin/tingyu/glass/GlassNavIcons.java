package io.github.huleixin.tingyu.glass;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.Xml;
import androidx.core.graphics.PathParser;
import org.xmlpull.v1.XmlPullParser;
import java.io.InputStream;

// android/app/src/main/java/io/github/huleixin/tingyu/glass/GlassNavIcons.java
// Reuse Tingyu's existing SVG assets; rasterize each icon once at its actual physical size.
public final class GlassNavIcons {
    public static Drawable load(Context context, String name, boolean active, int size) {
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap); canvas.scale(size / 24f, size / 24f);
        try (InputStream stream = context.getAssets().open("public/assets/tingyu-nav/" + name + (active ? "-active.svg" : "-inactive.svg"))) {
            XmlPullParser xml = Xml.newPullParser(); xml.setInput(stream, "UTF-8");
            while (xml.next() != XmlPullParser.END_DOCUMENT) {
                if (xml.getEventType() != XmlPullParser.START_TAG) continue;
                Path path;
                if ("path".equals(xml.getName())) path = PathParser.createPathFromPathData(xml.getAttributeValue(null, "d"));
                else if ("circle".equals(xml.getName())) {
                    path = new Path(); path.addCircle(number(xml, "cx", 0), number(xml, "cy", 0), number(xml, "r", 0), Path.Direction.CW);
                } else continue;
                if ("evenodd".equals(xml.getAttributeValue(null, "fill-rule"))) path.setFillType(Path.FillType.EVEN_ODD);
                Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
                String fill = xml.getAttributeValue(null, "fill"), stroke = xml.getAttributeValue(null, "stroke");
                if (fill != null && !"none".equals(fill)) {
                    paint.setStyle(Paint.Style.FILL); paint.setColor(Color.parseColor(fill)); canvas.drawPath(path, paint);
                }
                if (stroke != null && !"none".equals(stroke)) {
                    paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(number(xml, "stroke-width", 1));
                    paint.setStrokeCap(Paint.Cap.ROUND); paint.setColor(Color.parseColor(stroke)); canvas.drawPath(path, paint);
                }
            }
        } catch (Exception ignored) { }
        Drawable drawable = new BitmapDrawable(context.getResources(), bitmap); drawable.setBounds(0, 0, size, size); return drawable;
    }
    private static float number(XmlPullParser xml, String key, float fallback) {
        String value = xml.getAttributeValue(null, key); return value == null ? fallback : Float.parseFloat(value);
    }
}
