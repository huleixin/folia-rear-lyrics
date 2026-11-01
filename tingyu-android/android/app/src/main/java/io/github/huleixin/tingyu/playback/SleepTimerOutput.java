package io.github.huleixin.tingyu.playback;

import java.util.function.Consumer;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/SleepTimerOutput.java
/** Output acknowledgement/ownership only; the existing SleepTimerState owns every deadline. */
public final class SleepTimerOutput {
    public interface Port {
        boolean ready(); boolean playing(); void barrier(boolean enabled);
        void pause(long ticket,Consumer<Boolean> acknowledged);
    }
    private Port port;
    private long ownerRevision,requestRevision;
    public void attach(Port value){port=value;ownerRevision++;}
    public void detach(Port value){if(port==value){port=null;ownerRevision++;}}
    public boolean ready(){return port!=null&&port.ready();}
    public boolean playing(){return port!=null&&port.playing();}
    public void barrier(boolean enabled){if(port!=null)port.barrier(enabled);}
    public void invalidate(){requestRevision++;}
    public void pause(long ticket,Consumer<Boolean> acknowledged){
        Port target=port;long owner=ownerRevision,request=++requestRevision;
        if(target==null){acknowledged.accept(false);return;}
        target.pause(ticket,ok->{if(owner==ownerRevision&&request==requestRevision&&port==target)acknowledged.accept(Boolean.TRUE.equals(ok));});
    }
}
