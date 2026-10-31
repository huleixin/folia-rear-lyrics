package io.github.huleixin.tingyu.lsp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * 「窗口证据 → 是否续租」的判定测试。
 *
 * <p>核心约束（需求原文）：true / false / unknown 必须分别处理，<b>不允许</b>把 unknown
 * 无条件当成续租依据。v1.3.59 的写法是 {@code Boolean.TRUE.equals(presence)}，看似保守，
 * 实际因为探测恒为 false 而从不续租 —— 保守的判定救不了一个永远返回 false 的探测。
 */
public class RearWindowRenewPolicyTest {

    private static RearWindowRenewPolicy.Evidence evidence(
            WindowTreeProbe.Presence presence, boolean ownTop, boolean camera) {
        return new RearWindowRenewPolicy.Evidence(presence, ownTop, camera, "test");
    }

    @Test
    public void aPresentWindowRenewsTheLease() {
        RearWindowRenewPolicy.Verdict verdict = RearWindowRenewPolicy.decide(
            evidence(WindowTreeProbe.Presence.PRESENT, false, false), true, 0,
            RearDisplayLease.MAX_WINDOW_RENEWALS);
        assertEquals(RearWindowRenewPolicy.Decision.RENEW, verdict.decision);
        assertEquals("own-window", verdict.reason);
    }

    @Test
    public void ourOwnActivityInFrontRenewsWithoutTheWindowTree() {
        // 第二条独立证据：topRunningActivity 就是我们的界面。
        assertEquals(RearWindowRenewPolicy.Decision.RENEW, RearWindowRenewPolicy.decide(
            evidence(WindowTreeProbe.Presence.UNKNOWN, true, false), true, 0,
            RearDisplayLease.MAX_WINDOW_RENEWALS).decision);
    }

    @Test
    public void unknownIsNeverARenewalBasis() {
        RearWindowRenewPolicy.Verdict verdict = RearWindowRenewPolicy.decide(
            evidence(WindowTreeProbe.Presence.UNKNOWN, false, false), true, 0,
            RearDisplayLease.MAX_WINDOW_RENEWALS);
        assertEquals(RearWindowRenewPolicy.Decision.HOLD, verdict.decision);
        assertTrue(verdict.reason.contains("unknown"));
    }

    @Test
    public void anAbsentWindowStopsRenewingSoThePanelCanSleep() {
        RearWindowRenewPolicy.Verdict verdict = RearWindowRenewPolicy.decide(
            evidence(WindowTreeProbe.Presence.ABSENT, false, false), true, 0,
            RearDisplayLease.MAX_WINDOW_RENEWALS);
        assertEquals(RearWindowRenewPolicy.Decision.STOP, verdict.decision);
        assertEquals("no-window", verdict.reason);
    }

    @Test
    public void aCameraAlwaysWins() {
        assertEquals(RearWindowRenewPolicy.Decision.STOP, RearWindowRenewPolicy.decide(
            evidence(WindowTreeProbe.Presence.PRESENT, true, true), true, 0,
            RearDisplayLease.MAX_WINDOW_RENEWALS).decision);
    }

    @Test
    public void theRenewalCapStopsEvenAPresentWindow() {
        RearWindowRenewPolicy.Verdict verdict = RearWindowRenewPolicy.decide(
            evidence(WindowTreeProbe.Presence.PRESENT, false, false), true,
            RearDisplayLease.MAX_WINDOW_RENEWALS, RearDisplayLease.MAX_WINDOW_RENEWALS);
        assertEquals(RearWindowRenewPolicy.Decision.STOP, verdict.decision);
        assertEquals("renewal-cap", verdict.reason);
    }

    @Test
    public void anExpiredLeaseIsNeverRenewedEvenWithAPresentWindow() {
        // 过期的租约只能由 expire() 收尾：定时器不允许把它悄悄续活。
        RearWindowRenewPolicy.Verdict gone = RearWindowRenewPolicy.decide(
            evidence(WindowTreeProbe.Presence.PRESENT, true, false), false, 1,
            RearDisplayLease.MAX_WINDOW_RENEWALS);
        assertEquals(RearWindowRenewPolicy.Decision.STOP, gone.decision);
        assertEquals("lease-gone", gone.reason);
    }

    @Test
    public void aMissingEvidenceObjectIsTreatedAsUnknownNotAsPresent() {
        RearWindowRenewPolicy.Evidence missing = RearWindowRenewPolicy.Evidence.unknown("probe-failed");
        assertEquals(WindowTreeProbe.Presence.UNKNOWN, missing.presence);
        assertEquals(RearWindowRenewPolicy.Decision.HOLD, RearWindowRenewPolicy.decide(
            missing, true, 0, RearDisplayLease.MAX_WINDOW_RENEWALS).decision);
    }
}
