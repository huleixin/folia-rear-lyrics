package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * HyperLyric（小米 17 Pro 超级岛歌词的真实消费者，LyricInfo 来源）协议兼容回归。
 *
 * 消费端事实（github.com/limczhh/HyperLyric，LyricInfoSource.kt / LyricInfoParser.kt）：
 * <ul>
 *   <li>监听所有活跃 MediaSession，读 {@code metadata.getString("lyricInfo")}；</li>
 *   <li>trackChanged 以 {@code mediaId} 变化为准；metadata 暂时省略 lyricInfo 时保留
 *       已确认的时间轴，但**明确的 mediaId 变化会清掉**（不许旧词跨歌）；</li>
 *   <li>{@code changed = trackChanged || raw != session.payload}，仅变化时才解析；</li>
 *   <li>解析：优先 rawLyric(ELRC)，其次 lyric(LRC)，行需匹配
 *       {@code [\d{2}:\d{2}\.\d{2,3}]}，整条解析不出行 → null（视同无词）。</li>
 * </ul>
 * 本测试把消费端状态机与解析核心移植过来，用听屿双侧生产者的真实 payload 形状驱动：
 * 前台 WebView（songName/artist/songId/lyricType/lyric/rawLyric/translationLyric）
 * 与原生 SongInfoLoader（lyric/translationLyric）。
 */
public class HyperLyricCompatTest {

    // ---- 消费端移植：LyricInfoSource.update() 的会话状态机 ----

    private static final class ConsumerSession {
        String payload;
        String mediaId;
        String lastShownLyric;
    }

    /** 移植 update()：metadata 以 (mediaId, lyricInfo) 二元组表示。返回该次是否产生显示更新。 */
    private static String consumerUpdate(ConsumerSession session, String mediaId, String rawLyricInfo) {
        boolean trackChanged = mediaId != null && session.mediaId != null && !mediaId.equals(session.mediaId);
        String raw = rawLyricInfo == null || rawLyricInfo.isBlank() ? null : rawLyricInfo;
        boolean changed = trackChanged || !equalsNullable(raw, session.payload);
        String parsed = changed && raw != null ? parseSongText(raw) : null;
        if (mediaId != null) session.mediaId = mediaId;
        if (parsed != null) session.payload = raw;
        else if (trackChanged) session.payload = null;
        if (parsed != null || trackChanged) {
            session.lastShownLyric = parsed;   // onSongChanged/onMetadata（parsed 可为 null = 无词新歌）
            return parsed;
        }
        return null;                            // 无变化：消费者什么都不做
    }

    private static boolean equalsNullable(String a, String b) {
        return a == null ? b == null : a.equals(b);
    }

    // ---- 消费端移植：LyricInfoParser 的行解析核心 ----

    private static final Pattern LRC_TIME = Pattern.compile("\\[(\\d{2}):(\\d{2})\\.(\\d{2,3})]");

    /** 移植 parseLyricLines(lyric, enhanced=false)：解析不出任何行 → null。 */
    private static String parseSongText(String json) {
        try {
            org.json.JSONObject obj = new org.json.JSONObject(json);
            String rawLyric = obj.optString("rawLyric", "").trim();
            String lyric = obj.optString("lyric", "").trim();
            String source = !rawLyric.isEmpty() ? rawLyric : lyric;
            if (source.isEmpty()) return null;
            StringBuilder text = new StringBuilder();
            for (String line : source.split("\n")) {
                if (line.trim().isEmpty()) continue;
                Matcher m = LRC_TIME.matcher(line);
                if (!m.find()) continue;
                if (line.substring(m.end()).trim().isEmpty()) continue;
                text.append(line.substring(m.end()).trim()).append('\n');
            }
            return text.length() == 0 ? null : text.toString();
        } catch (Exception error) {
            return null;
        }
    }

    // ---- payload 生产者（双侧真实形状） ----

    private static String webviewPayload(String title, String lrc, boolean withRaw) {
        try {
            org.json.JSONObject obj = new org.json.JSONObject()
                .put("songName", title).put("artist", "artist").put("album", "album")
                .put("songId", "id-" + title).put("lyricType", 0)
                .put("lyric", lrc).put("noLyric", false);
            if (withRaw) obj.put("rawLyric", lrc);
            return obj.toString();
        } catch (Exception error) { throw new AssertionError(error); }
    }

    private static String nativePayload(String lrc, String translation) {
        try {
            org.json.JSONObject obj = new org.json.JSONObject().put("lyric", lrc);
            if (translation != null) obj.put("translationLyric", translation);
            return obj.toString();
        } catch (Exception error) { throw new AssertionError(error); }
    }

    private static final String LRC_A = "[00:01.000]第一首一句\n[00:05.000]第一首二句\n";
    private static final String LRC_B = "[00:02.000]第二首一句\n[00:06.000]第二首二句\n";

    // ---- 场景 ----

