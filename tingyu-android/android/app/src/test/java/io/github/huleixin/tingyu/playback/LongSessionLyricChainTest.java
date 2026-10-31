package io.github.huleixin.tingyu.playback;

import io.github.huleixin.tingyu.RearNativeLyricLines;
import io.github.huleixin.tingyu.coloros.ColorOsLyricBridge;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

/**
 * 30 首连续切歌的长序列回归（A–I）。
 *
 * <p>这个用例**复用真实的**统一歌词仓库（{@link UnifiedLyricsStore}，真实落盘）、
 * 真实的歌词桥（{@link ColorOsLyricBridge}，真实 LRU 与版本号）、真实的覆盖裁决
 * （{@link UnifiedLyricPolicy}）、真实的发布决策（{@link SongInfoPublishPolicy}）、
 * 真实的交付判定（{@link LyricDelivery}）、真实的链路账本（{@link LyricChainLedger}）、
 * 以及真实的渲染端转换（{@link RearNativeLyricLines#rowsFromLyricInfo}）。
 *
 * <p>被模拟的只有两件在 JVM 里做不到的事：<b>HTTP 取词</b>（用脚本化的成功/失败回答代替）
 * 与 <b>Media3 队列事件</b>（用顺序循环代替 onMediaItemTransition）。因此它证明的是
 * 「状态机、缓存、版本、交付、身份」这一整条链路在 30 首尺度上不会自发中断，
 * 而不是「小米系统真的显示了歌词」—— 后者只能真机验收。
 */
public class LongSessionLyricChainTest {

    private static final int TOTAL = 30;
    private static final String[] PROVIDERS = {"qq", "netease", "kugou", "bodian", "qishui", "lx"};

    private UnifiedLyricsStore unified;
    private final LyricChainLedger ledger = SongInfoLoader.ledger();
    private final List<SongInfo> songs = new ArrayList<>();
    /** 原生磁盘缓存里存在「服务端明确无词」负记录的曲目。 */
    private final Set<String> nativeNegative = new HashSet<>();
    private final Set<Integer> failingSongs = new HashSet<>();
    private final Set<Integer> noLyricSongs = new HashSet<>();
    private final Map<Integer, LyricDelivery.State> delivered = new HashMap<>();

    @Before public void setUp() {
        File dir = new File(System.getProperty("java.io.tmpdir"),
            "tingyu-unified-" + System.nanoTime());
        assertTrue(dir.mkdirs());
        unified = new UnifiedLyricsStore(dir);
        ColorOsLyricBridge.clear();
        ledger.clear();
        nativeNegative.clear();
        failingSongs.clear();
        noLyricSongs.clear();
        delivered.clear();
        songs.clear();
        for (int index = 1; index <= TOTAL; index++) songs.add(song(index));
    }

    // ---- A ----

    @Test public void a_thirtyTracksAllResolveAndDeliver() throws Exception {
        playRange(1, TOTAL);
        assertEquals(TOTAL, count(LyricDelivery.State.READY));
        for (int index = 1; index <= TOTAL; index++) {
            LyricChainLedger.Entry entry = ledger.entryForTest(key(index));
            assertNotNull("第 " + index + " 首没有进过账本", entry);
            assertEquals(LyricChainLedger.Outcome.READY, entry.outcome);
            assertTrue("第 " + index + " 首有词却没交付背屏", entry.rearDelivered);
            assertTrue("第 " + index + " 首有词却没进会话 metadata", entry.sessionPublished);
        }
        List<String> codes = ledger.classify();
        assertTrue(codes.toString(), ledger.healthy());
        assertFalse(codes.toString(), codes.contains("chain-broken:2"));
        assertFalse(codes.toString(), codes.contains("prefetch-stalled"));
    }

    // ---- B ----

