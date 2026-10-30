package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/SongInfoPublishPolicy.java
/**
 * 「这份异步结果能不能落地」——纯决策，无 Android 依赖，可 JVM 单测。
 *
 * <p>把这条规则从调度器里拆出来，是因为它才是 C2 真正的验收点：
 * <b>发布不依赖 Activity 是否存活、也不依赖 WebView 是否响应</b>，只取决于
 * 「结果属于哪首歌」和「播放器现在在哪首歌」。
 *
 * <p>三种写法必须分开：
 * <ul>
 *   <li>{@code storeTimeline} —— 把时间轴按 songKey 存进原生缓存。**与当前曲无关**：
 *       下一首的词本来就该提前待在表里，换歌那一刻才不用等；</li>
 *   <li>{@code markNoLyric} —— 明确「这首没有词」。只有服务端给出确定答案时才可以；</li>
 *   <li>{@code refreshSession} —— 重建 metadata。**只允许当前曲**，否则上一首迟到的结果
 *       会把卡片改回上一首。</li>
 * </ul>
 */
public final class SongInfoPublishPolicy {

    public static final class Decision {
        public final boolean storeTimeline;
        public final boolean markNoLyric;
        public final boolean refreshSession;
        public final String reason;

        Decision(boolean storeTimeline, boolean markNoLyric, boolean refreshSession, String reason) {
            this.storeTimeline = storeTimeline;
            this.markNoLyric = markNoLyric;
            this.refreshSession = refreshSession;
            this.reason = reason;
        }

        @Override public String toString() {
            return "store=" + storeTimeline + ",none=" + markNoLyric
                    + ",refresh=" + refreshSession + ",reason=" + reason;
        }
    }

    private SongInfoPublishPolicy() {
    }

    /**
     * @param status   仓库结论（CACHE_HIT / FETCHED / NOT_FOUND / RATE_LIMITED / NETWORK / NO_IDENTITY）
     * @param hasTimeline 结果里有没有可用的时间轴
     * @param isCurrent  结果所属的 songKey 是否就是播放器当前曲
     * @param generationMatches 结果产生时的播放代次是否仍是当代
     */
    public static Decision forLyrics(String status, boolean hasTimeline, boolean isCurrent,
                                     boolean generationMatches) {
        if (hasTimeline) {
            if (!generationMatches) {
                // 换代次之后才回来的结果：时间轴本身仍属于它自己那首歌，存进按 key 索引的缓存
                // 不会串词，但绝不能触发 metadata 重建。
                return new Decision(true, false, false, "stale-generation");
            }
            boolean current = isCurrent;
            return new Decision(true, false, current, current ? "current" : "ahead");
        }
        boolean confirmedMissing = "NOT_FOUND".equals(status);
        if (confirmedMissing) {
            // 只有「服务端明确没有」才敢写 noLyric；断网/限流写下去会让这首歌永远显示无词。
            return new Decision(false, true, isCurrent && generationMatches, "confirmed-empty");
        }
        return new Decision(false, false, false, "retryable-failure");
    }

    public static Decision forArtwork(boolean hasBitmap, boolean isCurrent, boolean generationMatches) {
        if (!hasBitmap) return new Decision(false, false, false, "no-bitmap");
        if (!generationMatches) return new Decision(false, false, false, "stale-generation");
        return new Decision(false, false, isCurrent, isCurrent ? "current" : "ahead");
    }
}
