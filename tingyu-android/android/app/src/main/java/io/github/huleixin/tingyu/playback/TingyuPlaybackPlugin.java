package io.github.huleixin.tingyu.playback;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.function.Consumer;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/TingyuPlaybackPlugin.java
@CapacitorPlugin(name="TingyuPlayback")
public final class TingyuPlaybackPlugin extends Plugin {
    // Native audio passed device validation in the 1.3.24 test builds; the empty-buffer fix in
    // PlaybackSpectrumProcessor is what made it playable. The flag stays overridable so a build
    // can still ship WebView-only audio.
    private static final boolean ENABLED = io.github.huleixin.tingyu.BuildConfig.NATIVE_PLAYBACK;
    private NativeAudioEngine engine;
    private JSObject prepared,lastState;
    private final Consumer<JSObject> events=value->{if(!"spectrum".equals(value.optString("type")))lastState=value;notifyListeners("state",value);};
    @Override public void load(){if(ENABLED)PlaybackTestDiagnostics.initialize(getContext());}
    @PluginMethod public void diagnostics(PluginCall call){
        if(!ENABLED){call.reject("Not a playback test build");return;}
        getActivity().runOnUiThread(()->{
            JSObject value=new JSObject().put("testBuild",true).put("packageName",getContext().getPackageName())
                .put("sdk",android.os.Build.VERSION.SDK_INT).put("manufacturer",android.os.Build.MANUFACTURER).put("model",android.os.Build.MODEL)
                .put("appVersion",io.github.huleixin.tingyu.BuildConfig.VERSION_NAME).put("engineVersion","media3-1.11.1").put("events",PlaybackTestDiagnostics.snapshot());
            try{if(engine!=null)value.put("player",engine.snapshot("diagnostics",false));}
            catch(Exception error){PlaybackTestDiagnostics.error("diagnostics-error",error);value.put("snapshotError",PlaybackTestDiagnostics.redact(error.toString()));}
            call.resolve(value);
        });
    }
    @PluginMethod public void resetForTest(PluginCall call){
        if(!ENABLED){call.reject("Not a playback test build");return;}
        getActivity().runOnUiThread(()->{
            try{PlaybackTestDiagnostics.note("reset-start",new JSObject());NativeAudioEngine.releaseIfPresent();
                engine=null;prepared=null;lastState=null;removeAllListeners();
                PlaybackTestDiagnostics.note("reset-complete",new JSObject());call.resolve(new JSObject().put("stopped",true));
            }catch(Exception error){PlaybackTestDiagnostics.error("reset-error",error);call.reject("停止原生播放器失败");}
        });
    }
    @PluginMethod public void probe(PluginCall call){call.resolve(new JSObject().put("supported",ENABLED).put("engine","media3-1.11.1"));}
    @PluginMethod public void command(PluginCall call){
        if(!ENABLED){call.reject("原生播放通道暂未启用");return;}
        getActivity().runOnUiThread(()->{
        try{
            PlaybackTestDiagnostics.note("command",new JSObject().put("action",call.getString("action")).put("sequence",call.getData().optLong("sequence")));
            NativeAudioEngine current=NativeAudioEngine.get(getContext());
            if(current!=engine){
                if(engine!=null)engine.unlisten(events);
                boolean restoring=engine!=null;engine=current;engine.listen(events);
                if(restoring&&prepared!=null&&!"prepare".equals(call.getString("action"))&&prepared.optString("id").equals(call.getString("id"))){
                    JSObject restore=JSObject.fromJSONObject(prepared);
                    restore.put("sequence",call.getData().optLong("sequence"));
                    restore.put("position",lastState==null?0:Math.max(0,lastState.optDouble("position"))*1000);
                    engine.command(restore);
                }
            }
            JSObject result=engine.command(call.getData());
            if(result.optBoolean("accepted")&&"prepare".equals(call.getString("action")))prepared=JSObject.fromJSONObject(call.getData());
            if("detach".equals(call.getString("action"))){prepared=null;lastState=null;}
            call.resolve(result);
        }
        catch(Exception|LinkageError error){PlaybackTestDiagnostics.error("command-error",error);call.reject("原生播放命令失败："+error.getClass().getSimpleName());}
    });}
    @Override protected void handleOnDestroy(){if(engine!=null)engine.unlisten(events);super.handleOnDestroy();}
}
