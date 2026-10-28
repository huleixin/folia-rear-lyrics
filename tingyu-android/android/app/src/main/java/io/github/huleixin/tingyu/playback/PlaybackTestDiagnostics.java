package io.github.huleixin.tingyu.playback;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import io.github.huleixin.tingyu.BuildConfig;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayDeque;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackTestDiagnostics.java
/** Bounded, local-only test journal. Never stores source URLs, cookies or script contents. */
public final class PlaybackTestDiagnostics {
    private static final ArrayDeque<JSONObject> entries=new ArrayDeque<>();
    private static SharedPreferences preferences;
    public static synchronized void initialize(Context context){
        if(!BuildConfig.PLAYBACK_ENGINE_TEST||preferences!=null)return;
        preferences=context.getSharedPreferences("playback_engine_test_v1",Context.MODE_PRIVATE);
        try{JSONArray previous=new JSONArray(preferences.getString("events","[]"));
            for(int i=Math.max(0,previous.length()-96);i<previous.length();i++)entries.add(previous.getJSONObject(i));
        }catch(Exception ignored){}
    }
    public static String redact(String value){
        if(value==null)return "";
        String safe=value.replaceAll("(?i)(https?|file|content)://[^\\s\"'<>]+","[uri]")
            .replaceAll("/(storage|sdcard|data|mnt)/[^\\s\"'<>]+","[path]")
            .replaceAll("(?i)(authorization|cookie)\\s*[:=]\\s*[^\\r\\n]+","$1=[redacted]")
            .replaceAll("(?i)(token|cookie|authorization|password|secret|api[_-]?key)\\s*[:=]\\s*[^\\s,;]+","$1=[redacted]");
        return safe.substring(0,Math.min(360,safe.length()));
    }
    public static synchronized void note(String event,JSONObject details){
        if(!BuildConfig.PLAYBACK_ENGINE_TEST)return;
        entries.add(new JSObject().put("at",System.currentTimeMillis()).put("event",event).put("details",details));
        while(entries.size()>96)entries.removeFirst();
        if(preferences!=null)preferences.edit().putString("events",snapshot().toString()).apply();
    }
    public static void error(String event,Throwable error){
        if(!BuildConfig.PLAYBACK_ENGINE_TEST)return;
        JSONArray causes=new JSONArray();Throwable current=error;
        for(int i=0;i<5&&current!=null;i++,current=current.getCause()){
            JSObject cause=new JSObject().put("type",current.getClass().getName()).put("message",redact(current.getMessage()));
            JSONArray stack=new JSONArray();StackTraceElement[] frames=current.getStackTrace();
            for(int n=0;n<Math.min(6,frames.length);n++)stack.put(frames[n].toString());
            cause.put("stack",stack);causes.put(cause);
        }
        note(event,new JSObject().put("causes",causes));
    }
    public static synchronized JSONArray snapshot(){return new JSONArray(entries);}
}