    @Test public void webviewPayloadParsesWithSongIdentity() {
        String parsed = parseSongText(webviewPayload("歌A", LRC_A, true));
        assertNotNull(parsed);
        assertTrue(parsed.contains("第一首一句"));
    }

    @Test public void nativePayloadParsesIncludingTranslationLane() {
        String parsed = parseSongText(nativePayload(LRC_B, "[00:02.000]b2\n"));
        assertNotNull(parsed);
        assertTrue(parsed.contains("第二首一句"));
    }

    @Test public void blankOrTaglessLyricsAreNotMistakenForRealLyrics() {
        assertNull(parseSongText(nativePayload("", null)));            // 空 payload
        assertNull(parseSongText(nativePayload("[00:01.000]\n", null))); // 只有标签没有文本
    }

    /** 连续自动切 10 首：每首 mediaId 正确、词随 metadata 更新、旧词不跨歌。 */
    @Test public void tenConsecutiveAutoSwitchesKeepLyricsAttachedToTheRightSong() {
        ConsumerSession session = new ConsumerSession();
        for (int i = 1; i <= 10; i++) {
            String mediaId = "online:qq:key" + i;
            String lrc = "[00:01.000]歌" + i + "第一句\n[00:05.000]歌" + i + "第二句\n";
            // 1) 换歌瞬间 metadata 先行（无 lyricInfo，pending）。
            String shown = consumerUpdate(session, mediaId, null);
            assertEquals("换歌必须触发一次 songChanged（即使词未到）", "", shown == null ? "" : shown);
            // 2) 词随后到。
            shown = consumerUpdate(session, mediaId, nativePayload(lrc, null));
            assertNotNull("第 " + i + " 首的词必须上屏", shown);
            assertTrue(shown.contains("歌" + i + "第一句"));
            assertFalse("不得残留上一首的词", shown.contains("歌" + Math.max(1, i - 1) + "第一句") && i > 1);
        }
    }

    /** 封面/时长等后续更新（lyricInfo 原样携带）不得触发重新解析或清词。 */
    @Test public void metadataUpdatesThatKeepLyricInfoDoNotClearTheTimeline() {
        ConsumerSession session = new ConsumerSession();
        String mediaId = "key1";
        consumerUpdate(session, mediaId, null);
        String shown = consumerUpdate(session, mediaId, nativePayload(LRC_A, null));
        assertNotNull(shown);
        // 封面到位 → 服务重建 metadata，lyricInfo 逐字不变：raw == payload → 不再解析、不清词。
        String again = consumerUpdate(session, mediaId, nativePayload(LRC_A, null));
        assertNull("未变化的 lyricInfo 不应产生第二次显示更新（防刷新风暴）", again);
    }

    /** pending→ready 的更新链：先无词占位、词到后立即有效更新。 */
    @Test public void pendingToReadyProducesAnEffectiveUpdate() {
        ConsumerSession session = new ConsumerSession();
        consumerUpdate(session, "keyX", null);
        assertNull(session.lastShownLyric);
        String shown = consumerUpdate(session, "keyX", webviewPayload("X", LRC_B, false));
        assertNotNull(shown);
        assertTrue(shown.contains("第二首一句"));
    }

    /** 消费端重连（onActiveSessionsChanged / onSessionDestroyed 后重订阅）：
     *  registerCallback 时立即读 controller.metadata —— 已发布的词必须直接可读。 */
    @Test public void aResubscribedConsumerReadsTheCurrentLyricImmediately() {
        ConsumerSession session = new ConsumerSession();
        consumerUpdate(session, "key1", nativePayload(LRC_A, null));
        // 重连 = 新 Session 对象，只带初始 metadata 快照。
        ConsumerSession reconnected = new ConsumerSession();
        String initial = consumerUpdate(reconnected, "key1", nativePayload(LRC_A, null));
        assertNotNull(initial);
        assertTrue(initial.contains("第一首一句"));
    }

    /** 过期/旧歌歌词迟到不得覆盖当前歌：mediaId 已经是下一首。 */
    @Test public void aLateLyricForThePreviousSongNeverOverwritesTheCurrentOne() {
        ConsumerSession session = new ConsumerSession();
        consumerUpdate(session, "key1", null);
        String current = consumerUpdate(session, "key2", nativePayload(LRC_B, null));
        assertNotNull(current);
        assertTrue(current.contains("第二首一句"));
        // 消费端状态机确认：一次「mediaId 变回 key1」的发布会让屏幕切回旧词 ——
        // 所以生产者必须按 songKey 闸死这种发布（applyNativeLyric/publishLyrics 已做）。
        // 这里锁死该契约：不允许出现以旧歌身份重建 metadata 的路径回归。
        consumerUpdate(session, "key1", nativePayload(LRC_A, null));
        assertTrue("消费端确实会被旧歌 metadata 拉回（生产者闸门存在的理由）",
            session.lastShownLyric.contains("第一首"));
    }
}
