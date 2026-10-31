package io.github.huleixin.tingyu.playback;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 网络类取词失败重试的**行为协调器** —— 调度、取消、合并、过期都在这一层，
 * 依赖（时钟/线程/当前曲判定）全部注入，可 JVM 全行为单测。
 *
 * 行为契约（真机 2026-10-31 验收第 3 条）：
 * <ul>
 *   <li>失败 → 按间隔调度重试；到点时 {@link Gate} 放行才真正执行任务；</li>
 *   <li>同一首歌的重复失败**合并**为一个挂起重试（后到覆盖先到，先到的作废）；</li>
 *   <li>换歌 / 播放停止 → {@link #cancel} 撤销挂起重试与计数；</li>
 *   <li>任务到点但结果已过期（gate 拒绝：换歌、已拿到词、确认无词）→ 静默放弃，不重发；</li>
 *   <li>次数封顶 {@code delays.length}，之后自动清账，绝不轮询。</li>
 * </ul>
 * 歌词正文、songKey 身份、执行器线程都不经过这里 —— 它只知道「哪首歌还欠一次补问」。
 */
public final class LyricRetryCoordinator {

    /** 时间与线程注入点：生产实现是 {@code mainHandler::postDelayed}，测试用假时钟。 */
    public interface Runner {
        void post(Runnable task, long delayMs);
    }

    /** 到点后的放行闸门：仍是当前曲、Bridge 仍 pending 等都由实现方核对。 */
    public interface Gate {
        boolean allow(String songKey);
    }

    private static final class Pending {
        final Runnable posted;
        final AtomicBoolean stale = new AtomicBoolean(false);
        Pending(Runnable posted) { this.posted = posted; }
    }

    /** 追踪上限（LRU 淘汰）：长后台播放+大面积网络失败的极端组合下，账本不许无界增长。 */
    private static final int MAX_TRACKED = 64;

    private final long[] delays;
    private final Runner runner;
    private final Gate gate;
    private final Map<String, Pending> pending = new LinkedHashMap<String, Pending>(16, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Pending> eldest) {
            return size() > MAX_TRACKED;
        }
    };
    private final Map<String, Integer> attempts = new LinkedHashMap<String, Integer>(16, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Integer> eldest) {
            return size() > MAX_TRACKED;
        }
    };

    public LyricRetryCoordinator(long[] delays, Runner runner, Gate gate) {
        this.delays = delays.clone();
        this.runner = runner;
        this.gate = gate;
    }

    /** 一次网络类失败：为这首歌安排（或重排）一次补问。 */
    public synchronized void onFailure(String songKey, Runnable retryTask) {
        if (songKey == null || songKey.isEmpty()) return;
        int attempt = attempts.getOrDefault(songKey, 0);
        if (attempt >= delays.length) {
            // 封顶：清账。下一次换歌回来它仍是「要准备的那几首」之一，会从零开始。
            attempts.remove(songKey);
            return;
        }
        attempts.put(songKey, attempt + 1);
        long delay = delays[attempt];
        // 合并：同一首歌已挂着一次补问时，作废旧的那次（它跑起来也会被 stale 拦下），再排新的。
        Pending previous = pending.remove(songKey);
        if (previous != null) previous.stale.set(true);
        Pending scheduled = new Pending(retryTask);
        pending.put(songKey, scheduled);
        runner.post(() -> {
            if (scheduled.stale.get()) return;          // 被更新的重试/取消顶掉：什么都不做
            synchronized (this) { pending.remove(songKey); }
            if (gate.allow(songKey)) retryTask.run();   // 过期/换歌/已有词：静默放弃
        }, delay);
    }

    /** 补问已无意义（拿到词了 / 确认无词 / 换歌 / 停止）：撤销挂起重试并清账。 */
    public synchronized void cancel(String songKey) {
        if (songKey == null) return;
        Pending scheduled = pending.remove(songKey);
        if (scheduled != null) scheduled.stale.set(true);
        attempts.remove(songKey);
    }

    /** 该歌是否已有挂起的补问（诊断用）。 */
    public synchronized boolean hasPending(String songKey) {
        return songKey != null && pending.containsKey(songKey);
    }

    /** 已用掉的自动重试次数（诊断用）。 */
    public synchronized int attemptsOf(String songKey) {
        return songKey == null ? 0 : attempts.getOrDefault(songKey, 0);
    }
}
