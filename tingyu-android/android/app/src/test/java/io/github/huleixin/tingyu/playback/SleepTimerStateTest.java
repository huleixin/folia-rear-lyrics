package io.github.huleixin.tingyu.playback;
import org.junit.Test;
import static org.junit.Assert.*;
// android/app/src/test/java/io/github/huleixin/tingyu/playback/SleepTimerStateTest.java
public class SleepTimerStateTest {
 @Test public void fifteenMinutesUsesElapsedClock(){SleepTimerState s=new SleepTimerState();s.start(SleepTimerState.Mode.deadline,900000,100);
  assertFalse(s.tick(900099,true));assertEquals(1,s.remaining(900099));assertTrue(s.tick(900100,true));assertFalse(s.active);assertFalse(s.tick(999999,true));}
 @Test public void cancelAndReplaceInvalidateOldGeneration(){SleepTimerState s=new SleepTimerState();s.start(SleepTimerState.Mode.deadline,900000,0);long first=s.generation;s.cancel();assertTrue(s.generation>first);assertFalse(s.tick(1000000,true));s.start(SleepTimerState.Mode.deadline,1800000,100);assertFalse(s.tick(900000,true));}
 @Test public void trackWaitsForBoundaryAcrossPauseManualSkipAndRepeat(){SleepTimerState s=new SleepTimerState();s.start(SleepTimerState.Mode.track,0,0);assertTrue(s.waiting);assertFalse(s.tick(999999,false));assertTrue(s.boundary());assertFalse(s.boundary());}
 @Test public void delayedTrackModeDoesNotStopAnEarlierSong(){SleepTimerState s=new SleepTimerState();s.start(SleepTimerState.Mode.deadline_track,900000,0);assertFalse(s.boundary());assertFalse(s.tick(900000,true));assertTrue(s.waiting);assertTrue(s.boundary());}
 @Test public void deadlineWhilePausedCompletesWithoutWaiting(){SleepTimerState s=new SleepTimerState();s.start(SleepTimerState.Mode.deadline_track,900000,0);assertTrue(s.tick(900000,false));assertFalse(s.waiting);assertFalse(s.active);}
 @Test public void disabledDoesNotInterceptNormalAutoAdvance(){assertFalse(new SleepTimerState().boundary());}
 @Test public void durationLimits(){for(long duration:new long[]{-1,0,59999,86400001})try{new SleepTimerState().start(SleepTimerState.Mode.deadline,duration,0);fail();}catch(IllegalArgumentException expected){}}
}
