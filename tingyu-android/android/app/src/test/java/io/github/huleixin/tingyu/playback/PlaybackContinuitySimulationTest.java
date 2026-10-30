package io.github.huleixin.tingyu.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/PlaybackContinuitySimulationTest.java
/**
 * The background-continuation protocol, driven across dozens of track boundaries with a JS side
 * that can be frozen, late, confused or silent.
 *
 * What this is: a deterministic simulation of Media3's playlist (a list plus a current index) on
 * top of the production decision classes - {@link QueueSupervision} for "should I ask, hold or
 * give up" and {@link QueueLedger} for "does this window reconcile". Every branch that decides
 * whether a background session lives or dies is therefore the shipped code.
 *
 * What this is not: a device test. ExoPlayer's own buffering, network and audio-output behaviour
 * is out of scope here and still needs the phone (see the delivery notes).
 *
 * Each scenario runs twice. {@code legacyProtocol=true} reproduces the two conversions the old
 * native side made, which is why the "before" runs stall exactly where users reported:
 * <ol>
 *   <li>an answer that could not decide ("aborted because the playback intent changed", "the
 *       anchor is not in my queue") was converted into {@code continues=false}, i.e. "the
 *       playlist finished";</li>
 *   <li>that statement was applied before the window was reconciled, so even a refused window
 *       could end the session, and after two nudges the engine stopped asking at all.</li>
 * </ol>
 */
public class PlaybackContinuitySimulationTest {

    /** Stands in for ExoPlayer plus the JS resolver. */
    private static final class Sim {
        final boolean legacy;
        final List<String> logical = new ArrayList<>();
        final List<String> nativeIds = new ArrayList<>();
        final List<String> played = new ArrayList<>();
        final QueueSupervision supervision = new QueueSupervision();
        int index;
        int window = 5;
        long now = 1_000L;
        long generation;
        boolean ended;
        boolean paused;
        long frozenUntil = -1L;
        /** The next answer arrives from a resolver that cannot find its anchor. */
        boolean confuseNext;
        int asks;
        int staleAnswers;

        Sim(boolean legacy, int tracks) {
            this.legacy = legacy;
            for (int i = 0; i < tracks; i++) logical.add("s" + i);
        }

        void start() {
            String first = logical.get(0);
            nativeIds.add(first);
            played.add(first);
            index = 0;
            // A prepare declares nothing about the playlist; the window command that always
            // follows a prepare in the main playback context is what does.
            supervision.continuation(QueueSupervision.Continuation.FINISHED, ++generation);
            supervision.satisfied();
            answer(first);
        }

        boolean frozen() {
            return frozenUntil >= 0 && now < frozenUntil;
        }

        /** Runs boundaries until the handed-over window is exhausted, or the cap is reached. */
        int runUntilDrained(int maxBoundaries) {
            int executed = 0;
            while (!ended && executed < maxBoundaries) {
                boundary();
                executed++;
            }
            return executed;
        }

        /** One song finished: Media3 advances, or reaches the end of what it holds. */
        void boundary() {
            if (index + 1 < nativeIds.size()) {
                index++;
                ended = false;
                played.add(nativeIds.get(index));
            } else {
                ended = true;
            }
            step();
        }

        void step() {
            String key = nativeIds.get(index);
            int remaining = nativeIds.size() - index - 1;
            QueueSupervision.Action action = supervision.evaluate(key, remaining, ended, paused, now);
            if (action == QueueSupervision.Action.NONE) return;
            asks++;
            if (frozen()) return;
            answer(key);
        }

        /** Runs the retry schedule forward until the session resumes or the clock budget ends. */
        void advanceTo(long until) {
            while (now < until && ended && supervision.waiting()) {
                now += 5_000L;
                step();
            }
        }

        List<String> resolveAfter(String anchor) {
            int at = logical.indexOf(anchor);
            List<String> out = new ArrayList<>();
            for (int i = at + 1; i >= 0 && i < logical.size() && out.size() < window; i++) out.add(logical.get(i));
            return out;
        }

        void answer(String key) {
            long gen = ++generation;
            if (confuseNext) {
                confuseNext = false;
                // The shape a real resolver produces when the UI store no longer holds the item
                // Media3 is on: nothing to offer, and no way to say whether the playlist ended.
                apply(key, new ArrayList<>(), QueueSupervision.Continuation.UNKNOWN, gen);
                return;
            }
            List<String> offered = resolveAfter(key);
            QueueSupervision.Continuation verdict = logical.indexOf(key) + 1 < logical.size()
                ? QueueSupervision.Continuation.CONTINUES
                : QueueSupervision.Continuation.FINISHED;
            apply(key, offered, verdict, gen);
        }

        void apply(String anchor, List<String> offered, QueueSupervision.Continuation verdict, long gen) {
            if (legacy) {
                // Old native side, step 1: anything that was not "continues" meant "finished".
                supervision.continuation(verdict == QueueSupervision.Continuation.UNKNOWN
                    ? QueueSupervision.Continuation.FINISHED : verdict, gen);
            }
            QueueLedger.Plan plan = QueueLedger.reconcile(nativeIds, index, anchor, offered);
            if (!plan.accepted) {
                staleAnswers++;
                // Old native side, step 2: nudge at most twice, then never ask again.
                if (!legacy) supervision.rearm(now);
                return;
            }
            if (!legacy) supervision.continuation(verdict, gen);
            List<String> add = new ArrayList<>(offered.subList(Math.min(plan.trim, offered.size()), offered.size()));
            while (nativeIds.size() > index + 1) nativeIds.remove(nativeIds.size() - 1);
            nativeIds.addAll(add);
            if (add.isEmpty()) {
                // A window that resolved nothing is an answer, not a refill: keep waiting and owe
                // another attempt immediately.
                if (!legacy) supervision.rearm(now);
                return;
            }
            if (ended) {
                index++;
                ended = false;
                played.add(nativeIds.get(index));
                supervision.satisfied();
            } else if (nativeIds.size() - index - 1 > QueueSupervision.LOW_WATER) {
                supervision.satisfied();
            }
        }

