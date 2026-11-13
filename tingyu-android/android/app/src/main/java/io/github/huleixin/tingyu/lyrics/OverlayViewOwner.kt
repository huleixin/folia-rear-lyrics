package io.github.huleixin.tingyu.lyrics

import android.view.View
import androidx.lifecycle.*
import androidx.savedstate.*

// WindowManager views have no Activity tree. Own and release all required Compose tree owners.
internal class OverlayViewOwner : LifecycleOwner, ViewModelStoreOwner, SavedStateRegistryOwner {
    private val registry = LifecycleRegistry(this)
    private val controller = SavedStateRegistryController.create(this)
    override val lifecycle: Lifecycle get() = registry
    override val viewModelStore = ViewModelStore()
    override val savedStateRegistry: SavedStateRegistry get() = controller.savedStateRegistry
    init {
        controller.performAttach()
        controller.performRestore(null)
        registry.currentState = Lifecycle.State.CREATED
    }
    fun attach(view: View) {
        view.setViewTreeLifecycleOwner(this)
        view.setViewTreeViewModelStoreOwner(this)
        view.setViewTreeSavedStateRegistryOwner(this)
        registry.currentState = Lifecycle.State.RESUMED
    }
    fun close() {
        registry.currentState = Lifecycle.State.DESTROYED
        viewModelStore.clear()
    }
}
