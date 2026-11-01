package io.github.huleixin.tingyu.playback;

import org.junit.Before;
import org.junit.Test;

import java.io.File;

import io.github.huleixin.tingyu.coloros.ColorOsLyricBridge;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/ThreeEndLyricSyncTest.java
/**
 * 「三端必须用同一份歌词」的端到端回归（真实仓库落盘 + 真实歌词桥 + 真实仲裁）。
 *
 * <p>被模拟的只有两件 JVM 里做不到的事：HTTP 取词（脚本化的 payload）与 Media3 的换歌
 * 事件（顺序循环）。仓库、覆盖裁决、版本哈希、桥的缓存与淘汰，全部用的是生产代码本身。
 *
 * <p>它证明的是：<b>无论舞台先到还是原生先到、无论舞台中途宣告无词、无论连播多少首，
 * 岛（桥）与背屏拿到的永远是仓库里同一条记录</b>。这一点成立之后，
 * 「三端不同步到同一句歌词」就不可能再由版本分叉造成 —— 剩下只可能是时钟或渲染端，
 * 而那两种情况由 {@link LyricSyncLedger} 单独归因。
 */
public class ThreeEndLyricSyncTest {

    private static final int TRACKS = 20;

    private UnifiedLyricsStore store;

    @Before
    public void setUp() throws Exception {
        File dir = java.nio.file.Files.createTempDirectory("tingyu-three-end").toFile();
        store = new UnifiedLyricsStore(dir);
        ColorOsLyricBridge.clear();
    }

    private static String key(int index) {
        return "song-" + index;
    }

    private static String nativePayload(int index) {
        return "{\"lyric\":\"[00:01.000]native-" + index + "\"}";
    }

    private static String stagePayload(int index) {
        return "{\"lyric\":\"[00:01.000]stage-" + index + "\",\"rawLyric\":\"x\"}";
    }

    /** 模拟 SongInfoLoader：原生取到 → 仲裁 → 写桥。 */
    private LyricTimelineAuthority.Selection nativeArrives(int index) {
        LyricTimelineAuthority.Selection selection = LyricTimelineAuthority.commitNative(
                store, key(index), nativePayload(index), false, "native-lrclib", "off");
        assertTrue(selection.ready());
        ColorOsLyricBridge.setPending(selection.json, selection.hasTranslation, key(index));
        return selection;
    }

    /** 模拟舞台：发布 stage 版 → 仲裁 → 写桥。 */
    private LyricTimelineAuthority.Selection stagePublishes(int index) {
        LyricTimelineAuthority.Selection selection = LyricTimelineAuthority.commitStage(
                store, key(index), stagePayload(index), true, false, "stage", false, "off");
        assertTrue(selection.ready());
        ColorOsLyricBridge.setPending(selection.json, selection.hasTranslation, key(index));
        return selection;
    }

    @Test
    public void islandAndRearAlwaysSeeTheStoreVersionAcrossTwentyTracks() {
        for (int index = 0; index < TRACKS; index++) {
            ColorOsLyricBridge.pin(key(index));
            ColorOsLyricBridge.protectAhead(key(index + 1));
            LyricTimelineAuthority.Selection selection = nativeArrives(index);
            // 岛读桥，背屏读「仓库 + 桥」的权威结果：两者必须是同一串。
            assertEquals("track " + index + " 桥内容与仲裁结果不一致",
                    selection.json, ColorOsLyricBridge.lyricInfoFor(key(index)));
            assertEquals(selection.hash, LyricTimelineAuthority.hashOf(
                    ColorOsLyricBridge.lyricInfoFor(key(index))));
            assertEquals(selection.hash, store.get(key(index)).lyricsHash);
        }
    }

    @Test
    public void stageVersionOverridesTheNativeOneOnEveryEnd() {
        nativeArrives(0);
        String nativeHash = LyricTimelineAuthority.hashOf(nativePayload(0));
        assertEquals(nativeHash, store.get(key(0)).lyricsHash);

        LyricTimelineAuthority.Selection stage = stagePublishes(0);
        assertNotEquals(nativeHash, stage.hash);
        // 岛（桥）与仓库同步换到舞台版 —— 背屏读的就是这两个里的同一个值。
        assertEquals(stage.json, ColorOsLyricBridge.lyricInfoFor(key(0)));
        assertEquals(stage.hash, store.get(key(0)).lyricsHash);
        assertEquals("stage", store.get(key(0)).sourceId);
    }

