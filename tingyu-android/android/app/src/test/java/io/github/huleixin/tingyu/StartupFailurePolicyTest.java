package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import io.github.huleixin.tingyu.diagnostics.StartupFailurePolicy;

// android/app/src/test/java/io/github/huleixin/tingyu/StartupFailurePolicyTest.java
/**
 * 连续启动失败判定的边界。这里每一条都对应一种真实场景：
 * 正常走完启动、用户自己退出、系统低内存回收、原生崩溃、ANR、以及 API 30 以下拿不到退出原因。
 *
 * <p>判错的代价不对称：把用户主动退出判成崩溃，会让用户莫名其妙进安全模式；
 * 把真崩溃漏掉，用户就继续闪退。所以两个方向都要有用例。
 */
public class StartupFailurePolicyTest {

    @Test
    public void completedStartupResetsCounter() {
        StartupFailurePolicy.Decision decision =
            StartupFailurePolicy.decide(true, false, 5);
        assertEquals(0, decision.consecutive);
        assertFalse(decision.safeMode);
    }

    @Test
    public void userExitResetsCounter() {
        StartupFailurePolicy.Decision decision =
            StartupFailurePolicy.decide(false, true, 5);
        assertEquals(0, decision.consecutive);
        assertFalse(decision.safeMode);
    }

    @Test
    public void firstIncompleteStartDoesNotEnterSafeMode() {
        StartupFailurePolicy.Decision decision =
            StartupFailurePolicy.decide(false, false, 0);
        assertEquals(1, decision.consecutive);
        assertFalse(decision.safeMode);
    }

    @Test
    public void secondConsecutiveIncompleteStartEntersSafeMode() {
        StartupFailurePolicy.Decision decision =
            StartupFailurePolicy.decide(false, false, 1);
        assertEquals(2, decision.consecutive);
        assertTrue(decision.safeMode);
    }

    @Test
    public void recheckDowngradesUserInitiatedExit() {
        StartupFailurePolicy.Decision pending =
            new StartupFailurePolicy.Decision(2, true);
        StartupFailurePolicy.Decision decision =
            StartupFailurePolicy.recheck(pending, StartupFailurePolicy.EXIT_USER);
        assertEquals(0, decision.consecutive);
        assertFalse(decision.safeMode);
    }

    @Test
    public void recheckDowngradesSystemReclaim() {
        StartupFailurePolicy.Decision pending =
            new StartupFailurePolicy.Decision(2, true);
        StartupFailurePolicy.Decision decision =
            StartupFailurePolicy.recheck(pending, StartupFailurePolicy.EXIT_SYSTEM);
        assertFalse(decision.safeMode);
        assertEquals(0, decision.consecutive);
    }

    @Test
    public void recheckKeepsCrashAndAnr() {
        StartupFailurePolicy.Decision pending =
            new StartupFailurePolicy.Decision(2, true);
        assertTrue(StartupFailurePolicy.recheck(pending, StartupFailurePolicy.EXIT_CRASH).safeMode);
        assertTrue(StartupFailurePolicy.recheck(pending, StartupFailurePolicy.EXIT_ANR).safeMode);
        // API 30 以下拿不到退出原因：宁可进安全模式，也不要继续闪退。
        assertTrue(StartupFailurePolicy.recheck(pending, StartupFailurePolicy.EXIT_UNKNOWN).safeMode);
    }

    @Test
    public void mapsFrameworkExitReasons() {
        assertEquals(StartupFailurePolicy.EXIT_CRASH, StartupFailurePolicy.classifyExitReason(4));
        assertEquals(StartupFailurePolicy.EXIT_CRASH, StartupFailurePolicy.classifyExitReason(5));
        assertEquals(StartupFailurePolicy.EXIT_ANR, StartupFailurePolicy.classifyExitReason(6));
        assertEquals(StartupFailurePolicy.EXIT_USER, StartupFailurePolicy.classifyExitReason(10));
        assertEquals(StartupFailurePolicy.EXIT_USER, StartupFailurePolicy.classifyExitReason(11));
        assertEquals(StartupFailurePolicy.EXIT_SYSTEM, StartupFailurePolicy.classifyExitReason(3));
        assertEquals(StartupFailurePolicy.EXIT_SYSTEM, StartupFailurePolicy.classifyExitReason(14));
        // REASON_OTHER（13）归到系统侧：宁可漏一次安全模式，也不要把厂商的杂项终止判成启动崩溃。
        assertEquals(StartupFailurePolicy.EXIT_SYSTEM, StartupFailurePolicy.classifyExitReason(13));
        assertEquals(StartupFailurePolicy.EXIT_UNKNOWN, StartupFailurePolicy.classifyExitReason(0));
    }
}
