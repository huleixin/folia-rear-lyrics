package io.github.huleixin.tingyu.playback;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

// Durable tasks must retain catalog IDs without retaining authentication or playback URLs.
public class AudioCachePayloadTest {
    @Test public void stripsCredentialsAndRetainsMatchingAndQualityFields() throws Exception {
        String route=new String(new char[64]).replace("\0","a");
        JSONObject data=new JSONObject().put("songMid","song-id").put("audioCacheRoute",route)
            .put("cookie","secret-fixture").put("token","secret-fixture").put("url","https://example.invalid/auth")
            .put("headers",new JSONObject().put("Authorization","secret-fixture"))
            .put("albumMid","https://example.invalid/private")
            .put("fallbackArtists",new JSONArray().put("One").put("Two"))
            .put("audioCacheKeys",new JSONObject().put("standard","offline_v1_standard_"+route+"_online:qq:id").put("unknown","secret-fixture"))
            .put("_types",new JSONObject().put("flac",new JSONObject().put("hash","own-hash").put("size",1234).put("token","secret-fixture")));
        JSONObject safe=AudioCachePayload.sanitize(new JSONObject().put("songKey","online:qq:id").put("durationMs",120000)
            .put("providerData",data).put("url","secret-fixture").put("cookie","secret-fixture"));
        assertFalse(safe.toString().contains("secret-fixture"));assertFalse(safe.toString().contains("https://"));
        JSONObject out=safe.getJSONObject("providerData");
        assertEquals("song-id",out.getString("songMid"));assertEquals(route,out.getString("audioCacheRoute"));
        assertEquals(2,out.getJSONArray("fallbackArtists").length());
        assertEquals("own-hash",out.getJSONObject("_types").getJSONObject("flac").getString("hash"));
        assertEquals(1,out.getJSONObject("audioCacheKeys").length());assertEquals(120000,safe.getLong("durationMs"));
    }
}
