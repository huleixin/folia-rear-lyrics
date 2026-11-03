package io.github.huleixin.tingyu.chrome;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TingyuChromePlugin.java
@CapacitorPlugin(name = "TingyuChrome")
public class TingyuChromePlugin extends Plugin {
    private static void traceDispatch(JSObject event) {
        if(NavigationTiming.enabled()||android.util.Log.isLoggable("TingyuNavigation",android.util.Log.DEBUG)) {
            event.put("nativeDispatchedAt",NavigationTiming.epochNow());
            event.put("nativeGestureId",NavigationTiming.gestureId());
            String phase="interactionStart".equals(event.optString("action"))?"compose-press":"interactionEnd".equals(event.optString("action"))?"compose-release":"compose-click";
            NavigationTiming.markGesture(phase,-1);
            NavigationTiming.markGesture("native-action-dispatch",-1);
            android.util.Log.d("TingyuNavigation","native-dispatch at="+System.currentTimeMillis());
        }
    }
    private ComposeChromeHost host;
    private ComposeChromeHost host() {
        if(host==null&&getActivity() instanceof io.github.huleixin.tingyu.MainActivity)
            host=((io.github.huleixin.tingyu.MainActivity)getActivity()).getNativeShell();
        if (host == null) host = new ComposeChromeHost(getBridge().getWebView(), (id,session,action,value) -> {
            JSObject event = new JSObject(); event.put("id",id); event.put("session",session); event.put("action",action); event.put("value",value);
            traceDispatch(event);notifyListeners("action",event);
        });
        host.setListener((id,session,action,value) -> {
            JSObject event=new JSObject();event.put("id",id);event.put("session",session);event.put("action",action);event.put("value",value);traceDispatch(event);notifyListeners("action",event);
        });
        host.setPageListener((id,session,key,action,text,value) -> {
            JSObject event=new JSObject();event.put("id",id);event.put("session",session);event.put("key",key);
            event.put("action",action);event.put("text",text);event.put("value",value);traceDispatch(event);notifyListeners("pageAction",event);
        });
        if(io.github.huleixin.tingyu.BuildConfig.GRAPHICS_DIAGNOSTICS)host.setGraphicsMarkerListener(()->{
            try{notifyListeners("graphicsMark",JSObject.fromJSONObject(host.graphicsSnapshot()).put("at",System.currentTimeMillis()));}
            catch(Exception ignored){}
            return kotlin.Unit.INSTANCE;
        });
        return host;
    }
    @PluginMethod public void navigationDiagnostics(PluginCall call){getActivity().runOnUiThread(()->{
        if(call.getData().has("enabled"))NavigationTiming.configure(getContext(),call.getBoolean("enabled",false));
        try{call.resolve(JSObject.fromJSONObject(NavigationTiming.snapshot()));}catch(Exception e){call.reject("启动诊断读取失败",e);}
    });}
    @PluginMethod public void appearance(PluginCall call) { getActivity().runOnUiThread(() -> {
        try {
            String mode=call.getString("mode");
            if(mode!=null)host().setAppearance(mode);
            call.resolve(appearanceState());
        } catch(Exception error){call.reject(error.getMessage(),error);}
    }); }
    private JSObject appearanceState(){return new JSObject().put("mode",InterfaceAppearance.mode(getContext()))
        .put("systemLight",InterfaceAppearance.systemLight(getContext())).put("light",InterfaceAppearance.light(getContext()));}
    @Override protected void handleOnConfigurationChanged(android.content.res.Configuration config){
        notifyListeners("appearanceChanged",appearanceState());
        InterfaceAppearance.applyBars(getActivity());
    }
    @PluginMethod public void probe(PluginCall call) { getActivity().runOnUiThread(() -> {
        try { call.resolve(JSObject.fromJSONObject(host().status())); }
        catch (Exception error) { call.reject(error.getMessage(),error); }
    }); }
    @PluginMethod public void graphicsProbe(PluginCall call) {
        if(!io.github.huleixin.tingyu.BuildConfig.GRAPHICS_DIAGNOSTICS){call.reject("Graphics diagnostic build required");return;}
        getActivity().runOnUiThread(()->{try{call.resolve(JSObject.fromJSONObject(host().graphicsSnapshot()).put("at",System.currentTimeMillis()));}catch(Exception error){call.reject(error.getMessage(),error);}});
    }
    @PluginMethod public void graphicsConfigure(PluginCall call) {
        if(!io.github.huleixin.tingyu.BuildConfig.GRAPHICS_DIAGNOSTICS){call.reject("Graphics diagnostic build required");return;}
        getActivity().runOnUiThread(()->{try{
            if(!host().graphicsConfigure(call.getString("mode","")))throw new IllegalStateException("Saving experiment failed");
            call.resolve(new JSObject().put("saved",true));
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(()->getActivity().recreate(),300);
        }catch(Exception error){call.reject(error.getMessage(),error);}});
    }
    @PluginMethod public void update(PluginCall call) {
        final PreparedChromeSurface packet;
        try { packet=PreparedChromeSurface.parse(call.getData()); }
        catch(Exception error){call.reject(error.getMessage(),error);return;}
        getActivity().runOnUiThread(() -> {
        try { host().update(packet, result -> {
            try { call.resolve(JSObject.fromJSONObject(result)); }
            catch (Exception error) { call.reject(error.getMessage(),error); }
            return kotlin.Unit.INSTANCE;
        }); }
        // Reject only this packet. Destroying the shell exposes the underlying renderer.
        catch (Exception error) { call.reject(error.getMessage(),error); }
    }); }
    @PluginMethod public void clock(PluginCall call) { getActivity().runOnUiThread(() -> { if (host != null) host.clock(call.getData()); call.resolve(); }); }
    /**
     * 极简播放页的桥帧。
     *
     * <p>只接收 Compose 页**拿不到**的那几项（播放模式、上一首/下一首可用性、浏览器音频通道的位置）。
     * 歌名、时长、歌词和 Media3 位置都不走这里 —— 原生自己有权威来源，多一份副本只会多一个
     * 可能对不上的答案。帧里带 session，宿主据此丢弃换歌前的旧帧。
     */
    @PluginMethod public void minimalPlayerFrame(PluginCall call) {
        final org.json.JSONObject frame = call.getData();
        getActivity().runOnUiThread(() -> {
            try {
                boolean accepted = host != null && host.minimalFrame(frame);
                call.resolve(new JSObject().put("accepted", accepted));
            } catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }
    /** 交还极简页（JS 侧要显示自己的面板时）。session 不匹配则忽略，晚到的 release 拆不掉新会话。 */
    @PluginMethod public void minimalPlayerRelease(PluginCall call) {
        final String session = call.getString("session", "");
        getActivity().runOnUiThread(() -> {
            try { if (host != null) host.minimalRelease(session); call.resolve(); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }
    @PluginMethod public void pageUpdate(PluginCall call) {
        final long parseAt=android.os.SystemClock.elapsedRealtime();
        final PreparedNativePage packet;
        try { packet=PreparedNativePage.parse(call.getData());NavigationTiming.mark("page-packet-parse",android.os.SystemClock.elapsedRealtime()-parseAt); }
        catch(Exception error){call.reject(error.getMessage(),error);return;}
        getActivity().runOnUiThread(() -> {
        NavigationTiming.mark("page-ui-dispatch",android.os.SystemClock.elapsedRealtime()-parseAt);
        try { host().pageUpdate(packet, result -> {
            try { call.resolve(JSObject.fromJSONObject(result)); } catch(Exception error) { call.reject(error.getMessage(),error); }
            return kotlin.Unit.INSTANCE;
        }); } catch(Exception error) { call.reject(error.getMessage(),error); }
    }); }
    @PluginMethod public void pageRemove(PluginCall call) { getActivity().runOnUiThread(() -> {
        if(host!=null)host.pageRemove(call.getString("id",""),call.getString("session",""));call.resolve();
    }); }
    @PluginMethod public void shell(PluginCall call) { getActivity().runOnUiThread(() -> {
        try { host().shell(call.getData());call.resolve(); } catch(Exception error){call.reject(error.getMessage(),error);}
    }); }
    @PluginMethod public void collapseStage(PluginCall call) { getActivity().runOnUiThread(() -> {
        try { host().collapseStage(() -> { call.resolve();return kotlin.Unit.INSTANCE; }); }
        catch(Exception error){call.reject(error.getMessage(),error);}
    }); }
    @PluginMethod public void remove(PluginCall call) { getActivity().runOnUiThread(() -> { if (host != null) host.remove(call.getString("id",""),call.getString("session","")); call.resolve(); }); }
    @Override protected void handleOnPause() { if (host != null) host.suspend(); }
    @Override protected void handleOnResume() { if (host != null) host.resume(); }
    @Override protected void handleOnDestroy() { if (host != null) host.destroy(); host = null; }
}
