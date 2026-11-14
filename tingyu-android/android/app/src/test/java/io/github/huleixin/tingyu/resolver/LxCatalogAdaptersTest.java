package io.github.huleixin.tingyu.resolver;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import io.github.huleixin.tingyu.playback.NativePlaylist;
import static org.junit.Assert.*;

// Catalog fixtures preserve provider-owned IDs and refuse other recordings before resolving audio.
public class LxCatalogAdaptersTest {
    @Test public void parsesProviderIdsArtistsDurationsAndQualityHashes() throws Exception {
        JSONObject kw=new JSONObject().put("MUSICRID","MUSIC_123").put("SONGNAME","Fixture").put("ARTIST","One&Two").put("DURATION",120);
        NativePlaylist.Track kuwo=LxCatalogAdapters.parse("kuwo",new JSONObject().put("abslist",new JSONArray().put(kw))).get(0);
        assertEquals("123",kuwo.mediaId);assertEquals("One、Two",kuwo.artist);assertEquals(120000,kuwo.durationMs);
        JSONObject mg=new JSONObject().put("copyrightId","copyright").put("songId","catalog-id").put("name","Fixture").put("duration",120)
            .put("singerList",new JSONArray().put(new JSONObject().put("name","One")).put(new JSONObject().put("name","Two")));
        NativePlaylist.Track migu=LxCatalogAdapters.parse("migu",new JSONObject().put("code","000000").put("songResultData",new JSONObject().put("resultList",new JSONArray().put(new JSONArray().put(mg))))).get(0);
        assertEquals("copyright",migu.mediaId);assertEquals("catalog-id",new JSONObject(migu.providerData).getString("songId"));
        JSONObject kg=new JSONObject().put("FileHash","standard-hash").put("SongName","Fixture").put("SingerName","One、Two").put("Duration",120).put("SQFileHash","lossless-hash");
        NativePlaylist.Track kugou=LxCatalogAdapters.parse("kugou",new JSONObject().put("data",new JSONObject().put("lists",new JSONArray().put(kg).put(kg)))).get(0);
        assertEquals("lossless-hash",new JSONObject(kugou.providerData).getJSONObject("_types").getJSONObject("flac").getString("hash"));
        assertTrue(OriginalPlaybackFallback.matches(kuwo,migu));assertTrue(OriginalPlaybackFallback.matches(kuwo,kugou));
        kg.put("SongName","Fixture (Live)");
        assertFalse(OriginalPlaybackFallback.matches(kuwo,LxCatalogAdapters.parse("kugou",new JSONObject().put("data",new JSONObject().put("lists",new JSONArray().put(kg)))).get(0)));
    }
    @Test public void catalogRequestsKeepHttpsAndEncodedQueries() throws Exception {
        for(String provider:new String[]{"kuwo","migu","kugou"})assertEquals("https",LxCatalogAdapters.request(provider,"One & Two").url().scheme());
        assertEquals("One & Two",LxCatalogAdapters.request("kugou","One & Two").url().queryParameter("keyword"));
        assertNotNull(LxCatalogAdapters.request("kugou","Fixture").header("KG-CLIENTTIMEMS"));
        assertTrue(LxCatalogAdapters.parse("migu",new JSONObject().put("code","failed")).isEmpty());
    }
}
