package io.github.huleixin.tingyu.chrome

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/ChromeFrameOrderTest.kt
class ChromeFrameOrderTest {
    @Test fun removedFrameCannotReturnFromDelayedUpdate() {
        val order=ChromeFrameOrder()
        assertTrue(order.accept("mini","one",1,1))
        order.retire("mini","one")
        assertFalse(order.accept("mini","one",1,2))
        assertTrue(order.accept("mini","two",2,1))
    }
    @Test fun lateRemovalCannotRetireNewSession() {
        val order=ChromeFrameOrder()
        assertTrue(order.accept("mini","one",1,1))
        assertTrue(order.accept("mini","two",2,1))
        order.retire("mini","one")
        assertTrue(order.accept("mini","two",2,2))
        assertFalse(order.accept("mini","one",1,99))
    }
    @Test fun olderRevisionAndForeignSessionAreRejected() {
        val order=ChromeFrameOrder()
        assertTrue(order.accept("stage","one",1,5))
        assertFalse(order.accept("stage","one",1,4))
        assertFalse(order.accept("stage","other",1,6))
        assertTrue(order.accept("nav","other",1,1))
    }
}
