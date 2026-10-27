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
        if (host == null) host = new ComposeChromeHost(getBridge().getWebView(), (id,session,action,value) -> {
            JSObject event = new JSObject(); event.put("id",id); event.put("session",session); event.put("action",action); event.put("value",value);
            notifyListeners("action",event);
        });
        return host;
    }
    @PluginMethod public void probe(PluginCall call) { getActivity().runOnUiThread(() -> {
        try { call.resolve(JSObject.fromJSONObject(host().status())); }
        catch (Exception error) { call.reject(error.getMessage(),error); }
    }); }
    @PluginMethod public void update(PluginCall call) { getActivity().runOnUiThread(() -> {
        try { host().update(call.getData(), result -> {
            try { call.resolve(JSObject.fromJSONObject(result)); }
            catch (Exception error) { call.reject(error.getMessage(),error); }
            return kotlin.Unit.INSTANCE;
        }); }
        catch (Exception error) { if (host != null) host.destroy(); host = null; call.reject(error.getMessage(),error); }
    }); }
    @PluginMethod public void clock(PluginCall call) { getActivity().runOnUiThread(() -> { if (host != null) host.clock(call.getData()); call.resolve(); }); }
    @PluginMethod public void remove(PluginCall call) { getActivity().runOnUiThread(() -> { if (host != null) host.remove(call.getString("id",""),call.getString("session","")); call.resolve(); }); }
    @Override protected void handleOnPause() { if (host != null) host.suspend(); }
    @Override protected void handleOnResume() { if (host != null) host.resume(); }
    @Override protected void handleOnDestroy() { if (host != null) host.destroy(); host = null; }
}
