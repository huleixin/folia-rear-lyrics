package io.github.huleixin.tingyu.playback;

import java.util.concurrent.Executor;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.Supplier;

// Resolve away from Media3's application thread, then fence the result on that thread.
final class PlaybackRecoveryWork {
    static <T> void start(Executor main, Supplier<T> resolve, BooleanSupplier current, Consumer<T> apply) {
        Thread worker=new Thread(()->{
            T result=resolve.get();
            main.execute(()->{if(current.getAsBoolean())apply.accept(result);});
        },"tingyu-quality-recovery");
        worker.setDaemon(true);worker.start();
    }
}
