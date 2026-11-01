package io.github.huleixin.tingyu;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

// android/app/src/main/java/io/github/huleixin/tingyu/NativeHttpDispatcher.java
// Network and artwork waits must never occupy Capacitor's shared plugin thread.
final class NativeHttpDispatcher implements AutoCloseable {
    private final ThreadPoolExecutor executor;
    NativeHttpDispatcher(int workers,int capacity) {
        AtomicInteger serial=new AtomicInteger();
        executor=new ThreadPoolExecutor(workers,workers,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(capacity),work->{
            Thread thread=new Thread(work,"tingyu-native-http-"+serial.incrementAndGet());
            thread.setPriority(Thread.NORM_PRIORITY-1);return thread;
        },new ThreadPoolExecutor.AbortPolicy());
        executor.allowCoreThreadTimeOut(true);
    }
    void execute(Runnable work){executor.execute(work);}
    @Override public void close(){executor.shutdownNow();}
}
