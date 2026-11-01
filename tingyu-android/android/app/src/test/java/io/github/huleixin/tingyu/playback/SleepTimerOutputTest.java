package io.github.huleixin.tingyu.playback;

import org.junit.Test;
import java.util.function.Consumer;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/playback/SleepTimerOutputTest.java
public class SleepTimerOutputTest {
    static class Port implements SleepTimerOutput.Port {
        boolean playing=true,barrier;Consumer<Boolean> ack;int pauses;
        public boolean ready(){return true;}public boolean playing(){return playing;}
        public void barrier(boolean enabled){barrier=enabled;}
        public void pause(long ticket,Consumer<Boolean> done){pauses++;ack=done;}
    }
    @Test public void bothKernelsUseTheSameThreeModeDeadlineAndBoundaryPolicy(){
        for(String kernel:new String[]{"media3","compatible"})for(SleepTimerState.Mode mode:SleepTimerState.Mode.values()){
            SleepTimerState state=new SleepTimerState();SleepTimerOutput output=new SleepTimerOutput();Port port=new Port();output.attach(port);
            state.start(mode,60000,100);output.barrier(state.waiting);assertEquals(mode==SleepTimerState.Mode.track,port.barrier);
            boolean stop=mode==SleepTimerState.Mode.track?state.boundary():state.tick(60100,output.playing());
            if(mode==SleepTimerState.Mode.deadline_track){assertFalse(stop);assertTrue(state.waiting);stop=state.boundary();}
            assertTrue(kernel+mode,stop);boolean[] confirmed={false};output.pause(state.generation,ok->confirmed[0]=ok);
            assertFalse(confirmed[0]);port.playing=false;port.ack.accept(true);assertTrue(confirmed[0]);assertEquals(1,port.pauses);assertFalse(state.boundary());
        }
    }
    @Test public void handoffRetainsDeadlineAndIgnoresOldOutputAcknowledgement(){
        SleepTimerState state=new SleepTimerState();state.start(SleepTimerState.Mode.deadline_track,60000,0);long generation=state.generation;
        SleepTimerOutput output=new SleepTimerOutput();Port a=new Port(),b=new Port();output.attach(a);
        int[] completed={0};output.pause(generation,ok->completed[0]++);output.detach(a);output.attach(b);a.ack.accept(true);assertEquals(0,completed[0]);
        assertEquals(60000,state.deadline);assertEquals(generation,state.generation);assertFalse(state.tick(60000,true));assertTrue(state.boundary());
        output.pause(state.generation,ok->completed[0]++);b.ack.accept(true);assertEquals(1,completed[0]);
    }
    @Test public void cancellationAndNewRequestsInvalidateQueuedAcks(){
        SleepTimerOutput output=new SleepTimerOutput();Port port=new Port();output.attach(port);int[] completed={0};
        output.pause(1,ok->completed[0]++);Consumer<Boolean> old=port.ack;output.invalidate();old.accept(true);assertEquals(0,completed[0]);
        output.pause(2,ok->completed[0]++);old.accept(true);assertEquals(0,completed[0]);port.ack.accept(false);assertEquals(1,completed[0]);
    }
    @Test public void missingOrDisconnectedConsumerCannotBeReportedAsPaused(){
        SleepTimerOutput output=new SleepTimerOutput();boolean[] confirmed={true};output.pause(1,ok->confirmed[0]=ok);assertFalse(confirmed[0]);
        Port port=new Port();output.attach(port);output.detach(port);assertFalse(output.ready());assertFalse(output.playing());
    }
}
