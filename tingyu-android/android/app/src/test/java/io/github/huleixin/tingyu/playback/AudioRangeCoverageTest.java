package io.github.huleixin.tingyu.playback;

import org.junit.Test;
import static org.junit.Assert.*;

// A gap, prefix, or overrun must never become an offline playable file.
public class AudioRangeCoverageTest {
    @Test public void mergesOverlappingDuplicateAndOutOfOrderReads() {
        AudioRangeCoverage coverage=new AudioRangeCoverage();
        coverage.add(80,100);coverage.add(20,60);coverage.add(30,50);coverage.add(60,80);
        assertFalse(coverage.complete(100));coverage.add(0,20);assertTrue(coverage.complete(100));
        coverage.add(0,100);assertTrue(coverage.complete(100));
    }
    @Test public void rejectsHolesEmptyRangesAndBytesBeyondRepresentation() {
        AudioRangeCoverage coverage=new AudioRangeCoverage();
        coverage.add(-1,100);coverage.add(0,0);coverage.add(100,10);
        assertFalse(coverage.complete(0));assertFalse(coverage.complete(100));
        coverage.add(0,49);coverage.add(50,100);assertFalse(coverage.complete(100));
        coverage.add(49,51);assertTrue(coverage.complete(100));
        coverage.add(100,101);assertFalse(coverage.complete(100));
    }
}
