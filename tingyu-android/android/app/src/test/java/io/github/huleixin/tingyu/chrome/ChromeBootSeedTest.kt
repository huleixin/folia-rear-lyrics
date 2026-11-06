package io.github.huleixin.tingyu.chrome

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ChromeBootSeedTest.kt
class ChromeBootSeedTest {
    @Test fun seedsBothBarsOnTheFirstHomeFrame() {
        for (id in listOf("nav", "mini")) {
            assertTrue(ChromeBootSeed.shouldSeed(id, "home", true, false, emptyMap()))
        }
    }

    /** 录屏 68723 的关键回归：启动期先到的 enabled=false 探测包不能取消缓存底栏。 */
    @Test fun anEarlyDisabledPacketNoLongerCancelsTheSeed() {
        for (id in listOf("nav", "mini")) {
            // 包到了但不可见 = live 底栏还没真正出现，seed 必须继续顶着。
            assertTrue(ChromeBootSeed.shouldSeed(id, "home", true, false, mapOf(id to false)))
        }
    }

    @Test fun theFirstEnabledPacketRetiresTheSeed() {
        val live = mapOf("nav" to true, "mini" to false)
        assertFalse(ChromeBootSeed.shouldSeed("nav", "home", true, false, live))
        // mini 还没被真正点亮，仍由 seed 顶着。
        assertTrue(ChromeBootSeed.shouldSeed("mini", "home", true, false, live))
    }

    @Test fun seedsNeverCoverAnotherRouteOrAnOverlay() {
        assertFalse(ChromeBootSeed.shouldSeed("nav", "collection", true, false, emptyMap()))
        assertFalse(ChromeBootSeed.shouldSeed("nav", "settings", true, false, emptyMap()))
        assertFalse(ChromeBootSeed.shouldSeed("nav", "home", false, false, emptyMap()))
        assertFalse(ChromeBootSeed.shouldSeed("nav", "home", true, true, emptyMap()))
    }
}
