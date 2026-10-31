package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/UnifiedLyricsStoreTest.java
/**
 * 统一歌词仓库的行为回归（真实磁盘、临时目录）。
 *
 * <p>覆盖三条关键契约：
 * <ol>
 *   <li>持久化：写盘后重新打开仓库仍能读到（MainActivity/WebView 不在时后台可用）；</li>
 *   <li>层级：native 取词不能覆盖 stage/stage-override 版本，userChoice 高于一切；</li>
 *   <li>失败保护：取词失败只会「不写」，绝不会把已确认的有效歌词顶掉或清空。</li>
 * </ol>
 */
public class UnifiedLyricsStoreTest {

    private static final String KEY = "song-key-1";
    private static final String NATIVE_JSON = "{\"lyric\":\"[00:01.000]native\"}";
    private static final String STAGE_JSON = "{\"lyric\":\"[00:01.000]stage\",\"rawLyric\":\"x\"}";

    private static File tempDir() throws Exception {
        return Files.createTempDirectory("unified-lyrics-test").toFile();
    }

    @Test
    public void putThenReadBackAfterReopen() throws Exception {
        File dir = tempDir();
        UnifiedLyricsStore store = new UnifiedLyricsStore(dir);
        assertTrue(store.put(KEY, "ok", STAGE_JSON, true, true, "stage", "stage", false, "off"));
        store.flushForTest();

        UnifiedLyricsStore reopened = new UnifiedLyricsStore(dir);
        UnifiedLyricsStore.Record record = reopened.get(KEY);
        assertNotNull(record);
        assertTrue(record.hasTimeline());
        assertEquals(STAGE_JSON, record.json);
        assertEquals("stage", record.confirmedBy);
        assertEquals("stage", record.sourceId);
        assertTrue(record.hasWordByWord);
        assertTrue(record.hasTranslation);
        assertEquals(1, record.revision);
        assertEquals(16, record.lyricsHash.length());
    }

    @Test
    public void nativeFetchDoesNotOverwriteStageConfirmation() throws Exception {
        File dir = tempDir();
        UnifiedLyricsStore store = new UnifiedLyricsStore(dir);
        assertTrue(store.put(KEY, "ok", STAGE_JSON, false, true, "stage", "stage", false, "off"));
        // 后台取到另一个版本（native 层级）：被层级裁决拒绝。
        assertFalse(store.put(KEY, "ok", NATIVE_JSON, false, false, "native-kugou", "native", false, "off"));
        UnifiedLyricsStore.Record record = store.get(KEY);
        assertEquals(STAGE_JSON, record.json);
        assertEquals("stage", record.sourceId);
    }

    @Test
    public void stageConfirmationUpgradesEarlierNativeFetch() throws Exception {
        File dir = tempDir();
        UnifiedLyricsStore store = new UnifiedLyricsStore(dir);
        assertTrue(store.put(KEY, "ok", NATIVE_JSON, false, false, "native-lrclib", "native", false, "off"));
        assertTrue(store.put(KEY, "ok", STAGE_JSON, true, true, "stage", "stage", false, "off"));
        UnifiedLyricsStore.Record record = store.get(KEY);
        assertEquals(STAGE_JSON, record.json);
        assertEquals(2, record.revision);
        // 层级升级后，迟到的原生结果再也进不来。
        assertFalse(store.put(KEY, "ok", NATIVE_JSON, false, false, "native-lrclib", "native", false, "off"));
    }

    @Test
    public void userChoiceSurvivesEverything() throws Exception {
        File dir = tempDir();
        UnifiedLyricsStore store = new UnifiedLyricsStore(dir);
        assertTrue(store.put(KEY, "ok", STAGE_JSON, false, false, "stage", "stage", false, "off"));
        assertTrue(store.markUserChoice(KEY, "t2s"));
        UnifiedLyricsStore.Record chosen = store.get(KEY);
        assertTrue(chosen.userChoice);
        // 舞台随后重发同一首歌（层级 stage）也不许覆盖用户的选择。
        assertFalse(store.put(KEY, "ok", NATIVE_JSON, false, false, "stage", "stage", false, "off"));
        assertEquals(chosen.json, store.get(KEY).json);
    }

    @Test
    public void identicalRepublishIsAcceptedSilentlyOrRejected() throws Exception {
        File dir = tempDir();
        UnifiedLyricsStore store = new UnifiedLyricsStore(dir);
        assertTrue(store.put(KEY, "ok", STAGE_JSON, false, false, "stage", "stage", false, "off"));
        // 同层级同哈希：拒绝（无副作用），记录仍是 revision 1。
        assertFalse(store.put(KEY, "ok", STAGE_JSON, false, false, "stage", "stage", false, "off"));
        assertEquals(1, store.get(KEY).revision);
    }

    @Test
    public void confirmedNoLyricDoesNotWipeValidRecordAboveItsTier() throws Exception {
        File dir = tempDir();
        UnifiedLyricsStore store = new UnifiedLyricsStore(dir);
        // 用户选定的有效歌词在库。
        assertTrue(store.put(KEY, "ok", STAGE_JSON, false, false, "stage", "stage", true, "off"));
        // 前台/后台任何一方确认「这首没词」（stage 层级 none）：层级低于 userChoice，被拒。
        assertFalse(store.put(KEY, "none", null, false, false, "stage", "stage", false, "off"));
        assertTrue(store.get(KEY).hasTimeline());
    }

    @Test
    public void confirmedNoLyricRecordsAtNativeTierThenStageUpgrade() throws Exception {
        File dir = tempDir();
        UnifiedLyricsStore store = new UnifiedLyricsStore(dir);
        assertTrue(store.put(KEY, "none", null, false, false, "native", "native", false, "off"));
        UnifiedLyricsStore.Record none = store.get(KEY);
        assertNotNull(none);
        assertFalse(none.hasTimeline());
        // 舞台随后拿到词：stage 层级覆盖 native 的 none。
        assertTrue(store.put(KEY, "ok", STAGE_JSON, false, false, "stage", "stage", false, "off"));
        assertTrue(store.get(KEY).hasTimeline());
    }

    @Test
    public void emptyKeyIsRejected() throws Exception {
        UnifiedLyricsStore store = new UnifiedLyricsStore(tempDir());
        assertFalse(store.put("", "ok", STAGE_JSON, false, false, "stage", "stage", false, "off"));
        assertNull(store.get((String) null));
        assertFalse(store.markUserChoice("", "off"));
    }

    @Test
    public void diskRecordSurvivesCorruptNeighbor() throws Exception {
        File dir = tempDir();
        UnifiedLyricsStore store = new UnifiedLyricsStore(dir);
        assertTrue(store.put(KEY, "ok", STAGE_JSON, false, false, "stage", "stage", false, "off"));
        store.flushForTest();
        // 旁边放一个损坏文件：不影响其他歌曲的读取。
        Files.write(new File(dir, "garbage.json").toPath(),
                "not json".getBytes(StandardCharsets.UTF_8));
        assertNotNull(store.get(KEY));
        assertNull(store.get("song-key-2"));
    }
}