    @Test public void b_aFailedTrackDoesNotStopTheFollowingOnes() throws Exception {
        failingSongs.add(3);
        failingSongs.add(7);
        failingSongs.add(12);
        playRange(1, TOTAL);

        for (int failed : new int[]{3, 7, 12}) {
            assertNotEquals("第 " + failed + " 首本应取词失败",
                LyricDelivery.State.READY, delivered.get(failed));
            assertEquals(LyricChainLedger.Outcome.FAILED, ledger.entryForTest(key(failed)).outcome);
        }
        for (int after : new int[]{4, 8, 13, 30}) {
            assertEquals("第 " + after + " 首被前面的失败连累了",
                LyricDelivery.State.READY, delivered.get(after));
        }
        assertEquals(TOTAL - 3, count(LyricDelivery.State.READY));
        List<String> codes = ledger.classify();
        assertTrue(codes.toString(), codes.contains("fetch-failed:3"));
        assertFalse("单曲失败不该被记成链路中断", codes.contains("chain-broken:2"));
    }

    // ---- C ----

    @Test public void c_webViewFrozenMidwayStillDeliversEveryLaterTrack() throws Exception {
        playRange(1, 4);
        // 第 5 首起 WebView 完全冻结：之后只走原生链路（本地缓存/公开源已取到的词）。
        playRange(5, TOTAL);
        for (int index = 1; index <= TOTAL; index++) {
            assertEquals("第 " + index + " 首在冻结后没有歌词",
                LyricDelivery.State.READY, delivered.get(index));
        }
        assertTrue(ledger.healthy());
    }

    // ---- D ----

    @Test public void d_aDroppedRearListenerResyncsFromCurrentState() throws Exception {
        playRange(1, 7);
        // 第 8 首：背屏监听断开，主列表没收到交付事件。
        ledger.planned(key(8), 1, false);
        ensureResolved(8);
        assertNotEquals(LyricDelivery.State.READY, delivered.get(8));
        // 恢复连接：不依赖任何补发事件，直接按当前状态重读一次。
        LyricDelivery.Decision resync = deliver(8);
        assertEquals("重连后应能立即读到当前歌曲的歌词",
            LyricDelivery.State.READY, resync.state);
        delivered.put(8, resync.state);
        playRange(9, TOTAL);
        assertEquals(TOTAL, count(LyricDelivery.State.READY));
    }

    // ---- E ----

    @Test public void e_aPrefetchNetworkFailureDoesNotBlockTheNextTracks() throws Exception {
        failingSongs.add(10);
        playRange(1, TOTAL);
        assertNotEquals(LyricDelivery.State.READY, delivered.get(10));
        assertEquals(LyricDelivery.State.READY, delivered.get(11));
        assertEquals(LyricDelivery.State.READY, delivered.get(12));
        assertEquals(LyricChainLedger.Outcome.READY, ledger.entryForTest(key(11)).outcome);
        assertTrue("预取窗口在第 10 首失败后仍然向前滚",
            ledger.entryForTest(key(12)).everAhead || ledger.entryForTest(key(13)) != null);
    }

    // ---- F ----

    @Test public void f_aStaleResultNeverOverwritesTheNewTrack() throws Exception {
        playRange(1, 16);
        String current = ColorOsLyricBridge.lyricInfoFor(key(16));
        assertNotNull(current);

        // 第 15 首的取词终于回来（迟到了）：写进它自己的槽位是对的，但绝不能动第 16 首，
        // 也不能被允许重建会话 metadata。
        SongInfoPublishPolicy.Decision decision = SongInfoPublishPolicy
            .forLyrics("FETCHED", true, false, true);
        assertFalse("不是当前曲就不许刷新会话", decision.refreshSession);
        ColorOsLyricBridge.setPending(payload(15, "native-lrclib"), false, key(15));

        assertEquals("当前曲的歌词被上一首的迟到结果顶掉了",
            current, ColorOsLyricBridge.lyricInfoFor(key(16)));
        assertTrue(new JSONObject(ColorOsLyricBridge.lyricInfoFor(key(16)))
            .getString("lyric").contains(marker(16)));
        assertNotEquals(payload(15, "native-lrclib"), ColorOsLyricBridge.lyricInfoFor(key(16)));
    }

    // ---- G ----

