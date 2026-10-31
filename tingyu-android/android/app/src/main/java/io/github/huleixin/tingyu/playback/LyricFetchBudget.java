package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/LyricFetchBudget.java
/**
 * 单首歌取词的时间预算（纯逻辑，可 JVM 直测）。
 *
 * <p>为什么需要它：原生取词对一首歌最多要走四条网络链（LRCLIB get → search → 酷狗 search →
 * 酷狗 download），每条 {@code callTimeout}=14s。唱诗班式的串行下限是「一首歌最坏 56 秒」，
 * 而调度器一次要为「当前曲 + 后两首」取词。实测症状正是这样累积的：几首短歌之后，取词队列
 * 落后播放位置一整首以上，于是**从某一首开始，后面的歌在播放期间始终没词**，直到用户打开
 * App 让前台链路一次性补齐 —— 这就是「播放几首后歌词消失、打开主界面又恢复」。
 *
 * <p>所以每个取词任务都带一个总预算：超预算立即放弃（结论是「这次没取到」，不是「没有词」），
 * 把线程让给队列里更靠后的歌。放弃不写任何负缓存，下一次换歌/重试还能再问。
 */
public final class LyricFetchBudget {

    /** 一首歌一次取词的总预算：比单条超时长，比一首短歌短，保证不会堵住下一首。 */
    public static final long DEFAULT_MS = 20_000L;

    private final long startedAt;
    private final long budgetMs;

    private LyricFetchBudget(long startedAt, long budgetMs) {
        this.startedAt = startedAt;
        this.budgetMs = Math.max(1L, budgetMs);
    }

    public static LyricFetchBudget start(long nowMs) {
        return new LyricFetchBudget(nowMs, DEFAULT_MS);
    }

    /** 测试用：显式给预算。 */
    public static LyricFetchBudget start(long nowMs, long budgetMs) {
        return new LyricFetchBudget(nowMs, budgetMs);
    }

    public long budgetMs() {
        return budgetMs;
    }

    public long elapsed(long nowMs) {
        return Math.max(0L, nowMs - startedAt);
    }

    public boolean expired(long nowMs) {
        return elapsed(nowMs) >= budgetMs;
    }

    public long remaining(long nowMs) {
        return Math.max(0L, budgetMs - elapsed(nowMs));
    }

    /**
     * 下一步还要不要继续。
     *
     * @param stillWanted 这一首是否仍在预取窗口里（或就是当前曲）。队列已经前移过去的任务
     *                    即使还有预算也必须放弃 —— 它的结果没人会用了。
     */
    public boolean allows(long nowMs, boolean stillWanted) {
        return stillWanted && !expired(nowMs);
    }
}
