package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/LyricTimelineAuthorityTest.java
/**
 * 三端统一时间轴版本的行为回归。
 *
 * <p>核心契约只有一条：<b>只要 {@link UnifiedLyricsStore} 里有结论，三端就必须用它</b>，
 * 任何一端都不许拿自己刚到手的那一份去覆盖它。
 */
public class LyricTimelineAuthorityTest {

    private static final String STAGE_JSON = "{\"lyric\":\"[00:01.000]stage\",\"rawLyric\":\"x\"}";
    private static final String NATIVE_JSON = "{\"lyric\":\"[00:01.000]native\"}";

    private static UnifiedLyricsStore.Record record(String status, String json, boolean hasTranslation,
                                                    String sourceId, boolean userChoice, int revision) {
        return new UnifiedLyricsStore.Record("song-1", status, json, hasTranslation, false,
                sourceId, json == null ? "" : UnifiedLyricsStore.shortHash(json),
                "stage", userChoice, "off", revision, 1L);
    }

    @Test
    public void unifiedRecordWinsOverIncomingPayload() {
        // 舞台版已在仓库里，原生兜底版此时才到：三端必须仍然是舞台版。
        // 修复前这里会把原生版写进桥，于是灵动岛是逐行 LRC、背屏与舞台是舞台版。
        UnifiedLyricsStore.Record kept = record("ok", STAGE_JSON, true, "stage", false, 3);
        LyricTimelineAuthority.Selection selection =
                LyricTimelineAuthority.select(kept, NATIVE_JSON, false);
        assertEquals(LyricTimelineAuthority.State.READY, selection.state);
        assertEquals(STAGE_JSON, selection.json);
        assertTrue(selection.hasTranslation);
        assertEquals("stage", selection.sourceId);
        assertEquals(3, selection.revision);
    }

    @Test
    public void noRecordFallsBackToIncomingPayload() {
        // 仓库还没有记录（异步落盘前 / 没有 songKey 的老调用方）：这份就是唯一候选。
        LyricTimelineAuthority.Selection selection =
                LyricTimelineAuthority.select(null, NATIVE_JSON, false);
        assertEquals(LyricTimelineAuthority.State.READY, selection.state);
        assertEquals(NATIVE_JSON, selection.json);
        assertEquals(-1, selection.revision);
        assertEquals(LyricTimelineAuthority.hashOf(NATIVE_JSON), selection.hash);
    }

    @Test
    public void confirmedNoneIsNoneEvenWhenAPayloadArrives() {
        UnifiedLyricsStore.Record none = record("none", null, false, "stage", false, 2);
        LyricTimelineAuthority.Selection selection =
                LyricTimelineAuthority.select(none, NATIVE_JSON, false);
        assertEquals(LyricTimelineAuthority.State.NONE, selection.state);
        assertNull(selection.json);
        // 但「确认无词」绝不能被写进桥当时间轴：调用方据此写 noLyric 桩。
        assertFalse(selection.ready());
    }

    @Test
    public void emptyIncomingWithoutRecordIsPending() {
        LyricTimelineAuthority.Selection selection = LyricTimelineAuthority.select(null, "", false);
        assertEquals(LyricTimelineAuthority.State.PENDING, selection.state);
        assertTrue(selection.hash.isEmpty());
    }

    @Test
    public void userChoiceRecordStillWins() {
        UnifiedLyricsStore.Record user = record("ok", STAGE_JSON, false, "stage-override", true, 9);
        LyricTimelineAuthority.Selection selection =
                LyricTimelineAuthority.select(user, NATIVE_JSON, false);
        assertEquals(STAGE_JSON, selection.json);
        assertEquals("stage-override", selection.sourceId);
        assertEquals(9, selection.revision);
    }

    @Test
    public void versionKeyIsComparableAcrossEnds() {
        UnifiedLyricsStore.Record kept = record("ok", STAGE_JSON, false, "stage", false, 3);
        String island = LyricTimelineAuthority.select(kept, null, false).versionKey();
        String rear = LyricTimelineAuthority.select(kept, STAGE_JSON, false).versionKey();
        String stage = LyricTimelineAuthority.select(kept, STAGE_JSON, true).versionKey();
        assertEquals(island, rear);
        assertEquals(island, stage);
        // 换成另一首/另一版就必须不一样，否则这个键没有分辨力。
        assertNotEquals(island,
                LyricTimelineAuthority.select(record("ok", NATIVE_JSON, false, "native", false, 3),
                        null, false).versionKey());
    }

    @Test
    public void hashMatchesTheStoreAlgorithm() {
        assertEquals(UnifiedLyricsStore.shortHash(STAGE_JSON), LyricTimelineAuthority.hashOf(STAGE_JSON));
        assertEquals("", LyricTimelineAuthority.hashOf(null));
        assertEquals("", LyricTimelineAuthority.hashOf(""));
    }
}
