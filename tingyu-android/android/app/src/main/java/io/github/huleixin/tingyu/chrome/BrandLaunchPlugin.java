package io.github.huleixin.tingyu.chrome;

import android.provider.Settings;
import android.webkit.JavascriptInterface;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.github.huleixin.tingyu.MainActivity;
import io.github.huleixin.tingyu.BuildConfig;
import org.json.JSONObject;
import java.util.concurrent.atomic.AtomicBoolean;

// Registered before Capacitor loads index.html: synchronous first-frame appearance and cold flag.
@CapacitorPlugin(name = "BrandLaunch")
public class BrandLaunchPlugin extends Plugin {
    private static final AtomicBoolean processEntered = new AtomicBoolean();
    private final AtomicBoolean documentEntered = new AtomicBoolean();
    private BrandLaunchState state;
    private boolean nativePage;

    @Override public void load() {
        nativePage = BuildConfig.COMPOSE_CHROME && !io.github.huleixin.tingyu.diagnostics.StartupGuard.skipOptional();
        state = new BrandLaunchState(!processEntered.getAndSet(true));
        state.setReduced(Settings.Global.getFloat(getContext().getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f);
        ((MainActivity)getActivity()).setBrandLaunch(state);
        getBridge().getWebView().addJavascriptInterface(new Endpoint(), "TingyuLaunch");
    }

    public final class Endpoint {
        @JavascriptInterface public String config() {
            boolean firstDocument = !documentEntered.getAndSet(true);
            if (!firstDocument) getActivity().runOnUiThread(() -> state.setActive(false));
            try {
                return new JSONObject().put("show", firstDocument && state.getActive())
                    .put("native", nativePage)
                    .put("style", InterfaceAppearance.style(getContext()))
                    .put("mode", InterfaceAppearance.mode(getContext()))
                    .put("light", InterfaceAppearance.light(getContext()))
                    .put("reduced", state.getReduced())
                    .toString();
            } catch (Exception ignored) { return "{}"; }
        }
        @JavascriptInterface public void ready() {
            getActivity().runOnUiThread(() -> state.setReactReady(true));
        }
    }
}
