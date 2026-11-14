package io.github.huleixin.tingyu.resolver;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

// A cached backup must retain its actual identity and negotiated quality on replay.
public class CachedSourceMetadataTest {
    private final NativePlaylist.Track track=new NativePlaylist.Track("id","qq","id","Title","Artist","Album",200000,"","{}","qq-original");
    @Test public void preservesNativeBackupQuality() throws Exception {
        SourceResolution result=ResolverRegistry.cachedResult(track,"hires","file:///fixture",new JSONObject().put("actualSource","lx:tx:backup").put("negotiatedQuality","high"));
        assertEquals("high",result.quality);assertEquals("lx:tx:backup",result.backupProviderId);assertFalse(result.proxy());
    }
    @Test public void understandsBridgeProvenanceAndOriginalIdentity() throws Exception {
        JSONObject bridge=new JSONObject().put("providerId","netease").put("mediaId","other");
        assertEquals("netease",ResolverRegistry.cachedResult(track,"high","file:///fixture",new JSONObject().put("actualSource",bridge.toString())).backupProviderId);
        bridge.put("scriptId","backup");
        assertEquals("lx:netease:backup",ResolverRegistry.cachedResult(track,"high","file:///fixture",new JSONObject().put("actualSource",bridge.toString())).backupProviderId);
        assertEquals("",ResolverRegistry.cachedResult(track,"high","file:///fixture",new JSONObject().put("actualSource","qq:id")).backupProviderId);
    }
    @Test public void explicitRestrictionsNeverEnableFallback() {
        for(String reason:new String[]{"membership-required","purchase-required","preview-only","entitlement-required","region-restricted","taken-down","auth-required"})assertFalse(reason,ResolverRegistry.allowsFallback(reason));
        assertTrue(ResolverRegistry.allowsFallback("network timeout"));
    }

}