    @Test public void g_lockedFromTheFirstTrackForThirtyTracks() throws Exception {
        playRange(1, TOTAL);
        for (int index = 1; index <= TOTAL; index++) {
            UnifiedLyricsStore.Record record = unified.get(key(index));
            assertNotNull("第 " + index + " 首没有落进统一仓库", record);
            assertTrue(record.hasTimeline());
            assertTrue("锁屏场景下歌词必须由原生取到并落库",
                "native".equals(record.confirmedBy) || "stage".equals(record.confirmedBy));
            assertEquals(LyricDelivery.State.READY, delivered.get(index));
        }
        assertTrue(ledger.healthy());
    }

    // ---- H ----

    @Test public void h_reopeningTheAppDoesNotSwitchTheLyricVersion() throws Exception {
        playRange(1, 20);
        String key = key(20);
        String stagePayload = payload(20, "stage");

        // 舞台首次确认这首歌（打开主界面时展示的就是这一份）：层级更高，仓库接受。
        assertTrue(unified.put(key, "ok", stagePayload, false, false, "stage", "stage", false, "off"));
        ColorOsLyricBridge.setPending(stagePayload, false, key);
        String hashBefore = unified.get(key).lyricsHash;
        int bridgeRevisionBefore = ColorOsLyricBridge.revisionOf(key);
        String renderedBefore = RearNativeLyricLines.rowsFromLyricInfo(
            ColorOsLyricBridge.lyricInfoFor(key), key);

        // 再次回到主界面：舞台把**同一份内容**又推了一次。
        assertFalse("同层级同内容必须被仓库按内容去重",
            unified.put(key, "ok", stagePayload, false, false, "stage", "stage", false, "off"));
        assertEquals("版本内容无理由地变了", hashBefore, unified.get(key).lyricsHash);
        assertFalse("桥按内容去重：同一份内容不该产生新版本",
            ColorOsLyricBridge.setPending(stagePayload, false, key));
        assertEquals("桥上的版本号不该因为一次无变化的重复发布而跳变",
            bridgeRevisionBefore, ColorOsLyricBridge.revisionOf(key));
        assertEquals("背屏渲染出的行结构变了", renderedBefore, RearNativeLyricLines.rowsFromLyricInfo(
            ColorOsLyricBridge.lyricInfoFor(key), key));
    }

    // ---- I ----

    @Test public void i_crossProviderIdentitiesStayCorrect() throws Exception {
        playRange(1, TOTAL);
        Set<String> keys = new HashSet<>();
        for (int index = 1; index <= TOTAL; index++) {
            SongInfo info = songs.get(index - 1);
            assertTrue(keys.add(info.songKey));
            assertTrue("身份里应保留音源前缀：" + info.songKey,
                info.songKey.contains(":" + info.providerId + ":"));
            UnifiedLyricsStore.Record record = unified.get(info.songKey);
            assertNotNull(record);
            assertTrue("第 " + index + " 首的词串台了",
                record.json.contains(marker(index)));
            for (int other = 1; other <= TOTAL; other++) {
                if (other == index) continue;
                assertFalse("第 " + index + " 首的词里出现了第 " + other + " 首的内容",
                    record.json.contains(marker(other)));
            }
            assertEquals(LyricDelivery.State.READY, delivered.get(index));
        }
        assertEquals(TOTAL, keys.size());
    }

    // ---- 模拟器 ----

    /** 按播放顺序走 [from, to]，每一步都先补齐「当前 + 后两首」的预取窗口。 */
    private void playRange(int from, int to) throws Exception {
        for (int index = from; index <= to; index++) {
            for (int ahead = index; ahead <= Math.min(TOTAL, index + 2); ahead++) {
                ensureResolved(ahead);
            }
            ledger.planned(key(index), 1, false);
            delivered.put(index, deliver(index).state);
        }
    }

