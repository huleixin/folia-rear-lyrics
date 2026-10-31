package io.github.huleixin.tingyu.playback;

/**
 * 网络类取词失败的**慢速有界重试**判据 —— 纯决策，无 Android 依赖。
 *
 * 真机 2026-10-31：小米灵动岛歌词「有些歌有、有些歌整首没有」。链路是：
 * {@code SongInfoLoader.runLyrics} 对当前曲取词失败（LRCLIB 503 / 网络抖动）→ 只记
 * 90 秒冷却，而调度只发生在换歌 → 这首歌整首播放期间 Bridge 里没有时间轴 →
 * metadata 不带 lyricInfo → 灵动岛整首留白。WebView 活着时前台会推词掩盖这个问题，
 * 锁屏/后台（WebView 冻结）就暴露出来 —— 与「有些歌曲正常」完全吻合。
 *
 * 规则：
 * <ul>
 *   <li>NETWORK / EXCEPTION：有限重试（封顶 {@value #MAX_RETRIES} 次），间隔 ≥90s 冷却；</li>
 *   <li>NOT_FOUND：服务端明确说没有词，重问也是同一个答案，不重试；</li>
 *   <li>RATE_LIMITED / NO_IDENTITY：对方刚限过流 / 身份缺失，尊重结论，等下一次换歌；</li>
 *   <li>成功态：无需重试。</li>
 * </ul>
 * 「仍是当前曲、Bridge 仍 pending」两道闸由调用方（{@code SongInfoLoader}）把守，
 * 这里只回答「这次失败该不该再问、隔多久」。
 */
public final class LyricFetchRetryPolicy {

/** 自动重试次数封顶（不含首次）。 */
public static final int MAX_RETRIES = 2;
/** 重试间隔：20s（监听器/网络抖动恢复）+ 60s（LRCLIB 抖动窗口）。
 *  调度时会清掉 90s 失败冷却，所以无需为冷却让路；两枪合计 80s，仍在单首播放窗口内。 */
public static final long[] RETRY_DELAYS_MS = {20_000L, 60_000L};

    public static final class Decision {
        public final boolean retry;
        public final long delayMs;
        public final String reason;

        Decision(boolean retry, long delayMs, String reason) {
            this.retry = retry;
            this.delayMs = delayMs;
            this.reason = reason;
        }

        @Override public String toString() {
            return retry + "@" + delayMs + "ms," + reason;
        }
    }

    private LyricFetchRetryPolicy() {
    }

    /**
     * @param status  仓库/执行结论：FETCHED、CACHE_HIT、NOT_FOUND、RATE_LIMITED、
     *                NO_IDENTITY、NETWORK，或 EXCEPTION（执行时抛了）
     * @param attempt 已自动重试过的次数（0 = 还没重试过）
     * @return retry=true 时 {@code delayMs} 取自 {@link #RETRY_DELAYS_MS}[attempt]
     */
    public static Decision decide(String status, int attempt) {
        if ("NETWORK".equals(status) || "EXCEPTION".equals(status)) {
            if (attempt >= 0 && attempt < RETRY_DELAYS_MS.length) {
                return new Decision(true, RETRY_DELAYS_MS[attempt], "transient-retry-" + (attempt + 1));
            }
            return new Decision(false, -1L, "retries-exhausted");
        }
        // 明确结论不重试：NOT_FOUND 是答案；RATE_LIMITED / NO_IDENTITY 要尊重对方。
        return new Decision(false, -1L, "definitive-" + (status == null ? "unknown" : status));
    }
}
