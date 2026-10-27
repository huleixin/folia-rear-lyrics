package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageRows.kt
// Keep a bounded scroll cache. Only crossing a 100-row window asks JS for another memory slice.
internal class NativeRowsCache {
    private val rows=mutableMapOf<Int,NativePageItem>()
    private val requested=mutableSetOf<Int>()
    fun accept(section:NativePageSection){
        section.items.forEachIndexed{index,item->rows[section.offset+index]=item}
        if(rows.size>1200){
            val removed=rows.keys.filter{it<section.offset-500||it>section.offset+600}
            removed.forEach{rows.remove(it);requested.remove(it/100*100)}
        }
    }
    fun get(section:NativePageSection,index:Int):NativePageItem? = section.items.getOrNull(index-section.offset)?:rows[index]
    fun request(index:Int):Boolean=requested.add(index/100*100)
}
@Composable internal fun rememberNativeRows(key:String,section:NativePageSection):NativeRowsCache {
    val cache=remember(key,section.id,section.dataKey){NativeRowsCache()}
    SideEffect{cache.accept(section)}
    return cache
}
