package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativeRouteFence.kt
// A delayed WebView visual-state callback must never reopen a retired destination.
internal data class NativeRouteTicket(val generation:Long,val revision:Long)
internal class NativeRouteFence {
    private var latest=NativeRouteTicket(0,0)
    private var closed=false
    fun request(generation:Long,revision:Long):NativeRouteTicket? {
        if(closed||generation<latest.generation||generation==latest.generation&&revision<latest.revision)return null
        return NativeRouteTicket(generation,revision).also{latest=it}
    }
    fun current(ticket:NativeRouteTicket)=!closed&&latest==ticket
    fun close(){closed=true}
}
internal fun webOwnsRoutePixels(route:String,overlay:Boolean,exiting:Boolean)=
    overlay||exiting||route in setOf("stage","web","settings")
