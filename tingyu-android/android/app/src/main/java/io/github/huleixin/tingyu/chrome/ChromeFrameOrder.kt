package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeFrameOrder.kt
// Retain three small tombstones so a delayed bridge update cannot resurrect removed controls.
class ChromeFrameOrder {
    private data class Stamp(val session: String, val generation: Long, val revision: Long, val retired: Boolean = false)
    private val stamps = mutableMapOf<String,Stamp>()
    fun accept(id: String, session: String, generation: Long, revision: Long): Boolean {
        val old = stamps[id]
        if (old != null && (generation < old.generation || generation == old.generation &&
            (old.retired || session != old.session || revision < old.revision))) return false
        stamps[id] = Stamp(session,generation,revision)
        return true
    }
    fun retire(id: String, session: String) {
        stamps[id]?.takeIf { it.session == session }?.let { stamps[id] = it.copy(retired = true) }
    }
}
