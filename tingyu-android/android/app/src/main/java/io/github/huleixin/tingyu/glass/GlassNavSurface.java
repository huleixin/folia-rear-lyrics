package io.github.huleixin.tingyu.glass;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.JSArray;

// android/app/src/main/java/io/github/huleixin/tingyu/glass/GlassNavSurface.java
final class GlassNavSurface {
    private static final String[] ICONS = { "recommend", "library", "search", "settings" };
    static void decorate(FrameLayout surface, float scale) {
        GradientDrawable tint = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
            new int[] { Color.argb(135, 21, 34, 32), Color.argb(150, 11, 20, 19) });
        tint.setCornerRadius(28 * scale); tint.setStroke(Math.max(1, Math.round(scale)), Color.argb(40, 255, 255, 255));
        surface.setBackground(tint); surface.setClipToOutline(true);
        surface.setOutlineProvider(new ViewOutlineProvider() {
            @Override public void getOutline(View view, Outline outline) { outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), 28 * scale); }
        });
    }
    static void buttons(Context context, FrameLayout surface, float scale, JSArray labels, int selected, java.util.function.IntConsumer navigate) {
        surface.removeAllViews();
        LinearLayout row = new LinearLayout(context); row.setGravity(Gravity.CENTER); row.setPadding(Math.round(6*scale), Math.round(6*scale), Math.round(6*scale), Math.round(6*scale));
        for (int i = 0; i < ICONS.length; i++) {
            int index = i;
            TextView button = new TextView(context); button.setGravity(Gravity.CENTER);
            button.setText(labels.optString(i)); button.setContentDescription(labels.optString(i)); button.setSelected(i == selected);
            button.setTextColor(i == selected ? Color.rgb(172,230,203) : Color.rgb(216,225,220));
            button.setTextSize(TypedValue.COMPLEX_UNIT_PX, 10 * scale);
            button.setCompoundDrawables(null, GlassNavIcons.load(context, ICONS[i], i == selected, Math.round(24*scale)), null, null);
            button.setCompoundDrawablePadding(Math.round(3*scale));
            if (i == selected) {
                GradientDrawable highlight = new GradientDrawable(); highlight.setColor(Color.argb(23,255,255,255)); highlight.setCornerRadius(21*scale);
                highlight.setStroke(Math.max(1,Math.round(scale)),Color.argb(25,255,255,255)); button.setBackground(highlight);
            }
            button.setOnClickListener(v -> navigate.accept(index));
            row.addView(button, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1));
        }
        surface.addView(row, new FrameLayout.LayoutParams(-1, -1));
    }
}
