package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearHostFrameWaitTest.java
public class RearHostFrameWaitTest {
    @Test public void repeatedCreationAndProbesCannotPostponeFailure(){
        RearHostFrameWait wait=new RearHostFrameWait();
        assertEquals(4500,wait.start(1000));
        assertEquals(3000,wait.start(2500));
        assertEquals(1,wait.start(5499));assertFalse(wait.expired(5499));
        assertTrue(wait.expired(5500));assertEquals(0,wait.start(9000));
    }
    @Test public void collapsedMusicCardHasNoFrameDeadlineAndCanReturnRepeatedly(){
        RearHostFrameWait wait=new RearHostFrameWait();long time=1000;
        for(int trip=0;trip<100;trip++){
            assertEquals(4500,wait.start(time));
            time+=200;wait.stop(); // Native collapse, not feature disable or card removal.
            time+=60_000;assertFalse(wait.expired(time));
            assertEquals(4500,wait.start(time)); // Native expand; first frame gets a fresh budget.
            time+=300;wait.stop(); // Actual READY cancels the watchdog.
            assertFalse(wait.expired(time+4500));
        }
    }
    @Test public void staleTimeoutCannotExpireNewlyExpandedCard(){
        RearHostFrameWait wait=new RearHostFrameWait();wait.start(1000);wait.stop();
        wait.start(5000);assertFalse(wait.expired(5500));assertTrue(wait.expired(9500));
    }
    @Test public void availabilityIsNotTheFirstFrameMilestone(){
        RearHostProgress progress=new RearHostProgress();
        progress.update("card-available","registered, collapsed");
        progress.update("card-collapsed","native navigation");
        assertTrue(progress.describe().contains("milestone=card-available"));
        assertFalse(progress.describe().contains("milestone=ready"));
        progress.update("ready","actual stage draw");
        progress.update("card-available","still retained");
        assertTrue(progress.describe().contains("milestone=ready"));
        for(String event:new String[]{"card-available","card-selected","card-collapsed","card-state","rendering"})assertTrue(RearHostContract.knownEvent(event));
    }
}
