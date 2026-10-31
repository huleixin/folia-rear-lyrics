package io.github.huleixin.tingyu.lsp;

import org.junit.Test;
import static org.junit.Assert.*;

// android/app/src/test/java/io/github/huleixin/tingyu/lsp/RearDisplayLeaseTest.java
public class RearDisplayLeaseTest {
    @Test public void neverKeepsTheMainOrAnotherDisplayBright() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertFalse(lease.holds(0, 1)); assertFalse(lease.holds(1, 1)); assertTrue(lease.holds(2, 1));
    }
    @Test(expected = IllegalArgumentException.class) public void refusesMainDisplayAcquisition() {
        new RearDisplayLease().acquire(0, "session", 0);
    }
    @Test public void renewalsExtendTheDeadlineWithoutAWakeLoop() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        lease.acquire(2, "session", 20000);
        assertTrue(lease.holds(2, 60000)); assertEquals(-1, lease.expire(60000));
        assertEquals(2, lease.expire(80000)); assertFalse(lease.holds(2, 80000));
    }
    @Test public void aStalledOrCrashedClientReturnsControlToTheSystem() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holds(2, 59999)); assertFalse(lease.holds(2, 60000));
        assertEquals(2, lease.expire(60000)); assertEquals(-1, lease.clear());
        lease.acquire(2, "resumed", 90000); assertEquals(2, lease.clear());
        assertFalse(lease.holds(2, 90001));
    }
    @Test public void stalePauseCleanupCannotReleaseAResumedSession() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "old", 0); lease.acquire(2, "new", 30000);
        assertFalse(lease.release(2, "old")); assertTrue(lease.holds(2, 30001));
        assertTrue(lease.release(2, "new")); assertFalse(lease.holds(2, 30001));
    }
    @Test public void changingRearDisplayDoesNotKeepTheOldOneLeased() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertEquals(2, lease.acquire(3, "session", 1000));
        assertFalse(lease.holds(2, 1001)); assertTrue(lease.holds(3, 1001));
    }
    @Test public void onlyTheLeasedRearLyricsWindowCanStayAwakeWhileLocked() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holdsWindow(2, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, WindowTreeProbe.Presence.PRESENT, false, 1));
        assertFalse(lease.holdsWindow(0, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, WindowTreeProbe.Presence.PRESENT, false, 1));
        assertFalse(lease.holdsWindow(3, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, WindowTreeProbe.Presence.PRESENT, false, 1));
        assertFalse(lease.holdsWindow(2, RearBridgeContract.PACKAGE, RearBridgeContract.PACKAGE + ".MainActivity", WindowTreeProbe.Presence.PRESENT, false, 1));
        assertFalse(lease.holdsWindow(2, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, WindowTreeProbe.Presence.PRESENT, false, 60000));
        lease.release(2, "session");
        assertFalse(lease.holdsWindow(2, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, WindowTreeProbe.Presence.PRESENT, false, 2));
    }

    // --- lock-screen behaviour: locking the main display pushes the keyguard on top of the
    // rear display. The lease must survive that, or "keep the system rear-sleep setting on and
    // still show lyrics" is impossible by construction.

    @Test public void keyguardOnTopDoesNotReleaseTheRearPanel() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holdsWindow(2, "com.android.systemui", "com.android.systemui.keyguard.KeyguardViewMediator", WindowTreeProbe.Presence.PRESENT, false, 1000));
    }
    @Test public void aodLayerOnTopAlsoKeepsThePanel() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holdsWindow(2, "com.miui.aod", "com.miui.aod.AodView", WindowTreeProbe.Presence.PRESENT, false, 1000));
    }
    @Test public void aCameraOnTheRearDisplayAlwaysWins() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertFalse(lease.holdsWindow(2, "com.android.camera", "com.android.camera.Camera", WindowTreeProbe.Presence.PRESENT, false, 1000));
        assertFalse(lease.holdsWindow(2, "com.xiaomi.camera", "com.xiaomi.camera.Camera", WindowTreeProbe.Presence.ABSENT, false, 1000));
    }
    @Test public void aThirdPartyAppOnTopTakesThePanel() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertFalse(lease.holdsWindow(2, "com.example.notes", "com.example.notes.Main", WindowTreeProbe.Presence.PRESENT, false, 1000));
    }
    @Test public void unreadableWindowListStaysConservativeBehindASystemLayer() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        // Reflection could not enumerate windows: keep the panel behind the keyguard...
        assertTrue(lease.holdsWindow(2, "com.android.systemui", "Keyguard", WindowTreeProbe.Presence.UNKNOWN, false, 1000));
        // ...but never in front of a camera or an unknown third-party app.
        assertFalse(lease.holdsWindow(2, "com.android.camera", "Camera", WindowTreeProbe.Presence.UNKNOWN, false, 1000));
        assertFalse(lease.holdsWindow(2, "com.example.notes", "Main", WindowTreeProbe.Presence.UNKNOWN, false, 1000));
    }
    @Test public void keyguardWithoutOurWindowLetsThePanelSleep() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        // Our process died and the window manager removed the window: the lease alone must
        // not keep the panel awake.
        assertFalse(lease.holdsWindow(2, "com.android.systemui", "Keyguard", WindowTreeProbe.Presence.ABSENT, false, 1000));
    }
    @Test public void ourActivityOnTopAlwaysHolds() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holdsWindow(2, RearBridgeContract.PACKAGE, RearBridgeContract.ACTIVITY, WindowTreeProbe.Presence.ABSENT, false, 1000));
    }
    @Test public void windowRenewalCarriesTheLeaseThroughAClientFreeze() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.holds(2, RearDisplayLease.TIMEOUT_MS - 1));
        // The client is frozen, so no acquire() arrives. At 45s the lease is half a timeout
        // from lapsing; the window-based renewal must extend it past a 90s freeze.
        assertTrue(lease.renewForWindow(2, 45_000));
        assertTrue("lease must survive a frozen client", lease.holds(2, 90_000));
    }
    /**
     * v1.3.60：续租闸门从「仅最后半个窗口」改为「每个带正向证据的 tick」。
     *
     * <p>旧闸门与 15 秒的 tick 周期同宽，一次 60 秒的租约里只有一次续租机会 —— 那一次探测
     * 撞上窗口短暂 detach 就足以让整段锁屏再也亮不起来。现在单次失手不再致命，代价只是
     * 续租计数按同样的 15 秒节奏消耗，总时长仍由 MAX_WINDOW_RENEWALS 卡死。
     */
    @Test public void renewalIsAcceptedOnEveryPositiveTick() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertTrue(lease.renewForWindow(2, 15_000));
        assertEquals(1, lease.windowRenewals());
        assertTrue(lease.holds(2, 60_000));
    }
    @Test public void anExpiredLeaseCannotBeRenewedBackToLife() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertFalse("过期的租约只能由 expire() 收尾", lease.renewForWindow(2, RearDisplayLease.TIMEOUT_MS));
        assertFalse(lease.holds(2, RearDisplayLease.TIMEOUT_MS));
    }
    @Test public void renewalIsAbsolutelyCapped() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        long now = 0;
        for (int i = 0; i < RearDisplayLease.MAX_WINDOW_RENEWALS; i++) {
            now += RearDisplayLease.WINDOW_RENEW_MS / 2;
            assertTrue("renewal " + i, lease.renewForWindow(2, now));
            assertTrue(lease.holds(2, now + 1));
        }
        now += RearDisplayLease.WINDOW_RENEW_MS / 2;
        assertFalse("capped after " + RearDisplayLease.MAX_WINDOW_RENEWALS + " renewals", lease.renewForWindow(2, now));
        // 上限到顶后租约仍会自然到期，最终由 expire() 交还给系统。
        assertEquals(2, lease.expire(now + RearDisplayLease.TIMEOUT_MS));
        assertFalse(lease.holds(2, now + RearDisplayLease.TIMEOUT_MS));
    }
    /**
     * 「背屏为什么灭」的一半答案：租约是到期没人续，还是客户端主动放手。
     *
     * <p>没有这一项时，诊断里只剩 {@code lease=none}，无法区分「用户关了歌词」与
     * 「续租链路断了」—— 前者是预期行为，后者是真故障。
     */
    @Test public void theEndReasonIsRecordedForDiagnostics() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertEquals(2, lease.expire(RearDisplayLease.TIMEOUT_MS));
        assertTrue(lease.lastEnd().startsWith("expired after 0 renewals"));

        lease.acquire(2, "session", 0);
        assertTrue(lease.renewForWindow(2, 15_000));
        assertTrue(lease.release(2, "session"));
        assertTrue(lease.lastEnd(), lease.lastEnd().contains("release by client after 1 renewals"));
    }

    @Test public void aFailedExpireDoesNotRewriteTheEndReason() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertEquals(-1, lease.expire(1_000));
        assertEquals("", lease.lastEnd());
    }

    @Test public void aDifferentDisplayIsNeverCoveredByTheLease() {
        RearDisplayLease lease = new RearDisplayLease(); lease.acquire(2, "session", 0);
        assertFalse(lease.holdsWindow(3, "com.android.systemui", "Keyguard", WindowTreeProbe.Presence.PRESENT, false, 1000));
        assertFalse(lease.renewForWindow(3, 45_000));
    }
}
