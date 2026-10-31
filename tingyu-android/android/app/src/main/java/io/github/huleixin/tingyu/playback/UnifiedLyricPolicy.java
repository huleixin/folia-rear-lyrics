package io.github.huleixin.tingyu.playback;

// android/app/src/main/java/io/github/huleixin/tingyu/playback/UnifiedLyricPolicy.java
/**
 * 统一歌词仓库的覆盖裁决（纯函数，便于验证）。
 *
 * <p>三端共用一份歌词数据源后，必须回答「谁有资格改写这首歌的歌词版本」。
 * 层级从高到低：
 * <ol>
 *   <li>{@link #TIER_USER} —— 用户在软件内手动选定的版本（歌词匹配/手动导入）；
 *       一经写入，任何自动链路都不得覆盖；</li>
 *   <li>{@link #TIER_STAGE} —— 前台歌词舞台最终确认的版本（经过取词优先级、
 *       过滤、简繁规则后的全局优先版本）；</li>
 *   <li>{@link #TIER_NATIVE} —— 原生后台独立取词的版本（LRCLIB/酷狗兜底）。</li>
 * </ol>
 *
 * <p>覆盖规则：
 * <ul>
 *   <li>没有旧记录 → 接受（first-record）；</li>
 *   <li>更高层级 → 接受（upgrade）：舞台确认/用户选择覆盖原生取词；</li>
 *   <li>更低层级 → 拒绝（downgrade）：原生取词永远不能盖掉舞台版本——
 *       这正是「打开主界面歌词换版本」的反向保护；</li>
 *   <li>同层级且版本哈希不同 → 接受（refresh）：同源更新；</li>
 *   <li>同层级哈希相同 → 拒绝（identical）：重复发布零成本丢弃。</li>
 * </ul>
 *
 * <p>失败保护在调用方：取词失败（NETWORK / RATE_LIMITED / 异常）**不得**调用本策略
 * 去写任何记录——失败不产生结论；只有拿到了完整时间轴的记录才进仓库。
 */
public final class UnifiedLyricPolicy {

    public static final int TIER_NATIVE = 1;
    public static final int TIER_STAGE = 2;
    public static final int TIER_USER = 3;

    private UnifiedLyricPolicy() {
    }

    /** 层级判定：userChoice 优先，其次看确认来源（stage / native / 其他一律按 native）。 */
    public static int tierOf(boolean userChoice, String confirmedBy) {
        if (userChoice) return TIER_USER;
        return "stage".equals(confirmedBy) ? TIER_STAGE : TIER_NATIVE;
    }

    public static final class Decision {
        public final boolean accept;
        public final String reason;

        Decision(boolean accept, String reason) {
            this.accept = accept;
            this.reason = reason;
        }

        @Override public String toString() {
            return accept + "/" + reason;
        }
    }

    /**
     * @param oldUserChoice 旧记录是否用户选定（无旧记录传 null）
     * @param oldConfirmedBy 旧记录确认来源（无旧记录传 null）
     * @param oldHash       旧记录歌词版本哈希（无旧记录传 null）
     * @param newUserChoice 新记录是否用户选定
     * @param newConfirmedBy 新记录确认来源
     * @param newHash       新记录歌词版本哈希
     */
    public static Decision decide(Boolean oldUserChoice, String oldConfirmedBy, String oldHash,
                                  boolean newUserChoice, String newConfirmedBy, String newHash) {
        if (oldUserChoice == null) {
            return new Decision(true, "first-record");
        }
        int oldTier = tierOf(oldUserChoice, oldConfirmedBy);
        int newTier = tierOf(newUserChoice, newConfirmedBy);
        if (newTier > oldTier) {
            return new Decision(true, "upgrade-tier-" + oldTier + "-to-" + newTier);
        }
        if (newTier < oldTier) {
            return new Decision(false, "downgrade-tier-" + newTier + "-below-" + oldTier);
        }
        boolean sameHash = newHash != null && newHash.equals(oldHash);
        if (sameHash) {
            return new Decision(false, "identical-hash");
        }
        return new Decision(true, "same-tier-refresh");
    }
}
