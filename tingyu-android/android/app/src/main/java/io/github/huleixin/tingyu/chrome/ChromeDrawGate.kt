package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/ChromeDrawGate.kt
// Resolve takeover only for the content revision that really reached a draw pass.
internal class ChromeDrawGate {
    private data class Pending(val session: String, val revision: Long, val reply: (Boolean) -> Unit)
    private val pending = mutableMapOf<String, Pending>()
    fun await(id: String, session: String, revision: Long, reply: (Boolean) -> Unit) {
        val previous = pending.put(id, Pending(session, revision, reply))
        previous?.reply?.invoke(false)
    }
    fun waiting(id: String, session: String, revision: Long) =
        pending[id]?.let { it.session == session && it.revision == revision } == true
    fun drawn(id: String, session: String, revision: Long) {
        if (waiting(id, session, revision)) pending.remove(id)?.reply?.invoke(true)
    }
    fun cancel(id: String, session: String? = null) {
        if (session == null || pending[id]?.session == session) pending.remove(id)?.reply?.invoke(false)
    }
    fun clear() { pending.keys.toList().forEach { cancel(it) } }
}