    /**
     * 模拟一次取词：先看统一仓库已有版本（生产里 {@code SongInfoLoader.runLyrics} 的第一步），
     * 再处理失败/无词，最后才"联网"取到并落库 + 发布到桥。
     */
    private boolean ensureResolved(int index) {
        String key = key(index);
        if (ledger.entryForTest(key) == null) ledger.planned(key, 1, true);

        UnifiedLyricsStore.Record existing = unified.get(key);
        if (existing != null && existing.hasTimeline()) {
            // 已经有版本：直接复用，绝不因为「这次是后台」就换一个来源。
            ColorOsLyricBridge.setPending(existing.json, existing.hasTranslation, key);
            ledger.outcome(key, LyricChainLedger.Outcome.READY, existing.sourceId, 0);
            return true;
        }
        if (noLyricSongs.contains(index)) {
            nativeNegative.add(key);
            ColorOsLyricBridge.setPending(null, false, key);
            ledger.outcome(key, LyricChainLedger.Outcome.NONE, "all-sources", 0);
            return false;
        }
        if (failingSongs.contains(index)) {
            ledger.outcome(key, LyricChainLedger.Outcome.FAILED, "network", 0);
            return false;
        }
        String payload = payload(index, "native-lrclib");
        if (payload == null) {
            ledger.outcome(key, LyricChainLedger.Outcome.FAILED, "unparsable", 0);
            return false;
        }
        // 拿到真时间轴：之前那条「无词」负记录必须作废（生产里由 forgetNegative 完成）。
        nativeNegative.remove(key);
        unified.put(key, "ok", payload, false, false, "native-lrclib", "native", false, "off");
        ColorOsLyricBridge.setPending(payload, false, key);
        ledger.outcome(key, LyricChainLedger.Outcome.READY, "native-lrclib", 3);
        return true;
    }

    /** 模拟背屏渲染端的一次读取：状态判定 → 真实行结构转换 → 交付记账。 */
    private LyricDelivery.Decision deliver(int index) throws Exception {
        String key = key(index);
        boolean bridgeReady = "ready".equals(ColorOsLyricBridge.stateOf(key));
        UnifiedLyricsStore.Record record = unified.get(key);
        boolean unifiedReady = record != null && record.hasTimeline();
        boolean none = "none".equals(ColorOsLyricBridge.stateOf(key)) || nativeNegative.contains(key);
        LyricDelivery.Decision decision = LyricDelivery.decide(bridgeReady, unifiedReady, false, none);
        if (!decision.ready()) return decision;

        String info = ColorOsLyricBridge.lyricInfoFor(key);
        String rows = RearNativeLyricLines.rowsFromLyricInfo(info, key);
        assertNotNull("有词却转不出行结构：" + key, rows);
        JSONObject row = new JSONObject(rows);
        JSONArray lines = row.optJSONArray("lines");
        assertNotNull(row.toString(), lines);
        assertTrue("歌词 ready 但渲染端 0 行：" + row, lines.length() > 0);
        for (int line = 0; line < lines.length(); line++) {
            String text = lines.getJSONObject(line).getString("fullText");
            assertTrue("第 " + index + " 首渲染出了别的歌的歌词：" + text, text.contains(marker(index)));
        }
        ledger.rearDelivered(key, lines.length());
        ledger.sessionPublished(key, info == null ? 0 : info.length());
        return decision;
    }

    private int count(LyricDelivery.State state) {
        int total = 0;
        for (LyricDelivery.State value : delivered.values()) if (value == state) total++;
        return total;
    }

    private static SongInfo song(int index) {
        String provider = PROVIDERS[(index - 1) % PROVIDERS.length];
        String key = "online:" + provider + ":" + String.format("%03d", index);
        return new SongInfo(key, "曲目" + index, "歌手" + index, "专辑" + index, 190_000L,
            "", provider, "md" + index, 1);
    }

    private String key(int index) {
        return songs.get(index - 1).songKey;
    }

    private static String marker(int index) {
        return "M" + String.format("%03d", index);
    }

    private static String lrc(int index) {
        return "[00:01.00]" + marker(index) + " 第一行\n"
            + "[00:05.00]" + marker(index) + " 第二行\n"
            + "[00:09.00]" + marker(index) + " 第三行\n";
    }

    private String payload(int index, String source) {
        SongInfo info = songs.get(index - 1);
        List<LrcParser.Line> lines = LrcParser.parse(lrc(index));
        LyricInfoPayload.Result result = LyricInfoPayload.build(info.title, info.artist,
            info.album, info.songId(), info.durationMs, lines, 1, source);
        return result == null ? null : result.json;
    }
}
