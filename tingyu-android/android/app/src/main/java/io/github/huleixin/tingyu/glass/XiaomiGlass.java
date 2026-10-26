package io.github.huleixin.tingyu.glass;

import android.content.Context;
import android.content.res.TypedArray;
import android.view.View;
import java.lang.reflect.Method;

// android/app/src/main/java/io/github/huleixin/tingyu/glass/XiaomiGlass.java
// Ordinary app reflection only. No hidden-API exemption, root or system-process injection.
final class XiaomiGlass {
    private final Method glass, radius, background, backgroundRadius, viewMode, pass;
    private final float[] recipe;
    final String detail;
    XiaomiGlass(Context context) {
        Method g = null, r = null, b = null, br = null, v = null, p = null;
        float[] values = null;
        String message;
        try {
            g = View.class.getMethod("setMiGlass", float[].class);
            r = View.class.getMethod("setMiGlassBlurRadius", int.class, int.class);
            b = View.class.getMethod("setMiBackgroundBlurMode", int.class);
            br = View.class.getMethod("setMiBackgroundBlurRadius", int.class);
            v = View.class.getMethod("setMiViewBlurMode", int.class);
            p = View.class.getMethod("setPassWindowBlurEnabled", boolean.class);
            Context systemUi = context.createPackageContext("com.android.systemui", 0);
            int id = systemUi.getResources().getIdentifier("notification_glass_params_normal", "array", "com.android.systemui");
            if (id == 0) throw new IllegalStateException("No system glass recipe");
            TypedArray array = systemUi.getResources().obtainTypedArray(id);
            try {
                values = new float[array.length()];
                for (int i = 0; i < values.length; i++) {
                    values[i] = array.getFloat(i, Float.NaN);
                    if (!Float.isFinite(values[i])) throw new IllegalStateException("Invalid system recipe");
                }
                if (values.length != 42) throw new IllegalStateException("Unrecognized system recipe size " + values.length);
            } finally { array.recycle(); }
            message = "系统玻璃方法和原始材质参数可读取；实际效果以本机预览为准。";
        } catch (Exception error) { values = null; message = "小米系统玻璃暂不可用：" + error.getClass().getSimpleName() + " / " + error.getMessage(); }
        glass = g; radius = r; background = b; backgroundRadius = br; viewMode = v; pass = p; recipe = values; detail = message;
    }
    boolean available() { return recipe != null; }
    void apply(View target, float scale) throws Exception {
        if (!available()) throw new IllegalStateException(detail);
        pass.invoke(target, true);
        background.invoke(target, 1);
        backgroundRadius.invoke(target, Math.round(24 * scale));
        viewMode.invoke(target, 1);
        glass.invoke(target, (Object) recipe.clone());
        radius.invoke(target, Math.round(10 * scale), Math.round(24 * scale));
    }
    void clear(View target) {
        if (!available()) return;
        try {
            radius.invoke(target, 0, 0);
            glass.invoke(target, (Object) new float[42]);
            viewMode.invoke(target, 0); backgroundRadius.invoke(target, 0); background.invoke(target, 0); pass.invoke(target, false);
        } catch (Exception ignored) { }
    }
}
