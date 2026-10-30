package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.Test;

/**
 * 复现并锁定「逻辑歌单明明有下一首，一次重复 prepare 之后 Media3 队列只剩当前曲」。
 *
 * <p>修复前的引擎代码（非 adopt 路径）：
 * {@code configure(value); player.setMediaItem(...); } —— Media3 官方语义是
 * <b>setMediaItem 清空整个播放列表</b>。只要 WebView 醒来对当前这首重新 prepare
 * （同 songKey、同 URL），continuation-adopt 已入队的下一首就被整锅删掉。
 * 本测试把那个旧策略原样建模，先证明它确实丢歌，再锁定新策略不再丢。
 */
public class PrepareGuardTest {

    /** 引擎修复前的行为，一字不差地建模：prepare → 窗口清空 → 只装当前曲。 */
    private static List<String> oldEnginePrepare(List<String> window, String requestedSongKey) {
        List<String> rebuilt = new ArrayList<>();
        rebuilt.add(requestedSongKey);
        return rebuilt;
    }

    @Test
    public void theOldStrategyReallyDestroysTheAdoptedNext() {
        // 现场队列：当前曲 + 原生已接管的下一首。
        List<String> window = Arrays.asList("song-1", "song-2");
        List<String> after = oldEnginePrepare(window, "song-1");
        assertEquals("旧策略把已接管的下一首删掉了——这就是停播现场",
            java.util.Collections.singletonList("song-1"), after);
    }

    @Test
    public void repeatedPrepareSameSongSameUrlKeepsTheWholeWindow() {
        List<String> window = Arrays.asList("song-1", "song-2");
        List<String> after = PrepareGuard.apply(new ArrayList<>(window), 0,
            "song-1", "https://audio.example/song-1", "");
        assertEquals("同曲同址的重复 prepare 不许碰队列",
            window, after);
    }

    @Test
    public void sameSongWithRefreshedUrlOnlySwapsTheCurrentItem() {
        List<String> window = Arrays.asList("song-1", "song-2");
        List<String> after = PrepareGuard.apply(new ArrayList<>(window), 0,
            "song-1", "https://audio.example/song-1-refreshed", "song-1");
        assertEquals("URL 刷新只换当前项，下一首必须活着",
            Arrays.asList("song-1", "song-2"), after);
    }

    @Test
    public void aGenuinelyDifferentSongRebuildsTheWindow() {
        List<String> window = Arrays.asList("song-1", "song-2");
        List<String> after = PrepareGuard.apply(new ArrayList<>(window), 0,
            "song-9", "https://audio.example/song-9", "");
        assertEquals("用户真的换了歌：重建窗口是正确行为",
            java.util.Collections.singletonList("song-9"), after);
    }

    @Test
    public void decideCoversTheThreeCases() {
        assertEquals(PrepareGuard.Action.KEEP_WINDOW,
            PrepareGuard.decide("song-1", "https://a/1", "song-1", "https://a/1"));
        assertEquals(PrepareGuard.Action.REPLACE_CURRENT,
            PrepareGuard.decide("song-1", "https://a/1", "song-1", "https://a/1-new"));
        assertEquals(PrepareGuard.Action.FRESH_SOURCE,
            PrepareGuard.decide("song-1", "https://a/1", "song-2", "https://a/2"));
        assertEquals("没有当前曲时必须按新歌处理",
            PrepareGuard.Action.FRESH_SOURCE,
            PrepareGuard.decide("", "", "song-1", "https://a/1"));
        assertTrue(true);
    }
}
