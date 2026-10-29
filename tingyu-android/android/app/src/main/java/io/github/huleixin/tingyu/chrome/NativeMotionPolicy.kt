package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeMotionPolicy.kt
// Tab replacement has no spatial direction. Only navigation depth moves a page.
internal enum class NativeMotionKind { NONE, TAB, PUSH, POP, STAGE }
internal object NativeMotionPolicy {
    const val Stiffness=520f
    const val Damping=1f // Critically damped: nonlinear deceleration without overshoot.
    private fun root(key:String)=key.startsWith("home:")||key.startsWith("library:")||key.startsWith("search:")||key=="settings:index"
    fun kind(from:String,to:String,back:Boolean,reduced:Boolean):NativeMotionKind=when {
        reduced||from.isEmpty()||from==to->NativeMotionKind.NONE
        root(from)&&root(to)->NativeMotionKind.TAB
        // Stage owns its full-window transition, including playlist/detail return paths.
        // A route key's depth must never add a second horizontal page movement to it.
        from=="stage"||to=="stage"->NativeMotionKind.STAGE
        back->NativeMotionKind.POP
        else->NativeMotionKind.PUSH
    }
}
