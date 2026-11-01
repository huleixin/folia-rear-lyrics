package io.github.huleixin.tingyu.playback;

import org.junit.Test;
import java.io.File;
import java.nio.file.Files;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/ResourceCachePolicyTest.java
public class ResourceCachePolicyTest {
    @Test public void currentAndTenNextArePriorityWindowNotTotalLimit() {
        for (int size : new int[]{30,100,200,10000}) {
            int urgent=0, soon=0, rest=0;
            for(int i=0;i<size;i++) {
                int p=ResourceCachePolicy.priority(i);
                if(p==0)urgent++; else if(p==1)soon++; else rest++;
            }
            assertEquals(1,urgent); assertEquals(10,soon); assertEquals(size-11,rest);
        }
    }
    @Test public void albumArtworkIdentityIgnoresOnlyKnownCdnSizes() {
        assertEquals(ResourceCachePolicy.artworkIdentity("https://y.gtimg.cn/music/photo_new/T002R300x300M000abc.jpg"),
            ResourceCachePolicy.artworkIdentity("https://y.gtimg.cn/music/photo_new/T002R800x800M000abc.jpg"));
        assertNotEquals(ResourceCachePolicy.artworkIdentity("https://example.org/cover?id=1"),
            ResourceCachePolicy.artworkIdentity("https://example.org/cover?id=2"));
        assertNotEquals(ResourceCachePolicy.artworkIdentity("https://p1.music.126.net/album1.jpg"),
            ResourceCachePolicy.artworkIdentity("https://p2.music.126.net/album2.jpg"));
    }
    @Test public void loginAndFilesAreNeverArtworkProxyTargets() {
        assertFalse(ResourceCachePolicy.sharedArtworkUrl("https://y.qq.com/portal/profile.html"));
        assertFalse(ResourceCachePolicy.sharedArtworkUrl("https://y.qq.com/login/qr"));
        assertFalse(ResourceCachePolicy.sharedArtworkUrl("file:///data/local/secret"));
        assertFalse(ResourceCachePolicy.sharedArtworkUrl("https://localhost/private"));
        assertTrue(ResourceCachePolicy.sharedArtworkUrl("https://y.gtimg.cn/music/photo_new/T002R300x300M000abc.jpg"));
    }
    @Test public void backoffIsBoundedAndRetryAfterIsRespected() {
        assertEquals(300000,ResourceCachePolicy.retryDelay(999,false));
        assertEquals(300000,ResourceCachePolicy.retryDelay(0,true));
        assertEquals(901000,ResourceCachePolicy.retryNotBefore("900",1000));
        assertEquals(301000,ResourceCachePolicy.retryNotBefore("invalid",1000));
    }
    @Test public void diskBudgetPreservesProtectedResources() throws Exception {
        File dir=Files.createTempDirectory("resource-budget").toFile();
        File current=new File(dir,"current.img"), old=new File(dir,"old.img"), recent=new File(dir,"next.img");
        Files.write(current.toPath(),new byte[40]); Files.write(old.toPath(),new byte[50]); Files.write(recent.toPath(),new byte[30]);
        old.setLastModified(100); current.setLastModified(200); recent.setLastModified(300);
        ResourceDiskBudget.prune(dir,70,f->f.equals(current));
        assertTrue(current.exists()); assertFalse(old.exists()); assertTrue(recent.exists());
    }
    @Test public void wholePlaylistAuthoritySurvivesReopenAndCleanupPreservesManual() throws Exception {
        File dir=Files.createTempDirectory("whole-playlist").toFile();
        UnifiedLyricsStore store=new UnifiedLyricsStore(dir);
        for(int i=0;i<200;i++) store.put("qq:"+i,"ok","{\"lyric\":\"[00:01.000]song "+i+"\"}",true,true,"platform","stage",i==180,"off");
        store.flushForTest();
        UnifiedLyricsStore reopened=new UnifiedLyricsStore(dir);
        for(int i=0;i<200;i++) assertNotNull("missing "+i,reopened.get("qq:"+i));
        assertFalse(reopened.put("qq:180","ok","fallback",false,false,"native","native",false,"off"));
        reopened.clearDownloadable(); reopened.flushForTest();
        assertNotNull(new UnifiedLyricsStore(dir).get("qq:180"));
        assertNull(new UnifiedLyricsStore(dir).get("qq:20"));
    }
    @Test public void renderModelIsBoundToExactAuthorityVersionAndSurvivesRestart() throws Exception {
        File dir=Files.createTempDirectory("render-model").toFile();
        UnifiedLyricsStore store=new UnifiedLyricsStore(dir);
        store.put("qq:1","ok","timeline-a",true,true,"stage","stage",true,"off");
        store.attachRenderModel("qq:1","timeline-a","{model:word-timing}");
        store.attachRenderModel("qq:1","stale-timeline","wrong-model");
        store.flushForTest();
        assertEquals("{model:word-timing}",new UnifiedLyricsStore(dir).get("qq:1").renderModel);
        assertFalse(store.put("qq:1","ok","fallback",false,false,"native","native",false,"off"));
        assertEquals("{model:word-timing}",store.get("qq:1").renderModel);
    }
    @Test public void rearUsesTheSameWordsAndAppliesOffsetOnlyAtDelivery() throws Exception {
        String raw="{\"lines\":[{\"startTime\":1,\"endTime\":3,\"fullText\":\"hello world\",\"translation\":\"translated\",\"words\":[{\"text\":\"hello\",\"startTime\":1,\"endTime\":2},{\"text\":\"world\",\"startTime\":2,\"endTime\":3}]}]}";
        org.json.JSONObject row=new org.json.JSONObject(io.github.huleixin.tingyu.RearNativeLyricLines.rowsFromRenderModel(raw,"qq:1",300)).getJSONArray("lines").getJSONObject(0);
        assertEquals(1.3,row.getDouble("startTime"),0.0001);
        assertEquals(2.3,row.getJSONArray("words").getJSONObject(1).getDouble("startTime"),0.0001);
        assertEquals("translated",row.getString("translation"));
        org.json.JSONObject unchanged=new org.json.JSONObject(io.github.huleixin.tingyu.RearNativeLyricLines.rowsFromRenderModel(raw,"qq:1",0)).getJSONArray("lines").getJSONObject(0);
        assertEquals(1,unchanged.getDouble("startTime"),0.0001);
    }
    @Test public void mobileWifiAndDataSaverAreDistinctPolicies() {
        assertTrue(ResourceCachePolicy.allowBulkNetwork(true,false,false,true,false));
        assertFalse(ResourceCachePolicy.allowBulkNetwork(true,true,false,false,false));
        assertTrue(ResourceCachePolicy.allowBulkNetwork(true,true,true,true,false));
        assertFalse(ResourceCachePolicy.allowBulkNetwork(true,false,false,true,true));
        assertFalse(ResourceCachePolicy.allowBulkNetwork(true,true,true,true,true));
        assertFalse(ResourceCachePolicy.allowBulkNetwork(false,false,true,false,false));
    }
}
