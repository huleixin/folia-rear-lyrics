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
    @PluginMethod public void readPlaybackRecovery(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject live=NativeAudioEngine.peekRecoveryState();
            JSObject tag=live==null?null:NativeAudioEngine.currentTrackTag();
            if(tag!=null){
                NativePlaylist.Track track=NativePlaylist.get().trackFor(live.optString("songKey"));
                if(track!=null){tag.put("providerId",track.providerId).put("mediaId",track.mediaId);
                    try{if(!track.providerData.isEmpty())tag.put("providerData",new org.json.JSONObject(track.providerData));}catch(Exception ignored){}
                }
            }
            PlaybackSessionPersistence p=PlaybackSessionPersistence.get(getContext());
            p.io.execute(() -> { try {
                JSObject out=JSObject.fromJSONObject(p.store.read());
                if(live!=null)out.put("live",live).put("liveTrack",tag).put("liveLoopAll",NativePlaylist.get().loopAll()).put("liveMode",
                    NativePlaylist.get().mode()==NativePlaylist.Mode.SHUFFLE?"shuffle":NativePlaylist.get().mode()==NativePlaylist.Mode.REPEAT_ONE?"one":(NativePlaylist.get().mode()==NativePlaylist.Mode.LOOP_ALL||NativePlaylist.get().loopAll())?"all":"off");
                PlaybackSessionPersistence.note(live!=null?"live-reused":out.optString("status"),live==null?"":live.optString("songKey"));
                if(live==null&&"restored".equals(out.optString("status")))
                    PlaybackSessionPersistence.note("cold-paused-await-user-resolver",out.optJSONObject("snapshot").optString("currentKey"));
                call.resolve(out);
            } catch(Exception error){call.reject("Session snapshot unavailable");} });
        });
    }
    @PluginMethod public void savePlaybackRecovery(PluginCall call) {
        PlaybackSessionPersistence p=PlaybackSessionPersistence.get(getContext());
        org.json.JSONObject snapshot=call.getObject("snapshot");
        getActivity().runOnUiThread(() -> {
            JSObject live=NativeAudioEngine.peekRecoveryState();
            if(snapshot!=null&&live!=null&&live.optString("songKey").equals(snapshot.optString("currentKey"))) {
                try{snapshot.put("positionMs",Math.round(live.optDouble("position")*1000)).put("capturedAt",System.currentTimeMillis());
                    NativePlaylist.Mode mode=NativePlaylist.get().mode();
                    snapshot.put("mode",mode==NativePlaylist.Mode.SHUFFLE?"shuffle":mode==NativePlaylist.Mode.REPEAT_ONE?"one":mode==NativePlaylist.Mode.LOOP_ALL?"all":"off");
                    snapshot.put("loopMode",mode==NativePlaylist.Mode.SHUFFLE?(NativePlaylist.get().loopAll()?"all":"off"):snapshot.optString("mode"));}catch(Exception ignored){}
            }
            p.io.execute(() -> { try {
                String liveKey=NativeAudioEngine.currentKey();
                long revision=p.store.save(snapshot,call.getData().optLong("revision"),liveKey);
                PlaybackSessionPersistence.note("queue-saved",snapshot.optString("currentKey"));
                call.resolve(new JSObject().put("revision",revision));
            }catch(Exception error){PlaybackSessionPersistence.note("save-rejected-"+error.getMessage(),"");call.reject("Session snapshot rejected");} });
        });
    }
    @PluginMethod public void checkpointPlaybackRecovery(PluginCall call) {
        if(NativeAudioEngine.isActive()){call.resolve();return;}
        PlaybackSessionPersistence p=PlaybackSessionPersistence.get(getContext());
        p.io.execute(() -> {try {
            if(!NativeAudioEngine.isActive())p.store.checkpoint(call.getString("songKey",""),call.getData().optLong("positionMs"),true,call.getString("mode","off"),false);
            call.resolve();
        }catch(Exception error){PlaybackSessionPersistence.note("save-failed","");call.reject("Session checkpoint failed");} });
    }
    @PluginMethod public void resourceSnapshot(PluginCall call) {
        PlaylistResourceCache cache = PlaylistResourceCache.get(getContext());
        cache.io.execute(() -> {
            try {
                String token = call.getString("playlistId", "");
                if (token.isEmpty() || token.length() > 100) throw new IllegalArgumentException("snapshot identity");
                if (Boolean.TRUE.equals(call.getBoolean("begin"))) cache.begin(token);
                org.json.JSONArray page = call.getArray("tracks");
                if (page != null) cache.append(token, page, call.getInt("offset", 0), Boolean.TRUE.equals(call.getBoolean("finish")));
                cache.expected(token, call.getInt("total", 0));
                cache.descriptor(token, call.getObject("descriptor"));
                if(call.getBoolean("catalogComplete")!=null)cache.catalogComplete(token,Boolean.TRUE.equals(call.getBoolean("catalogComplete")));
                if (Boolean.TRUE.equals(call.getBoolean("finish"))) cache.prioritizeKey(call.getString("currentKey", ""));
                call.resolve();
            } catch (Exception error) { call.reject("Resource snapshot rejected: " + error.getClass().getSimpleName()); }
        });
    }
    @PluginMethod public void resourceCache(PluginCall call) {
        PlaylistResourceCache cache = PlaylistResourceCache.get(getContext());
        cache.io.execute(() -> {
            try {
                if ("configure".equals(call.getString("action"))) cache.configure(Boolean.TRUE.equals(call.getBoolean("enabled")), Boolean.TRUE.equals(call.getBoolean("wifiOnly")));
                if ("clear".equals(call.getString("action"))) cache.clearDownloadable();
                call.resolve(cache.status().put("containsCurrent",cache.metadata(call.getString("currentKey", ""))!=null));
            } catch (Exception error) { call.reject("Resource cache unavailable"); }
        });
    }
    @PluginMethod public void cacheSongLyrics(PluginCall call) {
        PlaylistResourceCache.get(getContext()).io.execute(() -> {
            try {
            String json = call.getString("lyricInfo", "");
            if (json.isEmpty() || json.length() > 200000) { call.reject("Invalid timeline"); return; }
            UnifiedLyricsStore store = UnifiedLyricsStore.get(getContext());
            String key = call.getString("songKey", "");
            UnifiedLyricsStore.Record old = store.get(key);
            if (old != null && old.hasTimeline() && (old.userChoice || "stage".equals(old.confirmedBy))) {
                if (!old.userChoice && old.renderModel == null && equivalentTimeline(old.json, json))
                    store.attachRenderModel(key, old.json, call.getString("renderModel"));
                call.resolve(); return;
            }
            store.put(key, "ok", json,
                Boolean.TRUE.equals(call.getBoolean("hasTranslation")), Boolean.TRUE.equals(call.getBoolean("hasWordByWord")),
                call.getString("source", "platform-cache"), "stage", false,
                LyricVariantConverter.currentRule(getContext()).id);
            store.attachRenderModel(key, json, call.getString("renderModel"));
            UnifiedLyricsStore.Record selected = store.get(key);
            SongInfoLoader loader = SongInfoLoader.get();
            if (selected != null && selected.hasTimeline() && loader != null && loader.isCurrent(key)) {
                io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.setPending(selected.json, selected.hasTranslation, key, selected.offsetKnown);
                io.github.huleixin.tingyu.coloros.ColorOsLyricBridge.requestRefresh(getContext());
            }
            notifyListeners("resourceReady", new JSObject().put("songKey", key));
            call.resolve();
            } catch(Exception error) { call.reject("Resource timeline cache unavailable"); }
        });
    }
    private static boolean equivalentTimeline(String a, String b) {
        try {
            org.json.JSONObject left=new org.json.JSONObject(a), right=new org.json.JSONObject(b);
            for(String lane:new String[]{"lyric","rawLyric","translationLyric"})
                if(!left.optString(lane).equals(right.optString(lane)))return false;
            return true;
        }catch(Exception error){return false;}
    }
    @PluginMethod public void resourceCandidates(PluginCall call) {
        PlaylistResourceCache cache=PlaylistResourceCache.get(getContext());
        cache.io.execute(() -> { try { call.resolve(cache.platformCandidates()); } catch(Exception error) {call.reject("Resource candidates unavailable");} });
    }
    @PluginMethod public void resourcePlatformResult(PluginCall call) {
        PlaylistResourceCache cache=PlaylistResourceCache.get(getContext());
        cache.io.execute(() -> { try { cache.platformResult(call.getString("songKey", ""), Boolean.TRUE.equals(call.getBoolean("success"))); call.resolve(); } catch(Exception error) { call.reject("Resource result unavailable"); } });
    }
    @PluginMethod public void readSongResources(PluginCall call) {
        PlaylistResourceCache.get(getContext()).io.execute(() -> {
            String key = call.getString("songKey", "");
            UnifiedLyricsStore.Record r = UnifiedLyricsStore.get(getContext()).get(key);
            JSObject out = new JSObject().put("songKey", key);
            if (r != null && r.hasTimeline() && r.offsetKnown) out.put("lyricInfo", r.json)
                .put("hasWordByWord",r.hasWordByWord).put("renderModel", r.renderModel).put("confirmedBy",r.confirmedBy).put("version", r.lyricsHash+"@"+r.revision).put("source",r.sourceId).put("userChoice",r.userChoice);
            PlaybackDiagnostics.note("resource-read", new JSObject().put("song", PlaybackDiagnostics.anonKey(key))
                .put("consumer", "front").put("hit",out.has("lyricInfo")).put("version",r==null?"":r.lyricsHash+"@"+r.revision));
            out.put("metadata",PlaylistResourceCache.get(getContext()).metadata(key));
            call.resolve(out);
        });
    }
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
                .put("lxSource",io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.snapshot())
                .put("epoch",PlaybackDiagnostics.epoch())
                .put("resourceCache",PlaylistResourceCache.get(getContext()).status()));
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
                String providerId=raw.optString("providerId","");
                // 用户选的播放音源（`lx:tx` / `qq-original`）。没有它，原生只能按平台猜，
                // 也就是 1.3.50 把 QQ 原版判给洛雪解析器的原因。
                String sourceId=raw.optString("sourceId","");
                tracks.add(new NativePlaylist.Track(songKey,providerId,raw.optString("mediaId",""),
                    raw.optString("title",""),raw.optString("artist",""),raw.optString("album",""),
                    // 毫秒契约（旧秒值自动迁移），见 PlaylistDuration。
                    PlaylistDuration.read(raw),raw.optString("artwork",""),
                    raw.opt("providerData") instanceof org.json.JSONObject
                        ?raw.optJSONObject("providerData").toString():raw.optString("providerData",""),
                    sourceId));
            }
            if(!quality.isEmpty())QualityPreference.set(quality);
            long generation=NativePlaylist.get().replace(tracks,mode,loopAll,
                android.os.SystemClock.elapsedRealtime(),"webview");
            PlaybackDiagnostics.note("playlist-sync",new JSObject().put("size",tracks.size())
                .put("mode",mode.name().toLowerCase(java.util.Locale.US)).put("loopAll",loopAll)
                .put("generation",generation)
                // 用户选的音源到底是什么：这份统计让"换歌后 resolver 没跟着换"能一眼看出来。
                .put("lxTracks",count(tracks,SourceRouting.Kind.LX))
                .put("originalTracks",count(tracks,SourceRouting.Kind.ORIGINAL))
                .put("unmarkedTracks",count(tracks,SourceRouting.Kind.UNKNOWN)));
            PlaybackSessionPersistence recovery=PlaybackSessionPersistence.get(getContext());
            org.json.JSONArray savedOrder=new org.json.JSONArray();
            for(NativePlaylist.Track t:tracks)savedOrder.put(t.songKey);
            String savedMode=call.getString("mode","off");
            recovery.io.execute(() -> {try{recovery.store.nativeOrder(savedOrder,savedMode,call.getData().optBoolean("loopAll"));}catch(Exception error){PlaybackSessionPersistence.note("save-failed","");}});
            call.resolve(new JSObject().put("generation",generation).put("size",tracks.size()));
            prefetchAfterPlaylistSync(tracks);
        }
        catch(Exception error){call.reject("同步逻辑歌单失败："+error.getClass().getSimpleName());}
    }

    /**
     * 队列一同步就预取当前曲+后两首的歌词与封面，不等 Media3 装载。
     *
     * <p>此前 {@link SongInfoLoader#refresh} 是死代码：预取只发生在 Media3 真实换歌/装载时，
     * 冷启动与低水位窗口下「切歌瞬间无词无图，现场取词期间灵动岛留白」。
     * 逻辑歌单是洗好的播放顺序，lookahead 的答案在任何模式下都确定。
     */
    private static void prefetchAfterPlaylistSync(java.util.List<NativePlaylist.Track> tracks){
        try{
            if(tracks==null||tracks.isEmpty())return;
            SongInfoLoader loader=SongInfoLoader.get();
            if(loader==null)return;
            NativePlaylist playlist=NativePlaylist.get();
            String currentKey=io.github.huleixin.tingyu.playback.NativeAudioEngine.currentKey();
            SongInfo current=currentKey==null||currentKey.isEmpty()
                ?null:SongInfo.fromTrack(playlist.trackFor(currentKey),loader.generation());
            if(current==null)current=SongInfo.fromTrack(tracks.get(0),loader.generation());
            if(current==null)return;
            java.util.List<SongInfo> upcoming=new java.util.ArrayList<>();
            for(int offset=1;upcoming.size()<2&&offset<=tracks.size();offset++){
                NativePlaylist.Track next=playlist.lookahead(current.songKey,offset);
                if(next==null)break;
                SongInfo info=SongInfo.fromTrack(next,loader.generation());
                if(info==null||info.songKey.equals(current.songKey))continue;
                boolean duplicate=false;
                for(SongInfo seen:upcoming)if(seen.songKey.equals(info.songKey)){duplicate=true;break;}
                if(!duplicate)upcoming.add(info);
            }
            loader.refresh(current,upcoming);
            PlaybackDiagnostics.note("songinfo-prefetch",new JSObject()
                .put("current",PlaybackDiagnostics.anonKey(current.songKey))
                .put("upcoming",upcoming.size()));
        }catch(Throwable error){
            // 预取是增值动作：队列同步本身永远不该被它拖累。
            PlaybackDiagnostics.note("songinfo-failure",new JSObject()
                .put("source","playlist-prefetch").put("error",error.getClass().getSimpleName()));
        }
    }
    /** 同步包里各类音源的条数。只是计数，不含标题/地址/凭据。 */
    private static int count(java.util.List<NativePlaylist.Track> tracks, SourceRouting.Kind kind){
        int total=0;
        for(NativePlaylist.Track track:tracks) if(track!=null&&SourceRouting.kindOf(track.sourceId)==kind) total++;
        return total;
    }
    /** 只改播放模式（用户在界面/通知栏切循环或随机），同样换代次以作废在飞的解析。 */
    @PluginMethod public void setNativePlaylistMode(PluginCall call){
        if(!ENABLED){call.reject("原生播放通道暂未启用");return;}
        try{
            long generation=NativePlaylist.get().setMode(parseMode(call.getString("mode")),
                Boolean.parseBoolean(String.valueOf(call.getData().opt("loopAll"))));
            PlaybackSessionPersistence persistence=PlaybackSessionPersistence.get(getContext());
            String savedMode=call.getString("mode","off");
            persistence.io.execute(() -> {try{persistence.store.mode(savedMode,call.getData().optBoolean("loopAll"));}catch(Exception error){PlaybackSessionPersistence.note("save-failed","");}});
            getActivity().runOnUiThread(() -> {
                JSObject state=NativeAudioEngine.peekRecoveryState();
                if(state!=null)persistence.observe(state.optString("songKey"),Math.round(state.optDouble("position")*1000),state.optBoolean("paused"),"mode");
            });
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
    /**
     * 阶段 B（洛雪）：把用户启用的音源脚本交给原生，**由播放进程持有**。
     *
     * 脚本落盘到 app 私有目录，进程被系统杀掉后重新起来也能自己把引擎拉起来 ——
     * 后台取地址不再需要 WebView 先活过来。code 为空表示用户停用了脚本。
     * 绝不记录脚本内容，只记名字与体积。
     */
    @PluginMethod public void setLxScript(PluginCall call){
        if(!ENABLED){call.reject("原生播放通道暂未启用");return;}
        try{
            io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.attach(getContext().getApplicationContext());
            org.json.JSONObject data=call.getData();
            String code=data==null?"":String.valueOf(data.opt("code"));
            boolean installed=io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.install(
                data==null?"":String.valueOf(data.opt("id")),
                data==null?"":String.valueOf(data.opt("name")),
                data==null?"":String.valueOf(data.opt("version")),
                data==null?"":String.valueOf(data.opt("description")),
                data==null?"":String.valueOf(data.opt("author")),
                data==null?"":String.valueOf(data.opt("homepage")),
                "null".equals(code)?"":code);
            // 脚本换了，之前"这首取不到"的判定不再适用：清掉续播的有界预算。
            BackgroundContinuation.get().resetBudgets();
            // 预热：前台就把 QuickJS 拉起来。后台真要取地址时引擎已经是热的，
            // 诊断里也就能看到 started=yes / sources=tx，而不是等到续播失败才发现没起来。
            // 引擎初始化会阻塞，所以放在后台线程，不占主线程。
            Thread warmer=new Thread(() -> {
                boolean started=io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.warmUp();
                org.json.JSONObject snapshot=io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.snapshot();
                PlaybackDiagnostics.note("lx-script-sync",new JSObject()
                    .put("installed",installed)
                    .put("started",started)
                    .put("sources",snapshot.optString("sources",""))
                    .put("version",snapshot.optString("version",""))
                    .put("bytes",code.length()));
            },"tingyu-lx-warmup");
            warmer.setDaemon(true);
            warmer.start();
            call.resolve(new JSObject().put("installed",installed).put("warming",installed));
        }
        catch(Exception error){call.reject("安装音源脚本失败："+error.getClass().getSimpleName());}
    }

    /** 洛雪原生引擎的运行状态，进诊断报告。 */
    @PluginMethod public void lxSourceStatus(PluginCall call){
        try{
            io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.attach(getContext().getApplicationContext());
            call.resolve(new JSObject().put("engine",io.github.huleixin.tingyu.lx.LxRuntimeHost.INSTANCE.snapshot()));
        }catch(Exception error){call.reject("读取音源状态失败："+error.getClass().getSimpleName());}
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
