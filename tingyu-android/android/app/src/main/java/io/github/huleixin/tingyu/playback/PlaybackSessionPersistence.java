package io.github.huleixin.tingyu.playback;

import android.content.Context;
import com.getcapacitor.JSObject;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/PlaybackSessionPersistence.java
/** Passive observer: it never prepares, seeks, pauses, releases or constructs a Media3 player. */
public final class PlaybackSessionPersistence {
    private static PlaybackSessionPersistence instance;
    public static synchronized PlaybackSessionPersistence get(Context c) {
        if(instance==null)instance=new PlaybackSessionPersistence(c.getApplicationContext());
        return instance;
    }
    final ExecutorService io=Executors.newSingleThreadExecutor(r->new Thread(r,"playback-snapshot"));
    PlaybackSnapshotStore store;
    private long lastAt;
    private String lastKey="";
    private boolean lastPaused=true,writeScheduled;
    private final AtomicReference<Sample> latest=new AtomicReference<>();
    /** 播放中位置的落盘间隔：进程被直接终止时最多丢这段时间。 */
    private static final long CHECKPOINT_INTERVAL_MS=4_000L;
    private static final class Sample {
        String key,mode;long position;boolean paused,stopped;
        Sample(String k,long p,boolean pause,String m,boolean stop){key=k;position=p;paused=pause;mode=m;stopped=stop;}
    }
    private PlaybackSessionPersistence(Context c){io.execute(()->store=new PlaybackSnapshotStore(new File(c.getFilesDir(),"playback-session")));}
    public synchronized void observe(String key,long position,boolean paused,String event) {
        if(key==null||key.isEmpty()||"spectrum".equals(event)||"diagnostics".equals(event))return;
        long now=android.os.SystemClock.elapsedRealtime();
        boolean force=!key.equals(lastKey)||paused!=lastPaused||"seeked".equals(event)||"stop".equals(event)||"mode".equals(event);
        if(!force&&(paused||now-lastAt<CHECKPOINT_INTERVAL_MS))return;
        lastAt=now;lastKey=key;lastPaused=paused;
        NativePlaylist.Mode m=NativePlaylist.get().mode();
        String mode=m==NativePlaylist.Mode.SHUFFLE?"shuffle":m==NativePlaylist.Mode.REPEAT_ONE?"one":m==NativePlaylist.Mode.LOOP_ALL?"all":"off";
        if("stop".equals(event)) {
            // Stop is an explicit user intent, never coalesced away by the subsequent seek/pause.
            io.execute(()->{try{store.checkpoint(key,position,true,mode,true);note("stopped",key);}catch(Exception error){note("save-failed",key);}});
            return;
        }
        latest.set(new Sample(key,position,paused,mode,false));
        if(writeScheduled)return;
        writeScheduled=true;
        io.execute(this::flush);
    }
    private void flush() {
        Sample sample=latest.getAndSet(null);
        try{if(sample!=null){boolean saved=store.checkpoint(sample.key,sample.position,sample.paused,sample.mode,sample.stopped);
            note(saved?"cursor-saved":"cursor-skipped-no-queue",sample.key);}}
        catch(Exception error){note("save-failed","");}
        synchronized(this){writeScheduled=false;if(latest.get()!=null){writeScheduled=true;io.execute(this::flush);}}
    }
    static void note(String result,String key){PlaybackDiagnostics.note("session-persistence",new JSObject().put("result",result).put("song",PlaybackDiagnostics.anonKey(key)));}
}
