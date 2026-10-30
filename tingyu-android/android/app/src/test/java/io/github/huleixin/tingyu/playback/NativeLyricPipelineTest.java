package io.github.huleixin.tingyu.playback;

import org.json.JSONObject;
import org.junit.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * C2 的验收模拟：Activity 已停止、WebView 完全不响应，Media3 自己切到第二首。
 *
 * <p>这个用例不碰网络、也不碰 Android 框架，只证明三件必须成立的事：
 * <ol>
 *   <li>第二首的歌词能**独立**从公开来源取到并解析成数据（不经过 JS）；</li>
 *   <li>时间轴与第二首自己的身份严格对应（同名错词会被淘汰）；</li>
 *   <li>发布决策与 Activity/WebView 状态无关 —— 策略的输入里根本没有这两个变量。</li>
 * </ol>
 */
public class NativeLyricPipelineTest {

    /** LRCLIB `/api/search` 的真实响应形状（节选）：故意把错歌手、错时长的那条排在前面。 */
    private static final String SEARCH_BODY = "[\n"
            + "  {\"id\":1,\"trackName\":\"起风了\",\"artistName\":\"某翻唱歌手\",\"albumName\":\"翻唱合集\","
            + "   \"duration\":325,\"instrumental\":false,\"syncedLyrics\":\"[00:01.00]别人的词\\n\"},\n"
            + "  {\"id\":2,\"trackName\":\"起风了\",\"artistName\":\"买辣椒也用券\",\"albumName\":\"起风了\","
            + "   \"duration\":325,\"instrumental\":false,"
            + "   \"syncedLyrics\":\"[00:01.00]这一路上走走停停\\n[00:05.50]顺着少年漂流的痕迹\\n\"},\n"
            + "  {\"id\":3,\"trackName\":\"起风了\",\"artistName\":\"买辣椒也用券\",\"albumName\":\"现场版\","
            + "   \"duration\":412,\"instrumental\":false,\"syncedLyrics\":\"[00:01.00]现场版\\n\"}\n"
            + "]";

    @Test public void secondTrackIsResolvedWithoutAnyWebViewInvolvement() throws Exception {
        // 第二首：身份来自 Media3 的 MediaItem tag，不是 UI 状态。
        SongInfo second = new SongInfo("online:tx:002", "起风了", "买辣椒也用券", "起风了",
                325_000L, "https://img.example/cover-002.jpg", "qq", "002abc", 2);

        List<LyricMatch.Candidate> candidates = parse(SEARCH_BODY);
        LyricMatch.Score best = LyricMatch.pick(candidates, second.title, second.artist,
                second.album, second.durationMs);
        assertNotNull("没有一条候选能对上，说明匹配规则过严或数据有问题", best);
        assertEquals(2L, best.candidate.id); // 不是 1（错歌手）也不是 3（现场版时长差 87s）

        List<LrcParser.Line> lines = LrcParser.parse(best.candidate.syncedLyrics);
        assertEquals(2, lines.size());

        LyricInfoPayload.Result payload = LyricInfoPayload.build(second.title, second.artist,
                second.album, second.songId(), second.durationMs, lines, second.generation, "native-lrclib");
        assertNotNull(payload);
        JSONObject json = new JSONObject(payload.json);
        // 时间轴与第二首自己的身份绑定：Bridge 用它拒绝「上一首迟到的 payload」。
        assertEquals("002abc|起风了|买辣椒也用券|325", json.getString("trackKey"));
        assertTrue(json.getString("lyric").contains("这一路上走走停停"));
        assertFalse(json.getString("lyric").contains("别人的词"));
        assertEquals(2, json.getInt("sessionGeneration"));
    }