        void assertPlayedInOrderOver(int boundaries) {
            assertEquals("every boundary must advance exactly one track", boundaries + 1, played.size());
            for (int i = 0; i < played.size(); i++) {
                assertEquals("track " + i + " played out of order", logical.get(i), played.get(i));
            }
        }
    }

    private static Sim responsive(boolean legacy) {
        Sim sim = new Sim(legacy, 60);
        sim.start();
        return sim;
    }

    @Test
    public void fiftyTrackBoundariesNeverStallWhenTheWebViewAnswers() {
        for (boolean legacy : new boolean[]{true, false}) {
            Sim sim = responsive(legacy);
            for (int i = 0; i < 50; i++) sim.boundary();
            sim.assertPlayedInOrderOver(50);
            assertFalse("a responsive WebView must never leave the session ended (legacy=" + legacy + ")", sim.ended);
        }
    }

    /**
     * A frozen renderer: the window drains, the session must hold instead of reporting a finished
     * playlist, and the answer that arrives two minutes later must resume the exact next track.
     */
    @Test
    public void aTwoMinuteWebViewFreezeIsBridgedInsteadOfEndingTheSession() {
        Sim sim = responsive(false);
        for (int i = 0; i < 5; i++) sim.boundary();

        // The renderer stops running while the tracks already handed over are still playing:
        // those must keep playing, and only the gap after them is a question.
        sim.frozenUntil = sim.now + 120_000L;
        sim.runUntilDrained(20);
        int before = sim.played.size();
        assertTrue("the drained window is a gap, not the end of the playlist", sim.supervision.continues());
        assertTrue(sim.supervision.waiting());
        assertTrue(sim.ended);

        sim.frozenUntil = -1L;
        sim.advanceTo(sim.now + 600_000L);
        assertFalse(sim.ended);
        assertEquals("the gap must be bridged by the very next track",
            sim.logical.get(before), sim.played.get(sim.played.size() - 1));
        assertEquals("no track may be replayed", before + 1, sim.played.size());
    }

    /**
     * The regression that matters: one answer the resolver could not decide must not be able to
     * end a session that still has music in it. The legacy run stops here - which is the user's
     * "it played a few songs and then never continued".
     */
    @Test
    public void anUndecidableAnswerMustNotEndASessionWithMusicLeft() {
        Sim legacy = responsive(true);
        legacy.frozenUntil = legacy.now + 10_000L;
        legacy.runUntilDrained(20);
        assertTrue(legacy.ended);
        legacy.frozenUntil = -1L;
        legacy.confuseNext = true;
        legacy.step();
        legacy.advanceTo(legacy.now + 120_000L);
        legacy.runUntilDrained(20);
        assertTrue("legacy protocol: one undecidable answer ends the session", legacy.ended);
        assertFalse("legacy protocol: and it never asks again", legacy.supervision.continues());

        Sim fixed = responsive(false);
        fixed.frozenUntil = fixed.now + 10_000L;
        fixed.runUntilDrained(20);
        int before = fixed.played.size();
        fixed.frozenUntil = -1L;
        fixed.confuseNext = true;
        fixed.step();
        assertTrue("the session must stay open while it decides", fixed.supervision.continues());
        fixed.advanceTo(fixed.now + 60_000L);
        assertFalse("the session must survive one undecidable answer", fixed.ended);
        assertEquals(before + 1, fixed.played.size());
        for (int i = 0; i < 6; i++) fixed.boundary();
        assertFalse(fixed.ended);
        assertEquals(before + 7, fixed.played.size());
    }

    @Test
    public void aStaleAnchorIsRefusedAndReAskedInsteadOfBeingApplied() {
        Sim sim = responsive(false);
        for (int i = 0; i < 4; i++) sim.boundary();
        sim.index = 6;
        sim.played.add(sim.nativeIds.get(6));
        String current = sim.nativeIds.get(6);
        // The window is built from an item the engine passed two tracks ago: applying it would
        // replay history. It must be refused, and the engine must ask again.
        sim.apply("s2", List.of("s3", "s4"), QueueSupervision.Continuation.CONTINUES, ++sim.generation);
        assertEquals(1, sim.staleAnswers);
        assertEquals("playback position must not move", current, sim.nativeIds.get(sim.index));
        assertTrue(sim.supervision.waiting());
    }

    @Test
    public void aRealPlaylistEndTerminatesAndASlowWindowCannotResurrectIt() {
        Sim sim = new Sim(false, 3);
        sim.start();
        for (int i = 0; i < 2; i++) sim.boundary();
        sim.boundary();
        assertTrue("the last track ends the playlist", sim.ended);
        assertFalse(sim.supervision.continues());
        assertFalse(sim.supervision.waiting());

        // A window from the previous episode arrives late. It cannot declare new music.
        sim.apply("s2", List.of("s3"), QueueSupervision.Continuation.CONTINUES, 2);
        assertFalse(sim.supervision.continues());
    }

    @Test
    public void aUserPauseDuringAGapStopsTheAsking() {
        Sim sim = responsive(false);
        for (int i = 0; i < 3; i++) sim.boundary();
        sim.frozenUntil = sim.now + 60_000L;
        sim.boundary();
        int asksWhileFrozen = sim.asks;
        sim.paused = true;
        sim.now += 300_000L;
        sim.step();
        assertEquals("a paused session must not spend requests", asksWhileFrozen, sim.asks);
        assertFalse(sim.supervision.waiting());
    }
}
