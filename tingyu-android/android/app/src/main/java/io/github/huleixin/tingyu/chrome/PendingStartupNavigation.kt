package io.github.huleixin.tingyu.chrome

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/PendingStartupNavigation.kt
// Only idempotent tab destinations can wait for JS. Never replay playback or entity actions.
internal class PendingStartupNavigation {
    var selected:Int?=null
        private set
    fun request(index:Int):Boolean {if(index !in 0..3)return false;selected=index;return true}
    fun take():Int?=selected.also{selected=null}
    fun clear(){selected=null}
}
