package io.github.huleixin.tingyu.lsp;

// android/app/src/main/java/io/github/huleixin/tingyu/lsp/RearWindowRenewPolicy.java
/**
 * 「这一跳该不该替窗口续租」的纯判定。
 *
 * <p>v1.3.59 只有两个分支：{@code Boolean.TRUE.equals(presence)} 才续租，其它一律不续。
 * 问题在于探测本身会把「读不到」误报成 {@code FALSE}（见 {@link WindowTreeProbe}），
 * 于是真正的歌词窗口从来没有续过租。修好遍历之后还要把三种结论分开处理：
 *
 * <ul>
 *   <li>{@code true}（PRESENT）或「本应用 Activity 就在该背屏最前」—— 正向证据，续租；</li>
 *   <li>{@code false}（ABSENT）—— 确定没有我们的窗口，<b>不</b>续租，让面板按系统策略睡；</li>
 *   <li>{@code unknown} —— 结构没读全。**不得**当作续租依据（那是拿未知换常亮），
 *       但也不必立刻判死：保持现状、等待下一个 tick 重新观测。</li>
 * </ul>
 *
 * <p>{@code ownActivityOnTop} 是独立于窗口树的第二条正向证据（来自
 * {@code topRunningActivity}）：它只证明「我们的界面在该背屏最前」，与「窗口树读不读得出」
 * 无关。锁屏后 keyguard 会压在最前面，那时它通常为 false，靠的还是 PRESENT。
 *
 * <p>这里刻意<b>没有</b>「过期后复活」这类分支：过期的租约由 {@link RearDisplayLease#expire}
 * 正常收尾，不允许再被定时器悄悄续命（那会变成一条不受客户端约束的常亮通道）。
 */
final class RearWindowRenewPolicy {

    enum Decision {
        /** 有正向证据且租约仍有效：延长。 */
        RENEW,
        /** 证据为 unknown：不续租，但保持观测（不视为失败）。 */
        HOLD,
        /** 确定没有窗口 / 相机占用 / 额度用尽 / 租约已过期：停止续租。 */
        STOP
    }

    static final class Evidence {
        final WindowTreeProbe.Presence presence;
        final boolean ownActivityOnTop;
        final boolean cameraOnTop;
        final String probeReason;

        Evidence(WindowTreeProbe.Presence presence, boolean ownActivityOnTop, boolean cameraOnTop,
                 String probeReason) {
            this.presence = presence == null ? WindowTreeProbe.Presence.UNKNOWN : presence;
            this.ownActivityOnTop = ownActivityOnTop;
            this.cameraOnTop = cameraOnTop;
            this.probeReason = probeReason == null ? "" : probeReason;
        }

        static Evidence unknown(String reason) {
            return new Evidence(WindowTreeProbe.Presence.UNKNOWN, false, false, reason);
        }

        boolean positive() {
            return presence == WindowTreeProbe.Presence.PRESENT || ownActivityOnTop;
        }

        @Override public String toString() {
            return "presence=" + presence + ",ownTop=" + ownActivityOnTop
                + ",camera=" + cameraOnTop + (probeReason.isEmpty() ? "" : ",why=" + probeReason);
        }
    }

    static final class Verdict {
        final Decision decision;
        final String reason;

        Verdict(Decision decision, String reason) {
            this.decision = decision;
            this.reason = reason;
        }

        @Override public String toString() {
            return decision + "(" + reason + ")";
        }
    }

    /**
     * @param evidence     窗口证据（三值 + Activity 正向证据 + 相机）
     * @param leaseHeld    租约是否仍然有效（未过期）
     * @param renewals     已用续租次数
     * @param maxRenewals  续租上限
     */
    static Verdict decide(Evidence evidence, boolean leaseHeld, int renewals, int maxRenewals) {
        if (evidence.cameraOnTop) return new Verdict(Decision.STOP, "camera-on-top");
        if (renewals >= maxRenewals) return new Verdict(Decision.STOP, "renewal-cap");
        if (!leaseHeld) return new Verdict(Decision.STOP, "lease-gone");
        if (!evidence.positive()) {
            if (evidence.presence == WindowTreeProbe.Presence.ABSENT) {
                // 确定没有我们的窗口：不再续租。这就是「关掉歌词后别把面板常亮」的保证。
                return new Verdict(Decision.STOP, "no-window");
            }
            // unknown：不作为续租依据，但保留观测。
            return new Verdict(Decision.HOLD, "probe-unknown");
        }
        return new Verdict(Decision.RENEW, evidence.ownActivityOnTop
            && evidence.presence != WindowTreeProbe.Presence.PRESENT ? "own-activity" : "own-window");
    }

    private RearWindowRenewPolicy() {}
}
