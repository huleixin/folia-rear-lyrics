package io.github.huleixin.tingyu.coloros;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

// android/app/src/test/java/io/github/huleixin/tingyu/coloros/LyricBridgeConcurrencyTest.java
/**
 * C3 让「谁在写歌词表」这件事变了：以前只有 WebView 插件（主线程）调 {@code setPending}，
 * 现在原生取词线程也会写，而主线程同时还在 {@code buildMetadata} 里 {@code pin} / {@code attach}。
 *
 * <p>表是 access-order 的 {@code LinkedHashMap} —— 连 {@code get} 都会改结构，迭代时被并发
 * 写入就会 {@code ConcurrentModificationException}。这条异常出现在主线程就等于闪退，
 * 而它恰好发生在「点播放 → 发布 metadata → 同时原生第一次取词回来」这个窗口里。
 *
 * <p>所以这张表的读写必须共用同一把锁。这个用例不追求时序确定性，只要求：一组线程并发
 * 读写时，没有任何一个线程抛出异常。
 */
public class LyricBridgeConcurrencyTest {

    @Test
    public void concurrentReadersAndWritersNeverThrow() throws Exception {
        ColorOsLyricBridge.clear();
        final AtomicReference<Throwable> failure = new AtomicReference<>();
        final int writers = 3;
        final int readers = 3;
        final int rounds = 400;
        final CountDownLatch start = new CountDownLatch(1);
        final CountDownLatch done = new CountDownLatch(writers + readers);
        List<Thread> threads = new ArrayList<>();

        for (int w = 0; w < writers; w++) {
            final int seed = w;
            threads.add(new Thread(() -> {
                await(start, failure);
                try {
                    for (int i = 0; i < rounds; i++) {
                        String key = "song-" + seed + "-" + i;
                        // 每写好一首就把它钉成「当前曲」：这正是主线程换歌时的真实动作。
                        ColorOsLyricBridge.setPending("{\"lyric\":\"" + key + "\"}", false, key);
                        ColorOsLyricBridge.pin(key);
                        ColorOsLyricBridge.protectAhead("song-" + seed + "-" + (i + 1));
                    }
                } catch (Throwable error) {
                    failure.compareAndSet(null, error);
                } finally {
                    done.countDown();
                }
            }, "lyric-writer-" + w));
        }
        for (int r = 0; r < readers; r++) {
            final int seed = r;
            threads.add(new Thread(() -> {
                await(start, failure);
                try {
                    for (int i = 0; i < rounds; i++) {
                        String key = "song-" + (seed % writers) + "-" + i;
                        ColorOsLyricBridge.stateOf(key);
                        ColorOsLyricBridge.metadataLyricInfoFor(key);
                        ColorOsLyricBridge.lyricInfoFor(key);
                        ColorOsLyricBridge.hasTranslationFor(key);
                        ColorOsLyricBridge.describe(key);
                    }
                } catch (Throwable error) {
                    failure.compareAndSet(null, error);
                } finally {
                    done.countDown();
                }
            }, "lyric-reader-" + r));
        }
        for (Thread thread : threads) thread.start();
        start.countDown();
        assertTrue("线程未在超时内结束", done.await(30, TimeUnit.SECONDS));
        for (Thread thread : threads) thread.join(5_000L);
        Throwable error = failure.get();
        assertNull("并发读写歌词表时抛出了异常：" + error, error);
        ColorOsLyricBridge.clear();
    }

    private static void await(CountDownLatch latch, AtomicReference<Throwable> failure) {
        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            failure.compareAndSet(null, interrupted);
        }
    }
}
