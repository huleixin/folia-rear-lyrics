package io.github.huleixin.tingyu.lx;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import io.github.huleixin.tingyu.resolver.SourceResolution;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import java.util.concurrent.atomic.AtomicBoolean;

// Budget and configuration cancellation must stop results before a backup VM can be started.
public class LxScriptChainTest {
    @After public void reset() { LxScriptChain.INSTANCE.install(new JSONArray(), false); }

    @Test public void expiredBudgetDoesNotStartOrInvokeBackup() throws Exception {
        LxScriptChain.INSTANCE.install(new JSONArray().put(new JSONObject().put("id", "fixture").put("code", "throw new Error()")), false);
        AtomicBoolean called = new AtomicBoolean();
        SourceResolution result = LxScriptChain.INSTANCE.run("fixture", System.nanoTime() - 1, access -> {
            called.set(true);
            return SourceResolution.ok("https://example.com/audio", "standard", 1);
        });
        assertFalse(called.get());
        assertFalse(result.ok());
    }

    @Test public void changingFallbackConfigurationRejectsLateActiveResult() throws Exception {
        LxScriptChain.INSTANCE.install(new JSONArray(), false);
        JSONArray replacement = new JSONArray().put(new JSONObject().put("id", "new").put("code", "fixture"));
        SourceResolution result = LxScriptChain.INSTANCE.run("", System.nanoTime() + 10_000_000_000L, access -> {
            LxScriptChain.INSTANCE.install(replacement, false);
            return SourceResolution.ok("https://example.com/audio", "standard", 1);
        });
        assertFalse(result.ok());
        assertTrue(LxScriptChain.INSTANCE.ids().contains("new"));
    }
}
