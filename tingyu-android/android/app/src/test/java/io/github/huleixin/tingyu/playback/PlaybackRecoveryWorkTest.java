package io.github.huleixin.tingyu.playback;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

// The production recovery boundary must never resolve on the player thread or apply a stale result.
public class PlaybackRecoveryWorkTest {
    @Test public void resolvesOffCallerAndAppliesOnTheProvidedThread() throws Exception {
        Thread caller=Thread.currentThread();
        BlockingQueue<Runnable> posted=new LinkedBlockingQueue<>();
        AtomicReference<Thread> resolver=new AtomicReference<>(),applied=new AtomicReference<>();
        AtomicReference<String> value=new AtomicReference<>();
        PlaybackRecoveryWork.start(posted::add,()->{resolver.set(Thread.currentThread());return "authorized-lower-quality";},()->true,result->{applied.set(Thread.currentThread());value.set(result);});
        Runnable callback=posted.poll(5,TimeUnit.SECONDS);assertNotNull(callback);assertNotSame(caller,resolver.get());
        assertNull(value.get());callback.run();assertSame(caller,applied.get());assertEquals("authorized-lower-quality",value.get());
    }
    @Test public void discardedWhenTheSongChangesBeforeReply() throws Exception {
        BlockingQueue<Runnable> posted=new LinkedBlockingQueue<>();AtomicBoolean current=new AtomicBoolean(true),applied=new AtomicBoolean();
        PlaybackRecoveryWork.start(posted::add,()->"late",current::get,result->applied.set(true));
        Runnable callback=posted.poll(5,TimeUnit.SECONDS);assertNotNull(callback);current.set(false);callback.run();assertFalse(applied.get());
    }
}