    @Test public void publishDecisionDoesNotDependOnAnyUiState() {
        // 策略的入参里只有「哪首歌 / 哪一代 / 结果类型」。Activity 是否存活、WebView 是否响应
        // 都不在决策输入里 —— 这正是「打开 App 不再是恢复的必要条件」的结构性保证。
        SongInfoPublishPolicy.Decision whenCurrent = SongInfoPublishPolicy
                .forLyrics("FETCHED", true, true, true);
        assertTrue(whenCurrent.storeTimeline);
        assertTrue(whenCurrent.refreshSession);

        SongInfoPublishPolicy.Decision whenAhead = SongInfoPublishPolicy
                .forLyrics("FETCHED", true, false, true);
        assertTrue("下一首的词必须提前进缓存，换歌那一刻才不用等", whenAhead.storeTimeline);
        assertFalse("不是当前曲就不能重建 metadata", whenAhead.refreshSession);

        SongInfoPublishPolicy.Decision stale = SongInfoPublishPolicy
                .forLyrics("FETCHED", true, true, false);
        assertTrue(stale.storeTimeline);
        assertFalse("换代次之后回来的结果不许动 metadata", stale.refreshSession);
    }

    @Test public void transientFailuresNeverBecomeAPermanentNoLyric() {
        for (String status : Arrays.asList("NETWORK", "RATE_LIMITED", "NO_IDENTITY")) {
            SongInfoPublishPolicy.Decision decision = SongInfoPublishPolicy
                    .forLyrics(status, false, true, true);
            assertFalse(status, decision.storeTimeline);
            assertFalse(status + " 不能写成「确认没有词」", decision.markNoLyric);
            assertFalse(status, decision.refreshSession);
        }
        // 只有服务端明确回答「没有这首歌的词」时才允许清空。
        SongInfoPublishPolicy.Decision confirmed = SongInfoPublishPolicy
                .forLyrics("NOT_FOUND", false, true, true);
        assertTrue(confirmed.markNoLyric);
        assertTrue(confirmed.refreshSession);
    }

    @Test public void artworkNeverPublishesForAnotherTrack() {
        assertTrue(SongInfoPublishPolicy.forArtwork(true, true, true).refreshSession);
        assertFalse(SongInfoPublishPolicy.forArtwork(true, false, true).refreshSession);
        assertFalse(SongInfoPublishPolicy.forArtwork(true, true, false).refreshSession);
        assertFalse(SongInfoPublishPolicy.forArtwork(false, true, true).refreshSession);
    }

    @Test public void tagCarriesArtworkFromNativeQueueItems() {
        // 原生队列项（含续播接管项）的封面字段叫 artwork；JS 插件推当前曲时叫 coverUrl。
        // 只认其中一个，就会在换歌瞬间把封面丢成空值 —— 这是「封面也没了」的直接原因。
        JSONObject nativeItem = new JSONObject();
        try {
            nativeItem.put("songKey", "online:tx:002").put("title", "起风了")
                    .put("artist", "买辣椒也用券").put("durationMs", 325_000L)
                    .put("artwork", "https://img.example/cover-002.jpg");
        } catch (Exception error) {
            throw new AssertionError(error);
        }
        SongInfo fromQueue = SongInfo.fromTag(nativeItem, 3);
        assertNotNull(fromQueue);
        assertEquals("https://img.example/cover-002.jpg", fromQueue.artworkUrl);
        assertEquals(325_000L, fromQueue.durationMs);

        JSONObject jsPush = new JSONObject();
        try {
            jsPush.put("songKey", "online:tx:002").put("coverUrl", "https://img.example/js.jpg")
                    .put("duration", 325_000L);
        } catch (Exception error) {
            throw new AssertionError(error);
        }
        SongInfo fromJs = SongInfo.fromTag(jsPush, 3);
        assertNotNull(fromJs);
        assertEquals("https://img.example/js.jpg", fromJs.artworkUrl);
        assertEquals(325_000L, fromJs.durationMs);

        assertNull(SongInfo.fromTag(new JSONObject(), 1));
    }

    private static List<LyricMatch.Candidate> parse(String body) throws Exception {
        org.json.JSONArray array = new org.json.JSONArray(body);
        List<LyricMatch.Candidate> out = new java.util.ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            JSONObject record = array.getJSONObject(i);
            long seconds = record.optLong("duration", 0L);
            out.add(new LyricMatch.Candidate(record.optLong("id"), record.optString("trackName"),
                    record.optString("artistName"), record.optString("albumName"),
                    seconds * 1000L, record.optBoolean("instrumental", false),
                    record.optString("syncedLyrics", null), record.optString("plainLyrics", null)));
        }
        return out;
    }
}
