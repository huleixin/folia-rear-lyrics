package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 「这条歌词是不是这首歌」。真机上最难查的错误不是没词，而是**别人的词**：
 * 时间轴看起来完全正常，只有听过原曲的人才知道串了。
 */
public class LyricMatchTest {

    private static LyricMatch.Candidate candidate(String title, String artist, long seconds, String lrc) {
        return new LyricMatch.Candidate(1L, title, artist, "专辑", seconds * 1000L, false, lrc, null);
    }

    @Test public void prefersTheOneWithMatchingDuration() {
        LyricMatch.Candidate studio = candidate("起风了", "买辣椒也用券", 325, "[00:01.00]a");
        LyricMatch.Candidate live = candidate("起风了", "买辣椒也用券", 402, "[00:01.00]b");
        LyricMatch.Score best = LyricMatch.pick(Arrays.asList(live, studio), "起风了", "买辣椒也用券", "专辑", 326_000L);
        assertNotNull(best);
        assertEquals(studio, best.candidate);
        assertTrue(best.durationDeltaMs <= 2000);
    }

    @Test public void rejectsVersionsThatAreTooFarFromTheRealDuration() {
        // 只有一个时长差 77 秒的现场版：宁可不显示，也不显示错的词。
        LyricMatch.Candidate live = candidate("起风了", "买辣椒也用券", 402, "[00:01.00]b");
        assertNull(LyricMatch.pick(Collections.singletonList(live), "起风了", "买辣椒也用券", "", 325_000L));
    }

    @Test public void rejectsSameTitleByAnotherArtist() {
        LyricMatch.Candidate other = candidate("起风了", "某翻唱歌手", 325, "[00:01.00]x");
        assertNull(LyricMatch.pick(Collections.singletonList(other), "起风了", "买辣椒也用券", "", 325_000L));
    }

    @Test public void ignoresVersionSuffixesInBrackets() {
        assertEquals(LyricMatch.normalize("起风了 (Live)"), LyricMatch.normalize("起风了"));
        assertEquals(LyricMatch.normalize("Hello (Remastered 2011)"), "hello");
        LyricMatch.Candidate tagged = candidate("起风了（电视剧片尾曲）", "买辣椒也用券", 325, "[00:01.00]a");
        assertNotNull(LyricMatch.pick(Collections.singletonList(tagged), "起风了", "买辣椒也用券", "", 325_000L));
    }

    @Test public void acceptsUnknownDurationWhenTitleAndArtistAgree() {
        LyricMatch.Candidate exact = candidate("夜曲", "周杰伦", 0, "[00:01.00]a");
        LyricMatch.Score best = LyricMatch.pick(Collections.singletonList(exact), "夜曲", "周杰伦", "", 0L);
        assertNotNull(best);
        assertEquals(-1, best.durationDeltaMs);
    }

    @Test public void doesNotAcceptAPartialTitleOfAnotherSong() {
        // 「起风」是「起风了」的子串，但长度比不足 0.6 → 不是同一首。
        LyricMatch.Candidate shortTitle = candidate("起风", "买辣椒也用券", 325, "[00:01.00]a");
        assertNull(LyricMatch.pick(Collections.singletonList(shortTitle), "起风了", "买辣椒也用券", "", 325_000L));
    }

    @Test public void fallsBackToTheBestOfSeveralCandidates() {
        LyricMatch.Candidate wrong = candidate("起风了", "别人", 120, "[00:01.00]a");
        LyricMatch.Candidate right = candidate("起风了", "买辣椒也用券", 325, "[00:01.00]b");
        LyricMatch.Score best = LyricMatch.pick(Arrays.asList(wrong, right), "起风了", "买辣椒也用券", "", 325_000L);
        assertNotNull(best);
        assertEquals(right, best.candidate);
        assertTrue(best.score >= LyricMatch.MIN_ACCEPT_SCORE);
    }
}
