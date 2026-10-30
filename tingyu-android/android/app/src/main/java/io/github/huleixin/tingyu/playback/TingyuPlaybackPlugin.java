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
    private final Consumer<JSObject> events=value->{if(!"spectrum".equals(value.optString("type")))lastState=value;notifyListeners("state",value,value.optInt("status")==4&&!"spectrum".equals(value.optString("type")));};
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
    /** Always-on playback failure trail (release builds included); entries are anonymous and URL-free. */
    @PluginMethod public void playbackDiagnostics(PluginCall call){
        try{
            PlaybackDiagnostics.initialize(getContext());
            // Critical and routine are returned separately: a merged list lets a retry tick push
            // the failure record out of the window the report prints.
            call.resolve(new JSObject()
                .put("events",PlaybackDiagnostics.snapshot())
                .put("critical",PlaybackDiagnostics.snapshotCritical())
                .put("routine",PlaybackDiagnostics.snapshotRoutine())
                .put("lifecycle",PlaybackLifecycle.snapshot())
                .put("epoch",PlaybackDiagnostics.epoch()));
        }
        catch(Exception error){call.reject("读取播放诊断失败："+error.getClass().getSimpleName());}
    }
    @PluginMethod public void clearPlaybackDiagnostics(PluginCall call){
        try{PlaybackDiagnostics.clear();call.resolve();}catch(Exception error){call.reject("清除播放诊断失败："+error.getClass().getSimpleName());}
    }
    /**
     * 阶段 A：JS 把逻辑歌单交给原生。
     *
     * 只有这一步做完，原生才知道"下一首是谁"。传的是**播放顺序**（随机模式由 JS 洗好牌）、
     * 身份与引用，**不含播放地址** —— 地址会过期，必须现取。
     *
     * 记诊断时只写条数、模式与代次，不写标题/艺术家/任何 URL。
     */
    @PluginMethod public void setNativePlaylist(PluginCall call){
        if(!ENABLED){call.reject("原生播放通道暂未启用");return;}
        try{
            NativePlaylist.Mode mode=parseMode(call.getString("mode"));
            boolean loopAll=Boolean.parseBoolean(String.valueOf(call.getData().opt("loopAll")));
            String quality=call.getString("quality");
            org.json.JSONArray incoming=call.getArray("tracks");
            java.util.List<NativePlaylist.Track> tracks=new java.util.ArrayList<>();
            if(incoming!=null)for(int i=0;i<incoming.length();i++){
                org.json.JSONObject raw=incoming.optJSONObject(i);
                if(raw==null)continue;
                String songKey=raw.optString("songKey","");
                if(songKey.isEmpty())continue;
                tracks.add(new NativePlaylist.Track(songKey,raw.optString("providerId",""),raw.optString("mediaId",""),
                    raw.optString("title",""),raw.optString("artist",""),raw.optString("album",""),
                    raw.optLong("duration",0L),raw.optString("artwork",""),
                    raw.opt("providerData") instanceof org.json.JSONObject
                        ?raw.optJSONObject("providerData").toString():raw.optString("providerData","")));
            }
            if(!quality.isEmpty())QualityPreference.set(quality);
            long generation=NativePlaylist.get().replace(tracks,mode,loopAll,
                android.os.SystemClock.elapsedRealtime(),"webview");
            PlaybackDiagnostics.note("playlist-sync",new JSObject().put("size",tracks.size())
                .put("mode",mode.name().toLowerCase(java.util.Locale.US)).put("loopAll",loopAll)
                .put("generation",generation));
            call.resolve(new JSObject().put("generation",generation).put("size",tracks.size()));
        }
        catch(Exception error){call.reject("同步逻辑歌单失败："+error.getClass().getSimpleName());}
    }
    /** 只改播放模式（用户在界面/通知栏切循环或随机），同样换代次以作废在飞的解析。 */
    @PluginMethod public void setNativePlaylistMode(PluginCall call){
        if(!ENABLED){call.reject("原生播放通道暂未启用");return;}
        try{
            long generation=NativePlaylist.get().setMode(parseMode(call.getString("mode")),
                Boolean.parseBoolean(String.valueOf(call.getData().opt("loopAll"))));
            call.resolve(new JSObject().put("generation",generation));
        }
        catch(Exception error){call.reject("设置播放模式失败："+error.getClass().getSimpleName());}
    }
    /**
     * 阶段 B：把原生解析需要的后端地址与会话交给原生，**只存内存**。
     *
     * 不落盘、不硬编码、不打日志。进程结束即消失 —— 那时 Media3 也没了，存下来没有收益。
     */
    @PluginMethod public void setResolverCredentials(PluginCall call){
        if(!ENABLED){call.reject("原生播放通道暂未启用");return;}
        try{
            String providerId=call.getString("providerId");
            org.json.JSONObject values=call.getObject("values");
            if(providerId==null||providerId.isEmpty()){call.reject("缺少 providerId");return;}
            java.util.Map<String,String> map=new java.util.HashMap<>();
            if(values!=null){
                java.util.Iterator<String> keys=values.keys();
                while(keys.hasNext()){String key=keys.next();map.put(key,String.valueOf(values.opt(key)));}
            }
            io.github.huleixin.tingyu.resolver.ResolverCredentials.configure(providerId,map);
            io.github.huleixin.tingyu.resolver.ResolverRegistry.get().refresh();
            // 诊断只记"配了哪些键"，绝不记值。
            PlaybackDiagnostics.note("resolver-credentials",new JSObject().put("provider",providerId)
                .put("keys",String.join("|",map.keySet())).put("empty",map.isEmpty()));
            call.resolve(new JSObject().put("configured",!map.isEmpty()));
        }
        catch(Exception error){call.reject("配置解析器凭据失败："+error.getClass().getSimpleName());}
    }
    private static NativePlaylist.Mode parseMode(String value){
        if(value==null)return NativePlaylist.Mode.SEQUENCE;
        switch(value){
            case "one":return NativePlaylist.Mode.REPEAT_ONE;
            case "loop":return NativePlaylist.Mode.LOOP_ALL;
            case "shuffle":return NativePlaylist.Mode.SHUFFLE;
            default:return NativePlaylist.Mode.SEQUENCE;
        }
    }
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
