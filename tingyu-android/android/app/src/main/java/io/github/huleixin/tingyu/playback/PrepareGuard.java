package io.github.huleixin.tingyu.playback;

import java.util.ArrayList;
import java.util.List;

/**
 * JS 的 {@code prepare} 命令对 Media3 队列该做什么，由这个纯逻辑类决定；
 * 引擎只负责执行。
 *
 * <p><b>背景（这是本轮的核心缺陷）：</b>修复前引擎在非 adopt 路径上一律
 * {@code player.setMediaItem(...)}。Media3 的官方语义是 <b>setMediaItem 会清空整个播放
 * 列表</b>。于是只要 WebView 醒来一次、对"当前这首"重新 prepare（同 songKey、同 URL），
 * 原生 continuation-adopt 已经握在手里的下一首就被整锅删掉 —— 逻辑歌单里有下一首、
 * Media3 队列只剩当前曲，播完即 queue-exhausted。
 *
 * <p>三种动作：
 * <ul>
 *   <li>{@link Action#KEEP_WINDOW} 同曲同址的重复 prepare：什么都不换，队列、位置、
 *       已接管的下一首全部保留；</li>
 *   <li>{@link Action#REPLACE_CURRENT} 同曲不同址（URL 刷新）：只换当前这一项的地址
 *       （{@code replaceMediaItem}），队列其余部分保留；</li>
 *   <li>{@link Action#FRESH_SOURCE} 真正换了歌：才允许 {@code setMediaItem} 重建窗口。</li>
 * </ul>
 */
public final class PrepareGuard {

    public enum Action { KEEP_WINDOW, REPLACE_CURRENT, FRESH_SOURCE }

    private PrepareGuard() { throw new AssertionError(); }

    /** 纯判定：当前窗口里活动的歌曲/地址 vs 这次 prepare 请求的歌曲/地址。 */
    public static Action decide(String currentSongKey, String currentUri,
                                String requestedSongKey, String requestedUri) {
        String wantKey = nullToEmpty(requestedSongKey);
        if (wantKey.isEmpty()) return Action.FRESH_SOURCE;
        String haveKey = nullToEmpty(currentSongKey);
        if (!haveKey.equals(wantKey)) return Action.FRESH_SOURCE;
        // 同一首歌。地址相同 = 重复 prepare，绝不能动队列。
        if (nullToEmpty(currentUri).equals(nullToEmpty(requestedUri))) return Action.KEEP_WINDOW;
        // 同一首歌、地址变了 = 前台刷新了 URL：只换当前项，别把下一首一起带走。
        return Action.REPLACE_CURRENT;
    }

    /**
     * 对"窗口模型"应用一次 prepare，返回新的窗口。窗口就是 mediaId 的有序列表，
     * 引擎用它对照真实 Media3 队列执行。这个函数同时是测试里的失败复现器：
     * 旧策略（总是 FRESH_SOURCE）在这里会把下一首弄丢。
     */
    public static List<String> apply(List<String> window, int currentIndex,
                                     String requestedSongKey, String requestedUri,
                                     String replacementSongKey) {
        Action action = decide(
            window != null && currentIndex >= 0 && currentIndex < window.size()
                ? window.get(currentIndex) : "",
            "", // 窗口模型不携带地址；同曲同址由 decide 的重载在引擎侧判定。
            requestedSongKey, requestedUri);
        List<String> out = new ArrayList<>();
        if (window != null) out.addAll(window);
        switch (action) {
            case KEEP_WINDOW:
                return out;
            case REPLACE_CURRENT:
                if (currentIndex >= 0 && currentIndex < out.size()) {
                    out.set(currentIndex, replacementSongKey == null || replacementSongKey.isEmpty()
                        ? out.get(currentIndex) : replacementSongKey);
                }
                return out;
            case FRESH_SOURCE:
            default:
                out.clear();
                if (requestedSongKey != null && !requestedSongKey.isEmpty()) {
                    out.add(requestedSongKey);
                }
                return out;
        }
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
