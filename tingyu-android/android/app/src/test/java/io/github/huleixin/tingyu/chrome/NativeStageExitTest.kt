package io.github.huleixin.tingyu.chrome

import org.junit.Assert.*
import org.junit.Test

// Interrupted exits release every route waiter once, and the next exit starts cleanly.
class NativeStageExitTest {
    @Test fun duplicateFinishAndClearAreIdempotent() {
        val exit=NativeStageExit();var replies=0
        exit.begin(null){replies++};exit.begin(null){replies++}
        exit.finish();exit.finish();exit.clear()
        assertEquals(2,replies);assertFalse(exit.active)
        exit.begin(null){replies++};assertFalse(exit.completed)
        exit.clear();assertEquals(3,replies)
    }
}
