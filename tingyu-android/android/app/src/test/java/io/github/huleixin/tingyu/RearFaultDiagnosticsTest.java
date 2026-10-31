package io.github.huleixin.tingyu;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;

import android.view.Display;

import org.junit.Test;

/**
 * 「背屏故障诊断」的分类逻辑测试。
 *
 * <p>被覆盖的真实判读错误：把 {@code Display.STATE_DOZE} 当成「面板熄灭」。系统「背屏息屏」
 * 开启后，背屏进入的正是 DOZE —— 面板是亮的、AOD 盖在上面、歌词不可见。如果诊断把 DOZE
 * 记成 off，报告就会指向「电源没保住」，而真正的原因是「内容被接管」，两条链路的修法完全
 * 不同。所以这里的断言不是文案，是判读口径。
 */
public class RearFaultDiagnosticsTest {

    @Test
    public void offAndDozeAreNeverTheSameAnswer() {
        String off = RearFaultDiagnostics.stateName(Display.STATE_OFF);
        String doze = RearFaultDiagnostics.stateName(Display.STATE_DOZE);
        String suspend = RearFaultDiagnostics.stateName(Display.STATE_DOZE_SUSPEND);
        String on = RearFaultDiagnostics.stateName(Display.STATE_ON);

        assertEquals("off", off);
        assertEquals("doze", doze);
        assertEquals("doze-suspend", suspend);
        assertEquals("on", on);
        assertNotEquals(off, doze);
        assertNotEquals(on, doze);
    }

    @Test
    public void anUnknownDisplayIsSpelledOutInsteadOfGuessed() {
        assertEquals("unknown", RearFaultDiagnostics.stateName(Display.STATE_UNKNOWN));
        assertEquals("state-99", RearFaultDiagnostics.stateName(99));
    }

    @Test
    public void theLockSamplingCoversZeroFiveAndSixtySeconds() {
        // 需求：至少记录锁屏前、锁屏后 5 秒、锁屏后 60 秒。60 秒是租约到期的边界。
        assertEquals(3, RearFaultDiagnostics.LOCK_OFFSETS_MS.length);
        assertEquals(0L, RearFaultDiagnostics.LOCK_OFFSETS_MS[0]);
        assertEquals(5_000L, RearFaultDiagnostics.LOCK_OFFSETS_MS[1]);
        assertEquals(60_000L, RearFaultDiagnostics.LOCK_OFFSETS_MS[2]);
    }

    @Test
    public void theRecordIsBounded() {
        // 上限存在，且足够覆盖 3 个锁屏周期 × 3 个时点 + 手动采样。
        assertEquals(96, RearFaultDiagnostics.MAX_ENTRIES);
    }
}
