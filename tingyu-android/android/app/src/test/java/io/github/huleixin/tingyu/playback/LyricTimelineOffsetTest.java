package io.github.huleixin.tingyu.playback;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/LyricTimelineOffsetTest.java
/**
 * 用户偏移烘焙的行为回归。三端共用同一坐标的前提是：
 * <ol>
 *   <li>烘焙恰好一次 —— 原生兜底链只在自己的取词结果上烘，权威选择后无人再加；</li>
 *   <li>方向与 JS 侧一致（正 = 延后，即时间戳变大）；</li>
 *   <li>没有偏移时原样返回，绝不产生「看起来变了其实没变」的假版本。</li>
 * </ol>
 */
public class LyricTimelineOffsetTest {

    @Before
    public void setUp() { LyricTimelineOffset.resetForTest(); }

    @After
    public void tearDown() { LyricTimelineOffset.resetForTest(); }

    @Test
    public void zeroOffsetReturnsThePayloadUntouched() {
        String payload = "{\"lyric\":\"[00:12.345]第一行\\n[00:20.000]第二行\"}";
        assertEquals(payload, LyricTimelineOffset.bake(payload, "song-a"));
    }

    @Test
    public void positiveOffsetDelaysEveryLine() {
        LyricTimelineOffset.set("song-a", 500L);
        String payload = "{\"lyric\":\"[00:12.345]第一行\\n[01:02.500]第二行\"}";
        String baked = LyricTimelineOffset.bake(payload, "song-a");
        // 12345ms + 500ms = 12845ms；62500ms + 500ms = 63000ms。
        assertTrue(baked.contains("[0:12.845]"));
        assertTrue(baked.contains("[1:03.000]"));
    }

    @Test
    public void negativeOffsetClampsAtZero() {
        String payload = "{\"lyric\":\"[00:00.500]开头\"}";
        LyricTimelineOffset.set("song-a", -800L);
        String baked = LyricTimelineOffset.bake(payload, "song-a");
        // 不能出现负时间标签。
        assertTrue(baked.contains("[0:00.000]"));
    }

    @Test
    public void perSongEntryWinsOverTheGlobalValue() {
        LyricTimelineOffset.setGlobal(300L);
        LyricTimelineOffset.set("song-a", 700L);
        assertEquals(700L, LyricTimelineOffset.forSong("song-a"));
        assertEquals(300L, LyricTimelineOffset.forSong("song-b"));
    }

    @Test
    public void unknownSongFallsBackToTheGlobalValue() {
        LyricTimelineOffset.setGlobal(250L);
        assertEquals(250L, LyricTimelineOffset.forSong("never-seen"));
    }

    @Test
    public void noGlobalValueMeansZero() {
        assertEquals(0L, LyricTimelineOffset.forSong("never-seen"));
    }

    @Test
    public void wordTagsShiftTogetherWithLineTags() {
        LyricTimelineOffset.set("song-a", 1_000L);
        String payload = "{\"lyric\":\"[00:10.000]行\",\"rawLyric\":\"[00:10.000]<00:10.100,300>字<00:10.400,300>词\"}";
        String baked = LyricTimelineOffset.bake(payload, "song-a");
        assertTrue(baked.contains("[0:11.000]"));
        assertTrue(baked.contains("<0:11.100,300>"));
        assertTrue(baked.contains("<0:11.400,300>"));
    }

    @Test
    public void translationLaneShiftsWithTheSameOffset() {
        LyricTimelineOffset.set("song-a", 500L);
        String payload = "{\"lyric\":\"[00:30.000]行\",\"translationLyric\":\"[00:30.000]line\"}";
        String baked = LyricTimelineOffset.bake(payload, "song-a");
        assertTrue(baked.contains("[0:30.500]line"));
    }

    @Test
    public void brokenJsonComesBackAsIs() {
        String broken = "{\"lyric\":\"[00:12.345]";
        LyricTimelineOffset.set("song-a", 500L);
        assertEquals(broken, LyricTimelineOffset.bake(broken, "song-a"));
    }

    @Test
    public void fractionalTagsParseAsDecimalsNotMilliseconds() {
        // [00:10.5] 是 10.5 秒（10500ms），不是 5ms —— 与 JS parseTimestamp 同语义。
        LyricTimelineOffset.set("song-a", 500L);
        String baked = LyricTimelineOffset.bake("{\"lyric\":\"[00:10.5]行\"}", "song-a");
        assertTrue(baked.contains("[0:11.000]"));
    }

    /**
     * 旧缓存（可能已烘焙、用量未知）必须原样交付：宁可偏移定格，绝不二次叠加。
     * 该版本被正常发布/取词刷新（offsetKnown=true）后自动回到恰好一次的轨道。
     */
    @Test
    public void unknownProvenanceDeliversWithoutBaking() {
        LyricTimelineOffset.set("song-a", 500L);
        String payload = "{\"lyric\":\"[00:12.345]第一行\"}";
        assertEquals(payload, LyricTimelineOffset.bakeIfKnown(payload, "song-a", false));
        assertTrue(LyricTimelineOffset.bakeIfKnown(payload, "song-a", true).contains("[0:12.845]"));
    }

    /** 持久化快照/恢复往返：进程重建后原生兜底取词仍能拿到同一份偏移。 */
    @Test
    public void snapshotAndRestoreRoundTrip() {
        LyricTimelineOffset.setGlobal(300L);
        LyricTimelineOffset.set("song-a", 700L);
        LyricTimelineOffset.set("song-b", -200L);
        java.util.Map<String, Long> snapshot = LyricTimelineOffset.snapshotPerSong();
        long savedGlobal = LyricTimelineOffset.global();

        LyricTimelineOffset.resetForTest();
        assertEquals(0L, LyricTimelineOffset.forSong("song-a"));

        LyricTimelineOffset.restore(snapshot, savedGlobal);
        // 恢复后语义不变：单曲覆盖全局，未同步的歌退回全局值。
        assertEquals(700L, LyricTimelineOffset.forSong("song-a"));
        assertEquals(-200L, LyricTimelineOffset.forSong("song-b"));
        assertEquals(300L, LyricTimelineOffset.forSong("song-c"));
    }
}
