package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/SleepTimerState.java
/** Pure monotonic policy. Track-end means the end of whichever item the user is now hearing. */
public final class SleepTimerState {
    public enum Mode { deadline, track, deadline_track }
    public long generation,deadline,duration;
    public Mode mode=Mode.deadline;
    public boolean active,waiting;
    public void start(Mode mode,long duration,long now){
        if(mode!=Mode.track&&(duration<60000||duration>24*3600000L))throw new IllegalArgumentException("duration");
        generation++;this.mode=mode;this.duration=mode==Mode.track?0:duration;
        deadline=mode==Mode.track?0:now+duration;active=true;waiting=mode==Mode.track;
    }
    public void cancel(){generation++;active=false;waiting=false;deadline=0;}
    /** true requests a pause; false can still arm an end-of-item barrier. */
    public boolean tick(long now,boolean playing){
        if(!active||waiting||now<deadline)return false;
        if(mode==Mode.deadline||!playing){cancel();return true;}
        generation++;waiting=true;return false;
    }
    public boolean boundary(){if(!active||!waiting)return false;cancel();return true;}
    public long remaining(long now){return active&&!waiting?Math.max(0,deadline-now):0;}
}
