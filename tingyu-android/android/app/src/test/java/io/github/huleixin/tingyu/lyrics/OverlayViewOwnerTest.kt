package io.github.huleixin.tingyu.lyrics

import android.view.View
import androidx.lifecycle.*
import androidx.savedstate.findViewTreeSavedStateRegistryOwner
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

// Window teardown must release both Compose owners and their retained view models.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OverlayViewOwnerTest {
    @Test fun attachesAllOwnersAndClearsRetainedResourcesOnClose() {
        val owner = OverlayViewOwner()
        val view = View(RuntimeEnvironment.getApplication())
        var cleared = false
        owner.viewModelStore.put("test", object : ViewModel() { override fun onCleared() { cleared = true } })
        owner.attach(view)
        assertSame(owner, view.findViewTreeLifecycleOwner())
        assertSame(owner, view.findViewTreeViewModelStoreOwner())
        assertSame(owner, view.findViewTreeSavedStateRegistryOwner())
        assertEquals(Lifecycle.State.RESUMED, owner.lifecycle.currentState)
        owner.close()
        assertTrue(cleared)
        assertEquals(Lifecycle.State.DESTROYED, owner.lifecycle.currentState)
    }
}
