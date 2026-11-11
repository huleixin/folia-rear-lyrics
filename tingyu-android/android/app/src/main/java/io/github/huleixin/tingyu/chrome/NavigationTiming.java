package io.github.huleixin.tingyu.chrome;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Build;
import android.os.Looper;
import android.os.SystemClock;
import android.view.FrameMetrics;
import android.view.Window;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NavigationTiming.java
// One opt-in startup timeline. No credentials, routes, labels, URLs or view text.
public final class NavigationTiming {
    private static volatile boolean enabled;
    private static long gesture;
    private static final long originElapsed=SystemClock.elapsedRealtime(), originEpoch=System.currentTimeMillis();
    private static final ArrayList<JSONObject> samples=new ArrayList<>();
    private static final Handler main=new Handler(Looper.getMainLooper());
    private static Window window;
    private static Window.OnFrameMetricsAvailableListener frameListener;
    private static HandlerThread frameThread;
    private static Runnable pulse, stop;
    private static volatile long samplingGeneration;
    private static volatile FrameWindowStats frames = new FrameWindowStats();
    private static volatile long frameWindowStartedAt;
    private NavigationTiming() {}
    public static boolean enabled(){return enabled;}
    public static long epochNow(){return originEpoch+SystemClock.elapsedRealtime()-originElapsed;}
    public static void initialize(Activity activity){
        enabled=activity.getSharedPreferences("navigation_timing",Context.MODE_PRIVATE).getBoolean("enabled",false);
        mark("activity-create-start");
        if(!enabled)return;
        startSampling(activity);
    }
    public static void startSampling(Activity activity){
        stopSampling();
        if(!enabled)return;
        final long generation = samplingGeneration;
        final FrameWindowStats recording = new FrameWindowStats(); frames = recording;
        frameWindowStartedAt = epochNow();
        final float refresh = activity.getWindowManager().getDefaultDisplay().getRefreshRate();
        final long nominalBudget = (long)(1e9 / (refresh > 0 ? refresh : 60));
        final long end=SystemClock.elapsedRealtime()+60000;
        pulse=new Runnable(){long due=SystemClock.uptimeMillis()+100;
            public void run(){if(!enabled||SystemClock.elapsedRealtime()>end)return;
                long lag=SystemClock.uptimeMillis()-due;if(lag>32)mark("main-looper-lag",lag);
                due=SystemClock.uptimeMillis()+100;main.postDelayed(this,100);
            }};
        main.postDelayed(pulse,100);
        window=activity.getWindow();frameThread=new HandlerThread("tingyu-startup-frames");frameThread.start();
        frameListener=new Window.OnFrameMetricsAvailableListener(){boolean first=true;
            public void onFrameMetricsAvailable(Window w,FrameMetrics metrics,int dropped){
                if(!enabled||generation!=samplingGeneration||SystemClock.elapsedRealtime()>end)return;
                long deadline = Build.VERSION.SDK_INT >= 31 ? metrics.getMetric(FrameMetrics.DEADLINE) : nominalBudget;
                recording.add(metrics.getMetric(FrameMetrics.TOTAL_DURATION), deadline > 0 ? deadline : nominalBudget,
                    dropped, metrics.getMetric(FrameMetrics.LAYOUT_MEASURE_DURATION), metrics.getMetric(FrameMetrics.DRAW_DURATION));
                double duration=metrics.getMetric(FrameMetrics.TOTAL_DURATION)/1000000.0;
                if(first||duration>=32){mark(first?"first-app-frame-metric":"slow-app-frame",duration);first=false;}
            }};
        window.addOnFrameMetricsAvailableListener(frameListener,new Handler(frameThread.getLooper()));
        stop=NavigationTiming::stopSampling;main.postDelayed(stop,Math.max(0,end-SystemClock.elapsedRealtime()));
    }
    private static void stopSampling(){
        samplingGeneration++;
        if(pulse!=null)main.removeCallbacks(pulse);if(stop!=null)main.removeCallbacks(stop);
        if(window!=null&&frameListener!=null)window.removeOnFrameMetricsAvailableListener(frameListener);
        if(frameThread!=null)frameThread.quitSafely();window=null;frameListener=null;frameThread=null;
    }
    public static void destroy(){stopSampling();}
    public static void configure(Context context,boolean value){
        context.getSharedPreferences("navigation_timing",Context.MODE_PRIVATE).edit().putBoolean("enabled",value).apply();
        enabled=value;if(!value){stopSampling();frames=new FrameWindowStats();synchronized(NavigationTiming.class){samples.clear();}}
        mark("diagnostics-enabled-next-cold-start");
    }
    public static void mark(String phase){mark(phase,-1);}
    public static synchronized long gestureId(){return gesture;}
    public static synchronized void beginTouch(double queueLag){if(enabled){gesture++;record("touch-received",queueLag,gesture);}}
    public static synchronized void markGesture(String phase,double duration){record(phase,duration,gesture);}
    public static synchronized void mark(String phase,double duration){record(phase,duration,0);}
    public static synchronized void detail(String phase,JSONObject detail){
        if(!enabled)return;
        record(phase,-1,gesture);
        try{samples.get(samples.size()-1).put("detail",detail);}catch(Exception ignored){}
    }
    private static void record(String phase,double duration,long gestureId){
        if(!enabled)return;
        try {JSONObject entry=new JSONObject().put("phase",phase).put("at",epochNow());
            if(duration>=0)entry.put("elapsedMs",duration);
            if(gestureId>0)entry.put("gestureId",gestureId);
            // Preserve the beginning of startup while retaining recent clicks at the tail.
            if(samples.size()>=256)samples.remove(128);samples.add(entry);
        }catch(Exception ignored){}
    }
    public static synchronized JSONObject snapshot(){
        JSONObject result=new JSONObject();try{return result.put("enabled",enabled).put("startedAt",originEpoch)
            .put("nativeNow",epochNow()).put("samples",new JSONArray(samples)).put("samplingWindowMs",60000)
            .put("frames",frames.snapshot())
            .put("frameWindowStartedAt",frameWindowStartedAt).put("frameSamplingActive",frameListener!=null)
            .put("frameEvidence","FrameMetrics describes completed app frames, not physical display presentation");
        }catch(Exception ignored){return result;}
    }
}
