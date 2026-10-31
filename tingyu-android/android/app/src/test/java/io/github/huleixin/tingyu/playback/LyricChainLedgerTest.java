package io.github.huleixin.tingyu.playback;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 最近 50 首的歌词状态账本与自动归因。
 *
 * <p>这些归因码是下一轮真机排查的唯一抓手：没有它们，「第 N 首开始没词」只能继续猜。
 */
public class LyricChainLedgerTest {

    @Test public void keepsOnlyTheMostRecentFiftySongs() {
        LyricChainLedger ledger = new LyricChainLedger();
        for (int index = 1; index <= 70; index++) {
            ledger.planned("k" + index, 1, true);
            ledger.outcome("k" + index, LyricChainLedger.Outcome.READY, "native-lrclib", 20);
        }
        assertEquals(LyricChainLedger.CAPACITY, ledger.size());
        assertEquals(null, ledger.entryForTest("k1"));
        assertTrue(ledger.entryForTest("k70") != null);
    }

    @Test public void becomingCurrentIsRememberedSeparatelyFromHavingBeenAhead() {
        LyricChainLedger ledger = new LyricChainLedger();
        ledger.planned("a", 1, true);
        assertTrue(ledger.entryForTest("a").everAhead);
        assertFalse(ledger.entryForTest("a").played);
        ledger.planned("a", 1, false);
        assertTrue("提前安排过的记录不会因为后来播到就消失（那是预取窗口滚动的证据）",
            ledger.entryForTest("a").everAhead);
        assertTrue(ledger.entryForTest("a").played);
    }

    @Test public void aSingleMissingSongIsReportedSeparatelyFromFailures() {
        LyricChainLedger ledger = new LyricChainLedger();
        ledger.planned("current", 1, false);
        ledger.outcome("current", LyricChainLedger.Outcome.READY, "stage", 30);
        ledger.rearDelivered("current", 30);
        ledger.sessionPublished("current", 900);
        ledger.planned("pure-music", 1, true);
        ledger.outcome("pure-music", LyricChainLedger.Outcome.NONE, "all-sources", 0);

        List<String> codes = ledger.classify();
        assertTrue(codes.toString(), codes.contains("song-missing:1"));
        assertFalse(codes.toString(), codes.contains("fetch-failed:1"));
        assertTrue("只是没词，链路是健康的", ledger.healthy());
    }

    @Test public void twoUnresolvedSongsInARowAreAChainBreak() {
        LyricChainLedger ledger = new LyricChainLedger();
        ledger.planned("a", 1, false);
        ledger.outcome("a", LyricChainLedger.Outcome.READY, "stage", 12);
        ledger.planned("b", 1, false);
        ledger.planned("c", 1, false);
        assertTrue(ledger.classify().contains("chain-broken:2"));
        assertFalse(ledger.healthy());
    }

    @Test public void aWindowThatStopsRollingIsDetected() {
        LyricChainLedger ledger = new LyricChainLedger();
        for (String key : new String[]{"a", "b", "c"}) {
            ledger.planned(key, 1, false);   // 只安排过当前曲，从没有「提前安排」的下一首
            ledger.outcome(key, LyricChainLedger.Outcome.READY, "stage", 10);
        }
        assertTrue(ledger.classify().contains("prefetch-stalled"));
    }

    @Test public void prefetchWindowRollingYieldsNoStallCode() {
        LyricChainLedger ledger = new LyricChainLedger();
        for (int index = 1; index <= 5; index++) {
            ledger.planned("k" + index, 1, index > 3);
            ledger.outcome("k" + index, LyricChainLedger.Outcome.READY, "stage", 10);
        }
        assertFalse(ledger.classify().contains("prefetch-stalled"));
    }

    @Test public void readyButNeverDeliveredIsItsOwnCode() {
        LyricChainLedger ledger = new LyricChainLedger();
        ledger.planned("a", 1, false);
        ledger.outcome("a", LyricChainLedger.Outcome.READY, "stage", 10);
        ledger.sessionPublished("a", 500);
        List<String> codes = ledger.classify();
        assertTrue(codes.toString(), codes.contains("ready-not-delivered:1"));
        assertFalse(codes.toString(), codes.contains("ready-not-published:1"));

        ledger.rearDelivered("a", 10);
        assertFalse(ledger.classify().contains("ready-not-delivered:1"));
    }

    @Test public void readyButNeverPublishedToTheSessionIsItsOwnCode() {
        LyricChainLedger ledger = new LyricChainLedger();
        ledger.planned("a", 1, false);
        ledger.outcome("a", LyricChainLedger.Outcome.READY, "native-lrclib", 10);
        ledger.rearDelivered("a", 10);
        assertTrue(ledger.classify().contains("ready-not-published:1"));
    }

    @Test public void aheadSongsDoNotHaveToBeDeliveredYet() {
        LyricChainLedger ledger = new LyricChainLedger();
        ledger.planned("next", 1, true);
        ledger.outcome("next", LyricChainLedger.Outcome.READY, "native-lrclib", 10);
        // 预取好的下一首本来就还没播到：不该被算成「有词没交付」。
        assertFalse(ledger.classify().contains("ready-not-delivered:1"));
        assertFalse(ledger.classify().contains("ready-not-published:1"));
    }

    @Test public void describeCarriesCountsAndCodes() {
        LyricChainLedger ledger = new LyricChainLedger();
        ledger.planned("a", 1, false);
        ledger.outcome("a", LyricChainLedger.Outcome.FAILED, "network", 0);
        String summary = ledger.describe();
        assertTrue(summary, summary.contains("failed=1"));
        assertTrue(summary, summary.contains("fetch-failed:1"));
    }

    @Test public void clearResetsEverything() {
        LyricChainLedger ledger = new LyricChainLedger();
        ledger.planned("a", 1, false);
        ledger.outcome("a", LyricChainLedger.Outcome.READY, "stage", 3);
        ledger.clear();
        assertEquals(0, ledger.size());
        assertFalse(ledger.describe().contains("fetch-failed"));
    }
}
