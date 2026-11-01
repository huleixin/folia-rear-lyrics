package io.github.huleixin.tingyu;

import java.util.concurrent.*;
import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/NativeHttpDispatcherTest.java
public class NativeHttpDispatcherTest {
    @Test public void stalledNetworkDoesNotBlockTheSharedBridgeQueue() throws Exception {
        ExecutorService bridge=Executors.newSingleThreadExecutor();
        CountDownLatch running=new CountDownLatch(1),release=new CountDownLatch(1);
        try(NativeHttpDispatcher network=new NativeHttpDispatcher(2,4)){
            bridge.submit(()->network.execute(()->{running.countDown();try{release.await();}catch(InterruptedException e){Thread.currentThread().interrupt();}})).get(2,TimeUnit.SECONDS);
            assertTrue(running.await(2,TimeUnit.SECONDS));
            // A navigation call on the same bridge must finish while the HTTP task is still waiting.
            assertEquals("navigation",bridge.submit(()->"navigation").get(2,TimeUnit.SECONDS));
            assertEquals(1,release.getCount());
        }finally{release.countDown();bridge.shutdownNow();}
    }
    @Test public void saturatedQueueRejectsInsteadOfRunningNetworkOnTheCallingThread() throws Exception {
        CountDownLatch running=new CountDownLatch(1),release=new CountDownLatch(1);
        try(NativeHttpDispatcher network=new NativeHttpDispatcher(1,1)){
            network.execute(()->{running.countDown();try{release.await();}catch(InterruptedException e){Thread.currentThread().interrupt();}});
            assertTrue(running.await(2,TimeUnit.SECONDS));network.execute(()->{});
            try{network.execute(()->fail("must not execute on bridge"));fail("expected bounded rejection");}catch(RejectedExecutionException expected){}
        }finally{release.countDown();}
    }
}
