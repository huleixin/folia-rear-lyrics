package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.Before;
import org.junit.Test;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/PrefetchWindowTest.java
/**
 * 歌词/封面滚动预取窗口的**行为回归**（2026-10-31 元数据链路统一审计）：
 *
 * <p>此前预取的 upcoming 只从 Media3 队列窗口取，窗口低水位时预取跟着缩水 ——
 * 锁屏连播到后面几首时无词无图，只能现场取词，灵动岛留白。
 * 修复后：窗口不足 2 首时用 {@link NativePlaylist#lookahead} 补齐。这里验证：
 * <ol>
 *   <li>窗口为 0/1 首时补齐到 2 首，顺序即真实播放顺序；</li>
 *   <li>列表循环（含随机+loopAll）时按回绕顺序取，不按原歌单盲目取；</li>
 *   <li>重复歌（当前曲回绕回来）被去重，且退化歌单不死循环；</li>
 *   <li>{@code SongInfo.fromTrack} 携带完整身份（songKey/providerId/mediaId/artwork）。</li>
 * </ol>
 */
public class PrefetchWindowTest {

    private static NativePlaylist.Track track(String key, String artwork) {
        return new NativePlaylist.Track(key, "qq", "mid-" + key,
            "T-" + key, "A", "B", 100_000L, artwork, "", "qq-original");
    }

    private static void replace(List<NativePlaylist.Track> tracks, NativePlaylist.Mode mode, boolean loopAll) {
        NativePlaylist.get().replace(tracks, mode, loopAll, 0L, "test");
    }

    @Before
    public void reset() {
        NativePlaylist.resetForTest();
    }

    @Test
    public void emptyWindowIsFilledToTwoFromThePlaylist() {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        tracks.add(track("s0", "http://c/0.jpg"));
        tracks.add(track("s1", "http://c/1.jpg"));
        tracks.add(track("s2", "http://c/2.jpg"));
        tracks.add(track("s3", "http://c/3.jpg"));
        replace(tracks, NativePlaylist.Mode.SEQUENCE, false);

        SongInfo current = new SongInfo("s0", "T-s0", "A", "B", 100_000L,
            "http://c/0.jpg", "qq", "mid-s0", 7);
        ArrayList<SongInfo> upcoming = NativeAudioEngine.fillUpcomingFromPlaylist(
            current, new ArrayList<>(), 7);

        assertEquals(2, upcoming.size());
        assertEquals("s1", upcoming.get(0).songKey);
        assertEquals("s2", upcoming.get(1).songKey);
        // 预取项必须带着歌词来源需要的全部身份字段。
        assertEquals("mid-s1", upcoming.get(0).mediaId);
        assertEquals("qq", upcoming.get(0).providerId);
        assertEquals("http://c/1.jpg", upcoming.get(0).artworkUrl);
        assertEquals(7, upcoming.get(0).generation);
    }

    @Test
    public void partiallyFilledWindowIsToppedUpWithoutDuplicates() {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        tracks.add(track("s0", ""));
        tracks.add(track("s1", ""));
        tracks.add(track("s2", ""));
        replace(tracks, NativePlaylist.Mode.SEQUENCE, false);

        SongInfo current = new SongInfo("s0", "T", "A", "B", 100_000L, "", "qq", "mid-s0", 3);
        // Media3 窗口已经给出 s1：补齐只追加 s2，不重复 s1。
        ArrayList<SongInfo> upcoming = new ArrayList<>();
        upcoming.add(SongInfo.fromTrack(tracks.get(1), 3));
        upcoming = NativeAudioEngine.fillUpcomingFromPlaylist(current, upcoming, 3);

        assertEquals(2, upcoming.size());
        assertEquals("s1", upcoming.get(0).songKey);
        assertEquals("s2", upcoming.get(1).songKey);
    }

    @Test
    public void loopAllWrapsToTheRealNextSong() {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        tracks.add(track("s0", ""));
        tracks.add(track("s1", ""));
        tracks.add(track("s2", ""));
        replace(tracks, NativePlaylist.Mode.LOOP_ALL, true);

        SongInfo current = new SongInfo("s2", "T", "A", "B", 100_000L, "", "qq", "mid-s2", 5);
        ArrayList<SongInfo> upcoming = NativeAudioEngine.fillUpcomingFromPlaylist(
            current, new ArrayList<>(), 5);

        // 回绕后是 s0、s1 —— 预取窗口跟的是真实播放顺序，不是歌单下标。
        assertEquals("s0", upcoming.get(0).songKey);
        assertEquals("s1", upcoming.get(1).songKey);
    }

    @Test
    public void wrapAroundToSelfIsDeduplicatedAndNeverLoopsForever() {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        tracks.add(track("only", ""));
        replace(tracks, NativePlaylist.Mode.LOOP_ALL, true);

        SongInfo current = new SongInfo("only", "T", "A", "B", 100_000L, "", "qq", "mid-only", 1);
        ArrayList<SongInfo> upcoming = NativeAudioEngine.fillUpcomingFromPlaylist(
            current, new ArrayList<>(), 1);

        assertTrue("single-track loop must not prefetch itself", upcoming.isEmpty());
    }

    @Test
    public void sequenceEndPrefetchesNothingBeyondTheRealEnd() {
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        tracks.add(track("s0", ""));
        tracks.add(track("s1", ""));
        replace(tracks, NativePlaylist.Mode.SEQUENCE, false);

        SongInfo current = new SongInfo("s1", "T", "A", "B", 100_000L, "", "qq", "mid-s1", 2);
        ArrayList<SongInfo> upcoming = NativeAudioEngine.fillUpcomingFromPlaylist(
            current, new ArrayList<>(), 2);
        assertTrue(upcoming.isEmpty());
    }

    @Test
    public void fromTrackCarriesIdentityAndRejectsNulls() {
        NativePlaylist.Track full = track("s9", "http://c/9.jpg");
        SongInfo info = SongInfo.fromTrack(full, 11);
        assertEquals("s9", info.songKey);
        assertEquals("mid-s9", info.mediaId);
        assertEquals("qq", info.providerId);
        assertEquals("T-s9", info.title);
        assertEquals(100_000L, info.durationMs);
        assertEquals("http://c/9.jpg", info.artworkUrl);
        assertEquals(11, info.generation);
        assertNull(SongInfo.fromTrack(null, 1));
        assertNull(SongInfo.fromTrack(new NativePlaylist.Track("", "qq", "", "", "", "",
            0L, "", ""), 1));
    }

    @Test
    public void shuffleUsesTheAlreadyShuffledOrder() {
        // 随机播放时 JS 同步的顺序就是洗好的真实顺序：lookahead 按它取，不重洗。
        List<NativePlaylist.Track> tracks = new ArrayList<>();
        tracks.add(track("b", ""));
        tracks.add(track("a", ""));
        tracks.add(track("c", ""));
        replace(tracks, NativePlaylist.Mode.SHUFFLE, false);

        SongInfo current = new SongInfo("b", "T", "A", "B", 100_000L, "", "qq", "mid-b", 4);
        ArrayList<SongInfo> upcoming = NativeAudioEngine.fillUpcomingFromPlaylist(
            current, new ArrayList<>(), 4);
        assertEquals("a", upcoming.get(0).songKey);
        assertEquals("c", upcoming.get(1).songKey);
    }
}
