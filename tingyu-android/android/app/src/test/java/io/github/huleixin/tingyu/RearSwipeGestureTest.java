package io.github.huleixin.tingyu;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/RearSwipeGestureTest.java
// Independent Shizuku/fallback gesture only; system-host navigation is not simulated by this class.
public class RearSwipeGestureTest {
    @Test public void deliberateUpwardGestureFiresOnce(){
        RearSwipeGesture g=new RearSwipeGesture();g.down(150,170,0,320,200);assertTrue(g.move(152,130));assertTrue(g.up(153,80,300));
        g.down(150,170,400,320,200);g.move(150,80);assertFalse(g.up(150,60,600));
    }
    @Test public void shortHorizontalDownwardAndCancelledGesturesDoNotExit(){
        RearSwipeGesture g=new RearSwipeGesture();g.down(150,170,0,320,200);g.move(150,150);assertFalse(g.up(150,150,100));
        g.down(150,170,0,320,200);g.move(230,165);assertFalse(g.up(250,150,200));
        g.down(150,60,0,320,200);assertFalse(g.up(150,160,200));
        g.down(150,170,0,320,200);g.move(150,80);g.cancel();assertFalse(g.up(150,60,200));
    }
    @Test public void systemEdgesAndLongPressAreNotClaimed(){
        RearSwipeGesture g=new RearSwipeGesture();g.down(2,170,0,320,200);assertFalse(g.up(2,40,200));
        g.down(150,170,0,320,200);assertFalse(g.up(150,40,2000));
    }
}
