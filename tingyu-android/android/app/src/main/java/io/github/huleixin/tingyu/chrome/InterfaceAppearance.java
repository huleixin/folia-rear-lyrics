package io.github.huleixin.tingyu.chrome;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import androidx.core.view.WindowCompat;

/** Native startup mirror of the JS preference, never a second user-facing setting. */
public final class InterfaceAppearance {
    private static final String PREFS = "tingyu_interface_appearance_v1";
    private static boolean stage;
    private static boolean stageLight;
    private InterfaceAppearance() {}
    public static boolean valid(String mode) { return "system".equals(mode)||"light".equals(mode)||"dark".equals(mode); }
    public static boolean resolve(String mode, boolean systemLight) { return "system".equals(mode) ? systemLight : "light".equals(mode); }
    public static String mode(Context context) {
        try {String mode=context.getSharedPreferences(PREFS,0).getString("mode","dark");return valid(mode)?mode:"dark";}
        catch(ClassCastException invalid){return "dark";}
    }
    public static String style(Context context) {
        try {return InterfaceThemes.INSTANCE.resolve(context.getSharedPreferences(PREFS,0).getString("style","classic"));}
        catch(ClassCastException invalid){return "classic";}
    }
    public static int launchTheme(Context context) {return InterfaceThemes.INSTANCE.launchTheme(style(context),mode(context));}
    public static boolean systemLight(Context context) { return (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_NO; }
    public static boolean light(Context context) { return resolve(mode(context),systemLight(context)); }
    public static void save(Context context,String mode) {save(context,mode,style(context));}
    public static void save(Context context,String mode,String style) {
        if(!valid(mode))throw new IllegalArgumentException("Invalid interface appearance");
        context.getSharedPreferences(PREFS,0).edit().putString("mode",mode).putString("style",InterfaceThemes.INSTANCE.resolve(style)).apply();
        if(context instanceof Activity && android.os.Build.VERSION.SDK_INT>=31){
            int theme=launchTheme(context);
            try { ((Activity)context).getSplashScreen().setSplashScreenTheme(theme); }
            catch(RuntimeException unavailable) {android.util.Log.w("TingyuAppearance","Starting-window theme unavailable",unavailable);}
        }
    }
    public static void route(Activity activity,boolean isStage,boolean lightStage) {
        stage=isStage;stageLight=lightStage;applyBars(activity);
    }
    public static void applyBars(Activity activity) {
        if(!(activity instanceof io.github.huleixin.tingyu.MainActivity))return;
        boolean light=stage ? stageLight : light(activity);
        androidx.core.view.WindowInsetsControllerCompat bars=WindowCompat.getInsetsController(activity.getWindow(),activity.getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(light);
        bars.setAppearanceLightNavigationBars(light);
    }
}
