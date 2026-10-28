package io.github.huleixin.tingyu.playback;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.function.Consumer;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/TingyuPlaybackPlugin.java
@CapacitorPlugin(name="TingyuPlayback")
public final class TingyuPlaybackPlugin extends Plugin {
    // Keep cached 1.3.23 Web bundles on the verified playback path as well.
    // Re-enable only after native audio has passed device playback validation.
    private static final boolean ENABLED = false;
    private NativeAudioEngine engine;
    private JSObject prepared,lastState;
    private final Consumer<JSObject> events=value->{if(!"spectrum".equals(value.optString("type")))lastState=value;notifyListeners("state",value);};
    @PluginMethod public void probe(PluginCall call){call.resolve(new JSObject().put("supported",ENABLED).put("engine","media3-1.11.1"));}
    @PluginMethod public void command(PluginCall call){
        if(!ENABLED){call.reject("原生播放通道暂未启用");return;}
        getActivity().runOnUiThread(()->{
        try{
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
        catch(Exception error){call.reject("原生播放命令失败："+error.getClass().getSimpleName());}
    });}
    @Override protected void handleOnDestroy(){if(engine!=null)engine.unlisten(events);super.handleOnDestroy();}
}