    @Test
    public void aLateNativeResultMustNotPushTheNativeVersionIntoTheBridge() {
        stagePublishes(0);
        String stageHash = store.get(key(0)).lyricsHash;
        // 舞台版已经在库里，原生取词的结果晚到：put 会被层级裁决拒绝，桥必须保持舞台版。
        LyricTimelineAuthority.Selection late = LyricTimelineAuthority.commitNative(
                store, key(0), nativePayload(0), false, "native-kugou", "off");
        assertEquals(stageHash, late.hash);
        assertEquals(stagePayload(0), late.json);
        ColorOsLyricBridge.setPending(late.json, late.hasTranslation, key(0));
        assertEquals(stagePayload(0), ColorOsLyricBridge.lyricInfoFor(key(0)));
        assertEquals(stageHash, LyricTimelineAuthority.hashOf(
                ColorOsLyricBridge.lyricInfoFor(key(0))));
    }

    @Test
    public void stageSayingNoneCannotBlankTheIslandWhileTheStoreHasATimeline() {
        stagePublishes(0);
        // 舞台这一轮没加载出来、宣告「无词」，但仓库里确实存着时间轴：
        // 修复前这里无条件给桥写 noLyric，岛是空的而背屏（走仓库）照常出词。
        LyricTimelineAuthority.Selection none = LyricTimelineAuthority.commitNone(
                store, key(0), "stage", "off");
        assertEquals(LyricTimelineAuthority.State.READY, none.state);
        assertEquals(stagePayload(0), none.json);
        ColorOsLyricBridge.setPending(none.json, none.hasTranslation, key(0));
        assertEquals("ready", ColorOsLyricBridge.stateOf(key(0)));
        assertEquals(stagePayload(0), ColorOsLyricBridge.lyricInfoFor(key(0)));
    }

    @Test
    public void confirmedNoneStillWinsWhenNothingBetterExists() {
        LyricTimelineAuthority.Selection none = LyricTimelineAuthority.commitNone(
                store, key(5), "stage", "off");
        assertEquals(LyricTimelineAuthority.State.NONE, none.state);
        ColorOsLyricBridge.setPending(null, false, key(5));
        assertEquals("none", ColorOsLyricBridge.stateOf(key(5)));
    }

    @Test
    public void cachedSongKeepsItsRevisionAfterALongRun() {
        // 20 首之后，被钉住的那一首必须仍然是「有时间轴 + 版本号 > 0」。
        // 修复前三张表各有各的淘汰上限（16 / 16 / 32）且只有 timelines 认 pin，
        // 于是同一首歌会出现「时间轴还在、版本号被淘汰归零」这种半截状态 ——
        // fingerprint 随之抖动、会话自检误判版本不一致。
        for (int index = 0; index < TRACKS; index++) {
            ColorOsLyricBridge.pin(key(index));
            ColorOsLyricBridge.protectAhead(key(index + 1));
            nativeArrives(index);
        }
        String pinned = key(TRACKS - 1);
        ColorOsLyricBridge.pin(pinned);
        assertEquals("ready", ColorOsLyricBridge.stateOf(pinned));
        assertTrue("当前曲的版本号被淘汰回 0", ColorOsLyricBridge.revisionOf(pinned) > 0);
        assertTrue(ColorOsLyricBridge.fingerprint(pinned).startsWith("ready@"));
    }

    @Test
    public void removingATimelineRemovesItsRevisionToo() {
        // 三张表的键集合必须一致：撤掉一首的时间轴后，它的版本号也要跟着走，
        // 不能留下「没有时间轴、但版本号还是 3」的幽灵状态。
        nativeArrives(3);
        assertTrue(ColorOsLyricBridge.revisionOf(key(3)) > 0);
        ColorOsLyricBridge.clear();
        for (int index = 0; index < TRACKS; index++) {
            ColorOsLyricBridge.pin(key(index));
            nativeArrives(index);
        }
        assertTrue(ColorOsLyricBridge.cachedCount() <= 16);
    }

    @Test public void fiftyTracksUseTheSameVersionWithLatePreviousTrackResults() {
        for(int index=0;index<50;index++){
            ColorOsLyricBridge.pin(key(index));ColorOsLyricBridge.protectAhead(key(index+1));
            LyricTimelineAuthority.Selection selected=stagePublishes(index);
            if(index>0)nativeArrives(index-1);
            assertEquals(selected.hash,store.get(key(index)).lyricsHash);
            assertEquals(selected.json,ColorOsLyricBridge.lyricInfoFor(key(index)));
        }
    }
}
