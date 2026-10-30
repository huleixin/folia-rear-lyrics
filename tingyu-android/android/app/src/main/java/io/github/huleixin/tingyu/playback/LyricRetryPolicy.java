package io.github.huleixin.tingyu.playback;

/**
 * 后台补词重问的判据。
 *
 * 真机问题：Media3 在后台自动切到第二首的那一刻原生缓存里没有它，原生会问一次 WebView；
 * 那一次询问可能落空（监听器正好在重挂、WebView 正在重载、或这一首的词本来就要联网取
 * 几十秒）。只问一次等于「第一次没答上 = 整首没词」，只能等用户打开 App。
 *
 * 这里只决定「还要不要再问」，不负责发事件：三次（首次 + 两次重问）封顶，
 * 且必须仍是同一首、仍然没有时间轴。换歌就作废 —— 不允许变成重试风暴。
 */
public final class LyricRetryPolicy {

    /** 首次询问之后的重问间隔（毫秒）：一次给「监听器重挂」，一次给「联网取词慢」。 */
    public static final long[] RETRY_DELAYS_MS = {3_000L, 9_000L};

    private LyricRetryPolicy() {
    }

    /** 最多问几次（含首次）。 */
    public static int maxAsks() {
        return RETRY_DELAYS_MS.length + 1;
    }

    /**
     * @param expectedKey 发起询问时的那一首
     * @param currentKey  现在真正在播的那一首
     * @param lyricState  当前这一首在原生缓存里的状态（ready / pending / none）
     * @param attempt     已经重问过的次数（0 = 还一次都没重问）
     */
    public static boolean shouldAsk(String expectedKey, String currentKey, String lyricState, int attempt) {
        if (expectedKey == null || expectedKey.isEmpty()) return false;
        if (!expectedKey.equals(currentKey)) return false;
        // ready = 已经有人补上了；none = 这一首确实没有词，再问也是同一个答案。
        if (!"pending".equals(lyricState)) return false;
        return attempt >= 0 && attempt < RETRY_DELAYS_MS.length;
    }

    /** 第 {@code attempt} 次重问之前要等多久；越界返回 -1（不该再问）。 */
    public static long delayFor(int attempt) {
        return attempt >= 0 && attempt < RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attempt] : -1L;
    }
}
