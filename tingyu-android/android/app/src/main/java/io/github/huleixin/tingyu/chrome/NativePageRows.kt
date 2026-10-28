package io.github.huleixin.tingyu.chrome

import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/NativePageRows.kt
// Keep a bounded scroll cache. Only crossing a 100-row window asks JS for another memory slice.
internal class NativeRowsCache {
    private val rows=mutableMapOf<Int,NativePageItem>()
    private val requested=mutableSetOf<Int>()
    private var owner=""
    private var total=-1
    fun accept(section:NativePageSection){
        if(total!=section.total||section.items.withIndex().any{(i,item)->rows[section.offset+i]?.id?.let{it!=item.id}==true}){
            rows.clear();requested.clear();total=section.total
        }
        section.items.forEachIndexed{index,item->rows[section.offset+index]=item}
        if(rows.size>1200){
            val removed=rows.keys.filter{it<section.offset-500||it>section.offset+600}
            removed.forEach{rows.remove(it);requested.remove(it/100*100)}
        }
    }
    fun get(section:NativePageSection,index:Int):NativePageItem? = section.items.getOrNull(index-section.offset)?:rows[index]
    fun request(index:Int,session:String=""):Boolean {
        // A request sent by a retained/outgoing adapter cannot silence its successor.
        if(owner!=session){owner=session;requested.clear()}
        return requested.add(index/100*100)
    }
}
internal class NativeRowRetention(private val limit:Int=6){
    private val entries=LinkedHashMap<String,NativeRowsCache>()
    fun get(key:String):NativeRowsCache{
        val cache=entries.remove(key)?:NativeRowsCache();entries[key]=cache
        while(entries.size>limit)entries.remove(entries.keys.first())
        return cache
    }
}
private val retainedRows=NativeRowRetention()
@Composable internal fun rememberNativeRows(key:String,section:NativePageSection):NativeRowsCache {
    val cache=remember(key,section.id,section.dataKey){retainedRows.get("$key:${section.id}:${section.dataKey}")}
    SideEffect{cache.accept(section)}
    return cache
}
