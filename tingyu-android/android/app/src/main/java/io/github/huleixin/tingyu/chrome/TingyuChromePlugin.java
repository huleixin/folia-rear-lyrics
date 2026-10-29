package io.github.huleixin.tingyu.chrome;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/TingyuChromePlugin.java
@CapacitorPlugin(name = "TingyuChrome")
public class TingyuChromePlugin extends Plugin {
    private ComposeChromeHost host;
    private ComposeChromeHost host() {
        if(host==null&&getActivity() instanceof io.github.huleixin.tingyu.MainActivity)
            host=((io.github.huleixin.tingyu.MainActivity)getActivity()).getNativeShell();
        if (host == null) host = new ComposeChromeHost(getBridge().getWebView(), (id,session,action,value) -> {
            JSObject event = new JSObject(); event.put("id",id); event.put("session",session); event.put("action",action); event.put("value",value);
            notifyListeners("action",event);
        });
        host.setListener((id,session,action,value) -> {
            JSObject event=new JSObject();event.put("id",id);event.put("session",session);event.put("action",action);event.put("value",value);notifyListeners("action",event);
        });
        host.setPageListener((id,session,key,action,text,value) -> {
            JSObject event=new JSObject();event.put("id",id);event.put("session",session);event.put("key",key);
            event.put("action",action);event.put("text",text);event.put("value",value);notifyListeners("pageAction",event);
        });
        if(io.github.huleixin.tingyu.BuildConfig.GRAPHICS_DIAGNOSTICS)host.setGraphicsMarkerListener(()->{
            try{notifyListeners("graphicsMark",JSObject.fromJSONObject(host.graphicsSnapshot()).put("at",System.currentTimeMillis()));}
            catch(Exception ignored){}
            return kotlin.Unit.INSTANCE;
        });
        return host;
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
    @PluginMethod public void pageUpdate(PluginCall call) {
        final PreparedNativePage packet;
        try { packet=PreparedNativePage.parse(call.getData()); }
        catch(Exception error){call.reject(error.getMessage(),error);return;}
        getActivity().runOnUiThread(() -> {
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
