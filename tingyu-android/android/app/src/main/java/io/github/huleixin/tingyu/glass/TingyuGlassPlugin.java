package io.github.huleixin.tingyu.glass;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// android/app/src/main/java/io/github/huleixin/tingyu/glass/TingyuGlassPlugin.java
@CapacitorPlugin(name = "TingyuGlass")
public class TingyuGlassPlugin extends Plugin {
    private GlassNavController controller;
    private String session = "";
    private GlassNavController controller() {
        if (controller == null) controller = new GlassNavController(getBridge().getWebView(), index -> {
            JSObject event = new JSObject(); event.put("index",index); notifyListeners("navigate",event);
        });
        return controller;
    }
    @PluginMethod public void probe(PluginCall call) { getActivity().runOnUiThread(() -> call.resolve(controller().status())); }
    @PluginMethod public void update(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { session = call.getString("session", ""); call.resolve(controller().update(call.getData())); }
            catch (Exception error) { if (controller != null) controller.hide(); call.reject(error.toString()); }
        });
    }
    @PluginMethod public void hide(PluginCall call) { getActivity().runOnUiThread(() -> {
        if (controller != null && session.equals(call.getString("session", ""))) controller.hide(); call.resolve();
    }); }
    @Override protected void handleOnPause() { if (controller != null) controller.suspend(); }
    @Override protected void handleOnDestroy() { if (controller != null) controller.destroy(); controller = null; }
}
