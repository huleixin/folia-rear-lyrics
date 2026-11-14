package io.github.huleixin.tingyu.resolver;

import io.github.huleixin.tingyu.playback.NativePlaylist;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/resolver/OriginalPlaybackFallbackTest.java
public class OriginalPlaybackFallbackTest {
    private NativePlaylist.Track track(String provider, String title, String artist, long duration) {
        return new NativePlaylist.Track("online:"+provider+":123", provider, "123", title, artist, "album", duration, "", "", provider+"-original");
    }
    private NativePlaylist.Track original() { return track("qq", "晴天", "周杰伦", 240000); }
    private OriginalPlaybackFallback.Resolver resolver(AtomicInteger calls, SourceResolution result) {
        return new OriginalPlaybackFallback.Resolver() {
            public boolean available(String provider) { return true; }
            public SourceResolution resolve(NativePlaylist.Track song, String quality) { calls.incrementAndGet(); return result; }
        };
    }
    @Test public void acceptsOnlySameRecording() {
        assertTrue(OriginalPlaybackFallback.matches(original(), track("netease", " 晴天 ", "周杰伦", 241000)));
        assertFalse(OriginalPlaybackFallback.matches(original(), track("netease", "晴天 (Live)", "周杰伦", 240000)));
        assertFalse(OriginalPlaybackFallback.matches(original(), track("netease", "晴天", "翻唱者", 240000)));
        assertFalse(OriginalPlaybackFallback.matches(original(), track("netease", "晴天", "周杰伦", 30000)));
        assertFalse(OriginalPlaybackFallback.matches(original(), track("netease", "晴天", "", 240000)));
        assertEquals("testlive", OriginalPlaybackFallback.normalize("ＴＥＳＴ (Live)"));
    }
    @Test public void preservesLogicalIdentityAndDirectTransport() {
        AtomicInteger calls = new AtomicInteger();
        NativePlaylist.Track original = track("netease", "晴天", "周杰伦", 240000);
        OriginalPlaybackFallback fallback = new OriginalPlaybackFallback((provider, query) -> List.of(original()));
        SourceResolution result = fallback.resolve(original, "high", resolver(calls, SourceResolution.okDirect("https://cdn.example/song", "high", 1)));
        assertTrue(result.ok()); assertFalse(result.proxy()); assertEquals("qq", result.backupProviderId);
        assertEquals("online:netease:123", original.songKey); assertEquals(1, calls.get());
    }
    @Test public void refusesWrongVersionsBeforeRequestingAudio() {
        AtomicInteger calls = new AtomicInteger();
        OriginalPlaybackFallback fallback = new OriginalPlaybackFallback((provider, query) -> List.of(track(provider,"晴天 (Live)","周杰伦",240000)));
        assertFalse(fallback.resolve(original(), "high", resolver(calls, SourceResolution.ok("https://x", "high", 1))).ok());
        assertEquals(0, calls.get());
    }
    @Test public void triesAtMostTwoMatchingCandidatesPerProviderAndKeepsFailure() {
        AtomicInteger calls = new AtomicInteger();
        NativePlaylist.Track candidate = track("netease", "晴天", "周杰伦", 240000);
        OriginalPlaybackFallback fallback = new OriginalPlaybackFallback((provider, query) -> List.of(candidate,candidate,candidate));
        assertFalse(fallback.resolve(original(), "high", resolver(calls, SourceResolution.failure("preview-only"))).ok());
        assertEquals(2, calls.get());
    }
    @Test public void selectedScriptNeverFallsBackToOriginalCatalogs() {
        NativePlaylist.Track script = new NativePlaylist.Track("online:qq:123","qq","123","晴天","周杰伦","",240000,"","","lx:tx");
        AtomicInteger calls = new AtomicInteger();
        OriginalPlaybackFallback fallback = new OriginalPlaybackFallback((provider, query) -> { fail("must not search"); return List.of(); });
        assertFalse(fallback.resolve(script, "high", resolver(calls, SourceResolution.failure("no"))).ok());
        assertEquals(0,calls.get());
    }
    @Test public void qqCatalogUsesVerifiedLiteContract() throws Exception {
        JSONObject request = BackupCatalog.qqPayload("晴天 周杰伦");
        assertEquals("qqmusiclight", request.getJSONObject("comm").getString("tmeAppID"));
        assertEquals("DoSearchForQQMusicLite", request.getJSONObject("request").getString("method"));
        assertEquals(20, request.getJSONObject("request").getJSONObject("param").getInt("num_per_page"));
    }
    @Test public void parsesQqCandidateWithRealPlaybackIdentifiers() throws Exception {
        JSONObject item = new JSONObject().put("mid","mid123").put("id",123).put("title","晴天").put("interval",240)
            .put("singer",new JSONArray().put(new JSONObject().put("name","周杰伦")))
            .put("file",new JSONObject().put("media_mid","media123"));
        JSONObject root = new JSONObject().put("code",0).put("request",new JSONObject().put("code",0)
            .put("data",new JSONObject().put("code",0).put("body",new JSONObject().put("item_song",new JSONArray().put(item)))));
        NativePlaylist.Track candidate=BackupCatalog.parse("qq",root.toString()).get(0);
        assertEquals("mid123",candidate.mediaId);assertEquals(240000,candidate.durationMs);
        assertEquals("media123",new JSONObject(candidate.providerData).getString("mediaMid"));
        assertTrue(OriginalPlaybackFallback.matches(original(),candidate));
    }
    @Test public void parsesNeteaseArtistsAndDurationWithoutGuessingVersions() throws Exception {
        JSONObject item = new JSONObject().put("id",123).put("name","晴天").put("dt",240000)
            .put("ar",new JSONArray().put(new JSONObject().put("name","周杰伦")));
        JSONObject root = new JSONObject().put("code",200).put("result",new JSONObject().put("songs",new JSONArray().put(item)));
        NativePlaylist.Track candidate=BackupCatalog.parse("netease",root.toString()).get(0);
        assertTrue(OriginalPlaybackFallback.matches(original(),candidate));
        assertEquals("netease-original",candidate.sourceId);
    }
    @Test public void rejectsObjectShapedTrialInfo() throws Exception {
        JSONObject trial=new JSONObject().put("code",200).put("data",new JSONArray().put(new JSONObject()
            .put("url","https://cdn.example/trial").put("freeTrialInfo",new JSONObject().put("start",0).put("end",30))));
        assertEquals("1",NeteaseResolver.parseSongUrl(trial.toString())[2]);
    }
    @Test public void registryFallsBackAfterPrimaryFailureWithoutRewritingTheTrack() {
        ResolverRegistry registry = ResolverRegistry.get();
        registry.resetForTest();
        AtomicInteger calls = new AtomicInteger();
        try {
            registry.setBackupCatalogForTest((provider, query) -> List.of(track(provider, "晴天", "周杰伦", 240000)));
            registry.registerForTest(new SourceResolver() {
                public String id() { return "test-original"; }
                public boolean supports(String provider) { return provider.equals("qq") || provider.equals("netease"); }
                public SourceResolution resolve(NativePlaylist.Track song, String quality) {
                    calls.incrementAndGet();
                    return song.providerId.equals("qq") ? SourceResolution.failure("no full audio")
                        : SourceResolution.ok("https://cdn.example/full", quality, 1);
                }
            });
            NativePlaylist.Track song = original();
            SourceResolution result = registry.resolve(song, "high");
            assertTrue(result.ok()); assertEquals("netease", result.backupProviderId);
            assertEquals("online:qq:123", song.songKey); assertEquals(2, calls.get());
        } finally { registry.resetForTest(); }
    }
}
