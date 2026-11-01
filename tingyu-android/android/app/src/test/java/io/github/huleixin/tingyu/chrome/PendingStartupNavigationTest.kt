package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// android/app/src/test/java/io/github/huleixin/tingyu/chrome/PendingStartupNavigationTest.kt
class PendingStartupNavigationTest {
    @Test fun onlyTheLatestValidTabCanBeDeliveredOnce(){
        val pending=PendingStartupNavigation()
        assertTrue(pending.request(3));assertTrue(pending.request(2))
        assertFalse(pending.request(4));assertFalse(pending.request(-1))
        assertEquals(2,pending.take());assertNull(pending.take())
    }
    @Test fun leavingTheActivityClearsUndeliveredIntent(){
        val pending=PendingStartupNavigation();pending.request(1);pending.clear()
        assertNull(pending.take());assertNull(pending.selected)
    }
}
